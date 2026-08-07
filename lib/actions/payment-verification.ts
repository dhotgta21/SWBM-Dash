'use server'

import { normalizeSignatureName } from '@/lib/signature'
import { verifyOperatorPassword } from '@/lib/actions/operator-verification'

type SupabaseUserClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

/**
 * Authorise recording a direct invoice payment.
 *
 * Re-auth factor: the operator's **login password** (same as sign-in),
 * verified via Supabase Auth with an isolated session-less client.
 * Signature / verified_name is stamped server-side from profiles.full_name
 * by the payment action (not typed in the dialog).
 */
export async function verifyPaymentAction(
  supabase: SupabaseUserClient,
  userId: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password) {
    return { ok: false, error: 'Password is required to record a payment.' }
  }

  const verified = await verifyOperatorPassword(supabase, userId, password)
  if (!verified.ok) {
    return { ok: false, error: verified.error }
  }

  return { ok: true }
}

/** Re-export for callers that only need the name normaliser. */
export { normalizeSignatureName }
