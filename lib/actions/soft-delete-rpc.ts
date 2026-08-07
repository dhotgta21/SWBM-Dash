'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOperatorPassword } from '@/lib/actions/operator-verification'
import type { createClient } from '@/lib/supabase/server'

type UserClient = Awaited<ReturnType<typeof createClient>>

type SoftDeleteFn =
  | 'soft_delete_client'
  | 'soft_delete_product'
  | 'soft_delete_invoice'
  | 'soft_delete_payment'
  | 'restore_client'
  | 'restore_product'
  | 'restore_invoice'

type DeletionResult = {
  success: boolean
  error_code: string | null
  message: string
}

/**
 * After login-password re-auth, call soft-delete / restore RPCs with the
 * service-role client. Migration 163 revokes EXECUTE from `authenticated`,
 * so a stolen browser session cannot soft-delete with a dummy p_password.
 *
 * p_password is a fixed sentinel (not the real login password) so the
 * plaintext credential never enters Postgres.
 */
export async function reauthThenSoftDeleteRpc(
  supabase: UserClient,
  userId: string,
  loginPassword: string,
  fn: SoftDeleteFn,
  args: Record<string, unknown>
): Promise<{ ok: true; result: DeletionResult } | { ok: false; error: string }> {
  if (!loginPassword) {
    return { ok: false, error: 'Password is required.' }
  }

  const reauth = await verifyOperatorPassword(supabase, userId, loginPassword)
  if (!reauth.ok) {
    return { ok: false, error: reauth.error }
  }

  const admin = createAdminClient()
  // p_operator_id is added in migration 163; types may lag until regen.
  const { data, error } = await (admin as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: DeletionResult | null; error: { message?: string } | null }>
  }).rpc(fn, {
    ...args,
    p_password: 'reauth',
    p_operator_id: userId,
  })

  if (error) {
    console.error(`reauthThenSoftDeleteRpc ${fn} error:`, error)
    return { ok: false, error: error.message || 'Could not complete the protected action.' }
  }

  if (!data) {
    return { ok: false, error: 'Could not complete the protected action.' }
  }

  return { ok: true, result: data }
}
