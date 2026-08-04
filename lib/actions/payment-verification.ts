'use server'

import { normalizeSignatureName } from '@/lib/signature'

type SupabaseUserClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

/**
 * Authorise recording a direct invoice payment.
 *
 * Two factors, both bound to the currently signed-in operator:
 *   1. Signature name — optional on the form for direct payments (prefilled);
 *      when provided it is normalised for the audit column.
 *   2. Payment password — the operator's dedicated password in user_security
 *      (Settings → Security → Payments), verified via RPC. NOT the login
 *      password and NOT the client-account / deletion passwords.
 *
 * Fail-closed: if the operator has not set a payment password yet, reject
 * with a clear message pointing at Settings → Security.
 */
export async function verifyPaymentAction(
  supabase: SupabaseUserClient,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password) {
    return { ok: false, error: 'Payment password is required to record a payment.' }
  }

  const { data: hasPassword, error: hasError } = await supabase.rpc('has_payment_password')
  if (hasError) {
    console.error('verifyPaymentAction has_payment_password error:', hasError)
    return { ok: false, error: 'Could not verify the payment password.' }
  }
  if (hasPassword !== true) {
    return {
      ok: false,
      error:
        'No payment password is set. Set one in Settings → Security → Payments before recording payments.',
    }
  }

  const { data: ok, error } = await supabase.rpc('verify_payment_password', {
    p_password: password,
  })

  if (error) {
    console.error('verifyPaymentAction RPC error:', error)
    return { ok: false, error: 'Could not verify the payment password.' }
  }

  if (ok !== true) {
    return {
      ok: false,
      error: 'Incorrect payment password. Set or change it in Settings → Security → Payments.',
    }
  }

  return { ok: true }
}

/** Re-export for callers that only need the name normaliser. */
export { normalizeSignatureName }
