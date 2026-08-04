'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/ip'

const FIRST_ADMIN_IP_LIMIT_MAX = 5
const FIRST_ADMIN_IP_LIMIT_WINDOW_MS = 15 * 60_000

/**
 * Register the first admin account. Demo package: no captcha, confirmed
 * email via service role, session via generateLink (never password grant).
 */
export async function registerFirstAdmin(
  formData: FormData
): Promise<{ ok?: boolean; requiresConfirmation?: boolean; error?: string }> {
  const fullName = (formData.get('fullName') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!fullName || !email || !password) {
    return { error: 'All fields are required.' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }
  if (password.length > 128) {
    return { error: 'Password is too long (max 128 characters).' }
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const headersList = await headers()
  const ip = getClientIp(headersList)
  const supabase = await createClient()

  const rl = await rateLimit(
    supabase,
    `register-first-admin-ip:${ip}`,
    FIRST_ADMIN_IP_LIMIT_MAX,
    FIRST_ADMIN_IP_LIMIT_WINDOW_MS,
    { failOpen: false }
  )
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  const adminClient = createAdminClient()
  const { count, error: countError } = await adminClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('registerFirstAdmin: profile count error:', countError)
    return { error: 'Could not verify registration status. Please try again later.' }
  }
  if ((count ?? 0) > 0) {
    return { error: 'An admin already exists. Please ask them to promote you in Settings.' }
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (createErr || !created.user) {
    console.error('registerFirstAdmin: createUser error:', createErr)
    return { error: 'Could not create account. Please try again later.' }
  }

  // Never use password grant (CAPTCHA). Mint session via admin magic link.
  try {
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    const tokenHash = linkData?.properties?.hashed_token
    if (linkError || !tokenHash) {
      console.error('registerFirstAdmin: generateLink failed:', linkError)
      return {
        error:
          'Account was created but automatic sign-in failed. Sign in at /admin-login with the same email and password.',
      }
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    })
    if (verifyError) {
      const retry = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      })
      if (retry.error) {
        console.error('registerFirstAdmin: verifyOtp failed:', verifyError, retry.error)
        return {
          error:
            'Account was created but automatic sign-in failed. Sign in at /admin-login with the same email and password.',
        }
      }
    }
  } catch (mintErr) {
    console.error('registerFirstAdmin: session mint unexpected:', mintErr)
    return {
      error:
        'Account was created but automatic sign-in failed. Sign in at /admin-login with the same email and password.',
    }
  }

  const claimResult = await claimFirstAdminForUser(created.user.id)
  if (claimResult.error) {
    try {
      await adminClient.auth.admin.deleteUser(created.user.id)
    } catch (cleanupErr) {
      console.error('registerFirstAdmin: failed to clean up unclaimed account:', cleanupErr)
    }
    return claimResult
  }
  return claimResult
}

/**
 * Promote the currently signed-in user to admin if the database has no
 * admins yet.
 */
export async function claimFirstAdmin(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'You must be signed in to claim admin access.' }
  }

  const rl = await rateLimit(supabase, `claim-first-admin:${user.id}`, 5, 60 * 60_000, {
    failOpen: false,
  })
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  return claimFirstAdminForUser(user.id)
}

async function claimFirstAdminForUser(userId: string): Promise<{ ok?: boolean; error?: string }> {
  let adminClient
  try {
    adminClient = createAdminClient()
  } catch (adminClientErr) {
    console.error('claimFirstAdmin: missing admin credentials:', adminClientErr)
    return {
      error:
        'Server is missing the Supabase service-role key, so the first admin cannot be promoted automatically. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) and try again.',
    }
  }

  const { data: claimed, error: rpcError } = await (
    adminClient.rpc as unknown as (
      fn: string,
      args: { p_user_id: string }
    ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>
  )('claim_first_admin', { p_user_id: userId })

  if (rpcError) {
    console.error('claim_first_admin RPC error:', rpcError)
    // Demo fallback: direct profile promote when RPC is missing on partial schema.
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({ role: 'admin', is_active: true })
      .eq('id', userId)
    if (updateError) {
      return { error: 'Could not promote to admin. Please try again later.' }
    }
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  if (!claimed) {
    return { error: 'An admin already exists. Please ask them to promote you in Settings.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
