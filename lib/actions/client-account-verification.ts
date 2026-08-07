'use server'

import { normalizeSignatureName } from '@/lib/signature'
import { verifyOperatorPassword } from '@/lib/actions/operator-verification'

type SupabaseUserClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

/**
 * Authorise a money-moving action on a client's account.
 *
 * Re-auth factor: the operator's **login password** (same as sign-in).
 * Audit name is stamped from profiles.full_name when present (not typed).
 */
export async function verifyClientAccountAction(
  supabase: SupabaseUserClient,
  userId: string,
  password: string
): Promise<
  | { ok: true; verifiedName: string | undefined }
  | { ok: false; error: string }
> {
  if (!password) {
    return { ok: false, error: 'Password is required.' }
  }

  const verified = await verifyOperatorPassword(supabase, userId, password)
  if (!verified.ok) {
    return { ok: false, error: verified.error }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  const fullName = profile?.full_name?.trim()
  const verifiedName = fullName ? normalizeSignatureName(fullName) : undefined

  return { ok: true, verifiedName }
}
