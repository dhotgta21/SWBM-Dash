'use server'

import { normalizeSignatureName } from '@/lib/signature'

type SupabaseUserClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

/**
 * Authorise a money-moving action on a client's account.
 *
 * Two factors, both bound to the currently signed-in operator:
 *   1. Username — the operator's profile name in underscore form
 *      (e.g. "Andrew Smith" -> "Andrew_Smith"). It must be typed (never
 *      pre-filled) and is checked against profiles.full_name.
 *   2. Client-account password — the operator's OWN dedicated password
 *      (separate from login and from the deletion password), verified as a
 *      bcrypt hash in the locked-down user_security table via RPC.
 *
 * Fail-closed: if the operator has no full_name, or has not set a client-
 * account password yet, the action is rejected with a clear message.
 */
export async function verifyClientAccountAction(
  supabase: SupabaseUserClient,
  userId: string,
  typedName: string | null | undefined,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  const fullName = profile?.full_name?.trim()
  if (!fullName) {
    return {
      ok: false,
      error: 'Your account has no name set. Add your name in Account settings before managing client accounts.',
    }
  }

  const expected = normalizeSignatureName(fullName)
  const provided = normalizeSignatureName((typedName ?? '').trim())

  if (!provided || provided !== expected) {
    return {
      ok: false,
      error: `Username does not match your account name. Use the underscore form, e.g. ${expected}.`,
    }
  }

  if (!password) {
    return { ok: false, error: 'Client account password is required.' }
  }

  const { data: ok, error } = await supabase.rpc('verify_client_account_password', {
    p_password: password,
  })

  if (error) {
    console.error('verifyClientAccountAction RPC error:', error)
    return { ok: false, error: 'Could not verify the client account password.' }
  }

  if (ok !== true) {
    return {
      ok: false,
      error: 'Incorrect client account password. Set or change it in Settings → Security.',
    }
  }

  return { ok: true }
}
