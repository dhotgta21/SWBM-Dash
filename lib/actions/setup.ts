'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { getTurnstileToken } from '@/lib/turnstile'
import { getClientIp } from '@/lib/ip'
import { shouldBypassCaptcha } from '@/lib/demo/mode'

const FIRST_ADMIN_IP_LIMIT_MAX = 5
const FIRST_ADMIN_IP_LIMIT_WINDOW_MS = 15 * 60_000

/**
 * Register the first admin account. This is the bootstrap path that is only
 * available while no profiles exist. It performs server-side sign-up so that
 * Cloudflare Turnstile and per-IP rate limiting can be enforced before an auth
 * user is created.
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

  // Demo mode: no captcha, no confirmation email. Create a confirmed admin
  // via service role so the sales demo only needs Supabase.
  if (shouldBypassCaptcha()) {
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
      console.error('registerFirstAdmin (demo): createUser error:', createErr)
      return { error: 'Could not create account. Please try again later.' }
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr) {
      // When Attack Protection CAPTCHA is still on, password grant fails even
      // though the user was just created. Mint a session via admin magic link
      // (password already set on the account we created).
      console.error('registerFirstAdmin (demo): sign-in error, trying session mint:', signInErr)
      try {
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email,
        })
        const tokenHash = linkData?.properties?.hashed_token
        if (linkError || !tokenHash) {
          console.error('registerFirstAdmin (demo): generateLink failed:', linkError)
          return {
            error:
              'Account was created but automatic sign-in failed. Turn Supabase CAPTCHA off (Authentication → Attack Protection), then sign in with the same email and password.',
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
            console.error('registerFirstAdmin (demo): verifyOtp failed:', verifyError, retry.error)
            return {
              error:
                'Account was created but automatic sign-in failed. Turn Supabase CAPTCHA off, then sign in at /admin-login.',
            }
          }
        }
      } catch (mintErr) {
        console.error('registerFirstAdmin (demo): session mint unexpected:', mintErr)
        return {
          error:
            'Account was created but automatic sign-in failed. Sign in with the same email and password.',
        }
      }
    }

    const claimResult = await claimFirstAdminForUser(created.user.id)
    if (claimResult.error) {
      try {
        await adminClient.auth.admin.deleteUser(created.user.id)
      } catch (cleanupErr) {
        console.error('registerFirstAdmin (demo): failed to clean up unclaimed account:', cleanupErr)
      }
      return claimResult
    }
    return claimResult
  }

  // Pass the Turnstile token to Supabase Auth so Attack Protection can verify
  // it at the auth API level.
  const captchaToken = getTurnstileToken(formData)
  if (!captchaToken) {
    return { error: 'Please complete the security check.' }
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

  // Confirm the database still has zero profiles. This closes the bootstrap
  // window as soon as the first admin is created. MUST use the admin client:
  // the profiles SELECT policy is TO authenticated, so an anonymous caller
  // (this flow runs pre-auth) sees zero rows through the user client and the
  // seal would never trip — allowing unauthenticated staff signups.
  const adminClient = await createAdminClient()
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

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      captchaToken,
    },
  })

  if (signUpError) {
    console.error('registerFirstAdmin: sign-up error:', signUpError)
    return { error: 'Could not create account. Please try again later.' }
  }

  if (!signUpData.session) {
    // Email confirmation is enabled. The user must confirm before claiming admin.
    return { ok: true, requiresConfirmation: true }
  }

  const user = signUpData.user
  if (!user) {
    return { error: 'Account was created but user details are missing. Please sign in.' }
  }

  const claimResult = await claimFirstAdminForUser(user.id)
  if (claimResult.error) {
    // Defence in depth: if the claim failed (e.g. another request won the
    // bootstrap race), the just-created account must not persist as a
    // default-role staff user. Best-effort cleanup; ignore failures.
    try {
      const cleanupClient = await createAdminClient()
      await cleanupClient.auth.admin.deleteUser(user.id)
    } catch (cleanupErr) {
      console.error('registerFirstAdmin: failed to clean up unclaimed account:', cleanupErr)
    }
    return claimResult
  }

  return claimResult
}

/**
 * Promote the currently signed-in user to admin if the database has no
 * admins yet. This is the in-app first-admin bootstrap path for a user who
 * already has a session (e.g. via the FirstAdminPrompt).
 *
 * Safe to expose because the underlying DB function is advisory-locked and
 * permanently no-ops once any admin exists.
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

  // Rate limit per user. Bootstrap is a one-time operation; 5 attempts per
  // hour is generous for retries while preventing noise.
  const rl = await rateLimit(supabase, `claim-first-admin:${user.id}`, 5, 60 * 60_000, {
    failOpen: false,
  })
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  return claimFirstAdminForUser(user.id)
}

async function claimFirstAdminForUser(userId: string): Promise<{ ok?: boolean; error?: string }> {
  // Use the service role so the bootstrap update can bypass the
  // "only admins may change role" trigger during the setup window.
  let adminClient
  try {
    adminClient = await createAdminClient()
  } catch (adminClientErr) {
    console.error('claimFirstAdmin: missing admin credentials:', adminClientErr)
    return {
      error:
        'Server is missing the Supabase service-role key, so the first admin cannot be promoted automatically. Set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) and try again.',
    }
  }

  const { data: claimed, error: rpcError } = await (adminClient.rpc as unknown as (
    fn: string,
    args: { p_user_id: string }
  ) => Promise<{ data: boolean | null; error: { message: string; code?: string } | null }>)(
    'claim_first_admin',
    { p_user_id: userId }
  )

  if (rpcError) {
    console.error('claim_first_admin RPC error:', rpcError)
    return { error: 'Could not promote to admin. Please try again later.' }
  }

  if (!claimed) {
    return { error: 'An admin already exists. Please ask them to promote you in Settings.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
