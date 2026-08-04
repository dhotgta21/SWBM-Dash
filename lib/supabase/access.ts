// Shared server-only helpers used by lib/actions/* and app/api/* routes.
// Keep this file small and free of business logic — it's the one place
// "is the current user an admin?" / "does this user own this row?" are
// answered consistently, so we never accidentally let one path skip a check
// another path enforces.

import { createClient } from '@/lib/supabase/server'
import { resolveStaffPermissions } from '@/lib/auth/permissions'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

/**
 * Returns true when the given user id is an admin profile.
 *
 * SECURITY: this reads `profiles.role` for the supplied id, not the
 * `auth.uid()` of the caller's session. It is intentionally keyed on
 * the userId parameter so server actions can answer "is *this* user
 * an admin?" without re-querying auth. Callers that want the caller's
 * own role should pass `user.id` from their `auth.getUser()` result.
 */
export async function isAdminUser(
  supabase: ServerSupabase,
  userId: string
): Promise<boolean> {
  if (!userId) return false
  const { data, error } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // RLS / connection errors should never silently grant admin. Fail
    // closed: the caller treats this as "not admin" and the authorization
    // branch they wrap this in will reject the request.
    console.error('isAdminUser: profiles lookup failed:', error.message)
    return false
  }
  // Demo picker/driver emails must never receive admin privileges even if
  // profiles.role was corrupted to 'admin' (legacy promote-on-login bug).
  const email = (data?.email ?? '').toLowerCase()
  if (email === 'picker@demo-builder.com' || email === 'driver@demo-builder.com') {
    return false
  }
  return data?.role === 'admin'
}

/**
 * Verifies the given user owns the given invoice (created_by === userId)
 * or is an admin. Returns the invoice row on success, or null on a
 * miss / unauthorized. Use this from every server action / API route
 * that operates on a specific invoice — it's the only way to keep the
 * "you can only act on your own invoices" rule consistent across the
 * dashboard, server actions, and API routes.
 */
/**
 * Returns true when the user is an admin OR is a staff member explicitly
 * granted the `settings_edit_company` permission.
 */
export async function requireCompanyEditPermission(
  supabase: ServerSupabase,
  userId: string
): Promise<boolean> {
  if (!userId) return false

  const admin = await isAdminUser(supabase, userId)
  if (admin) return true

  const { data, error } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    console.error('requireCompanyEditPermission: profiles lookup failed:', error?.message)
    return false
  }

  const perms = resolveStaffPermissions(data.role, data.permissions)
  return perms.settings_edit_company === true
}

export async function requireInvoiceAccess(
  supabase: ServerSupabase,
  invoiceId: string,
  userId: string
): Promise<{ ok: true; invoice: { id: string; created_by: string; type: string; status: string; total: number; amount_paid: number; public_share_enabled: boolean | null; share_token: string | null } } | { ok: false; reason: 'not_found' | 'forbidden' }> {
  if (!invoiceId || !userId) return { ok: false, reason: 'not_found' }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, created_by, type, status, total, amount_paid, public_share_enabled, share_token')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !invoice) return { ok: false, reason: 'not_found' }

  if (invoice.created_by !== userId) {
    const admin = await isAdminUser(supabase, userId)
    if (!admin) return { ok: false, reason: 'forbidden' }
  }

  return { ok: true, invoice }
}
