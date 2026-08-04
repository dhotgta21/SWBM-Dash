'use server'

// Server actions for admin-level team management. An existing admin
// can promote a 'staff' user to 'admin' or demote an 'admin' back to
// 'staff'. The demote path goes through public.demote_from_admin(),
// which has a "don't lock yourself out" guard (refuses to demote the
// last admin).
//
// All actions:
//   * require the caller to be authenticated
//   * require the caller to be an admin (lib/supabase/access.isAdminUser)
//   * do not leak whether the target email exists in the system
//     (a non-admin probing emails gets the same error as an internal
//     failure)

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'

const UuidSchema = z.string().uuid()

/**
 * Promote a user to admin. The caller MUST be an admin already —
 * the action runs no side effects if not.
 *
 * Returns `{ ok: true }` on success, or `{ error: string }` on any
 * failure (auth, validation, not found, db error). The error message
 * is sanitised so it does not leak schema details.
 */
export async function promoteToAdmin(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Per-user rate limit: 10 promotions per hour per caller. Plenty for
  // a real admin onboarding a team; tight enough that a hijacked
  // session can't quietly mass-promote.
  const rl = await rateLimit(supabase, `promote:${user.id}`, 10, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many actions. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Not authorized' }
  }

  const parsed = UuidSchema.safeParse(formData.get('userId'))
  if (!parsed.success) {
    return { error: 'Invalid user.' }
  }
  const targetUserId = parsed.data

  // Prevent self-promotion (already admin, but belt-and-braces).
  if (targetUserId === user.id) {
    return { error: 'You are already an admin.' }
  }

  // Refuse to promote non-staff accounts. Promoting a client (or a profileless
  // user) would grant them full admin access.
  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()
  if (targetError) {
    return { error: safeActionError('team.promoteToAdmin.lookup', targetError, 'Could not look up the user.') }
  }
  if (!targetProfile) {
    return { error: 'No user found.' }
  }
  if (targetProfile.role !== 'staff') {
    return { error: 'Only staff accounts can be promoted to admin.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', targetUserId)

  if (updateError) {
    return { error: safeActionError('team.promoteToAdmin', updateError, 'Could not promote the user.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Demote an admin back to 'staff'. The "don't lock yourself out" check
 * lives in the database (`guard_last_admin` trigger). A caller cannot
 * demote themselves in the UI, and the database refuses if it would
 * leave zero admins.
 */
export async function demoteFromAdmin(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const rl = await rateLimit(supabase, `demote:${user.id}`, 10, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many actions. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Not authorised' }
  }

  const parsed = UuidSchema.safeParse(formData.get('userId'))
  if (!parsed.success) {
    return { error: 'Invalid user.' }
  }
  const targetUserId = parsed.data

  // Prevent self-demotion in the action as well as the UI.
  if (targetUserId === user.id) {
    return { error: 'You cannot demote yourself.' }
  }

  // RLS allows an admin to write role = 'staff' to anyone; the
  // guard_last_admin trigger (added in migration 020) enforces the
  // "don't lock yourself out" check on the demotion regardless of
  // whether we go through the helper or a direct RLS UPDATE.
  // Refuse to demote non-admin accounts. Demoting a client to 'staff' would
  // grant them operator access; demoting a staff user is a no-op at best.
  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()
  if (targetError) {
    return { error: safeActionError('team.demoteFromAdmin.lookup', targetError, 'Could not look up the user.') }
  }
  if (!targetProfile) {
    return { error: 'No user found.' }
  }
  if (targetProfile.role !== 'admin') {
    return { error: 'Only admin accounts can be demoted to staff.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'staff' })
    .eq('id', targetUserId)

  if (updateError) {
    // 42501 here is the trigger raising "Refusing to demote the last
    // admin" — surface a friendly message.
    if (updateError.code === '42501') {
      return { error: 'Cannot demote the last admin. Promote a replacement first.' }
    }
    return { error: safeActionError('team.demoteFromAdmin', updateError, 'Could not demote the user.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}


/**
 * Toggle a user's active status (suspend / resume access). Admin only.
 * The database trigger `profiles_guard_last_admin_on_deactivate` prevents
 * suspending the last active admin.
 */
export async function toggleUserActive(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const rl = await rateLimit(supabase, `toggle-active:${user.id}`, 10, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many actions. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Not authorised' }
  }

  const parsed = UuidSchema.safeParse(formData.get('userId'))
  if (!parsed.success) {
    return { error: 'Invalid user.' }
  }
  const targetUserId = parsed.data

  // Look up the target user and current active state. Only operator accounts
  // (admin/staff/picker) are managed from the team page.
  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetError) {
    return { error: safeActionError('team.toggleUserActive.lookup', targetError, 'Could not look up the user.') }
  }
  if (!targetProfile) {
    return { error: 'No user found.' }
  }
  if (!['admin', 'staff', 'picker', 'driver'].includes(targetProfile.role)) {
    return { error: 'Invalid user.' }
  }

  // Prevent an admin suspending their own account (self-lockout). The
  // last-admin trigger only counts ACTIVE admins, so with >=2 admins the DB
  // would not stop this. Mirror deleteUser's self-guard above.
  if (targetUserId === user.id) {
    return { error: 'You cannot suspend your own account.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ is_active: !targetProfile.is_active })
    .eq('id', targetUserId)

  if (updateError) {
    if (updateError.code === '42501') {
      return { error: 'Cannot suspend the last active admin. Promote a replacement first.' }
    }
    return { error: safeActionError('team.toggleUserActive', updateError, 'Could not update the user status.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Hard-delete a user. Admin only. Deletion is blocked if the user still owns
 * invoices or clients (ON DELETE RESTRICT). The profile row is removed by
 * CASCADE when the auth.users row is deleted. The database trigger
 * `profiles_guard_last_admin_on_delete` prevents deleting the last admin.
 */
export async function deleteUser(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const rl = await rateLimit(supabase, `delete-user:${user.id}`, 10, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many actions. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Not authorised' }
  }

  const parsed = UuidSchema.safeParse(formData.get('userId'))
  if (!parsed.success) {
    return { error: 'Invalid user.' }
  }
  const targetUserId = parsed.data

  // Prevent self-deletion.
  if (targetUserId === user.id) {
    return { error: 'You cannot delete your own account.' }
  }

  const adminClient = createAdminClient()
  // Narrowed for nested helpers (TS does not carry the early return through closures).
  const actorUserId = user.id

  // Only operator accounts (admin/staff/picker) may be deleted from the team page.
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()
  if (!targetProfile || !['admin', 'staff', 'picker', 'driver'].includes(targetProfile.role)) {
    return { error: 'Invalid user.' }
  }

  // Reassign RESTRICT FKs to the acting admin so auth.users → profiles CASCADE
  // can complete. Demo seed often attributes thousands of invoices/clients to
  // one admin; blocking delete until "reassign first" made removing legacy
  // admin accounts (e.g. dhotgta@gmail.com) impossible from the UI.
  //
  // Missing tables on partial schemas (e.g. stock_audit_alerts) must not
  // hard-fail the whole delete — PostgREST returns an error for unknown
  // relations and the previous code treated that as "still has alerts".
  function isMissingRelationError(message: string | undefined): boolean {
    const msg = (message ?? '').toLowerCase()
    return (
      msg.includes('does not exist') ||
      msg.includes('could not find the table') ||
      msg.includes('schema cache')
    )
  }

  async function reassignCreatedBy(
    table: 'invoices' | 'clients' | 'payments' | 'products',
    column: 'created_by' = 'created_by'
  ): Promise<{ error: string } | null> {
    const { error } = await adminClient
      .from(table)
      .update({ [column]: actorUserId })
      .eq(column, targetUserId)
    if (error && !isMissingRelationError(error.message)) {
      console.error(`[team] deleteUser reassign ${table}.${column} failed:`, error)
      return {
        error: `Cannot delete this user because reassigning their ${table} failed. Try again or reassign records manually.`,
      }
    }
    return null
  }

  for (const table of ['invoices', 'clients', 'payments', 'products'] as const) {
    const result = await reassignCreatedBy(table)
    if (result) return result
  }

  {
    const { error } = await adminClient
      .from('client_invitations')
      .update({ invited_by: actorUserId })
      .eq('invited_by', targetUserId)
    if (error && !isMissingRelationError(error.message)) {
      console.error('[team] deleteUser reassign client_invitations failed:', error)
      return {
        error:
          'Cannot delete this user because reassigning their client invitations failed. Try again.',
      }
    }
  }

  // Picker operational history: keep load/alert rows, re-attribute ownership.
  {
    const { error: loadsReassignError } = await adminClient
      .from('delivery_loads')
      .update({ picked_by: actorUserId })
      .eq('picked_by', targetUserId)
    if (loadsReassignError && !isMissingRelationError(loadsReassignError.message)) {
      console.error('[team] deleteUser reassign delivery_loads failed:', loadsReassignError)
      return {
        error:
          'Cannot delete this user because they still have delivery loads. Reassign those loads first, or try again.',
      }
    }
  }

  {
    const { error: alertsReassignError } = await adminClient
      .from('stock_audit_alerts')
      .update({ raised_by: actorUserId })
      .eq('raised_by', targetUserId)
    // Partial demo schemas often lack this table entirely — skip quietly.
    if (alertsReassignError && !isMissingRelationError(alertsReassignError.message)) {
      console.error('[team] deleteUser reassign stock_audit_alerts failed:', alertsReassignError)
      return {
        error:
          'Cannot delete this user because they still have stock audit alerts. Resolve or reassign those first.',
      }
    }
  }

  // Revoke sessions before deleting the auth user so existing JWTs become unusable.
  try {
    await adminClient.auth.admin.signOut(targetUserId)
  } catch (err) {
    console.warn('[team] deleteUser signOut failed, continuing with delete:', err)
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)

  if (deleteError) {
    const msg = deleteError.message?.toLowerCase() ?? ''
    if (msg.includes('last admin') || msg.includes('profiles_guard_last_admin')) {
      return { error: 'Cannot delete the last administrator.' }
    }
    if (msg.includes('foreign key') || msg.includes('violates foreign key') || deleteError.status === 422) {
      return {
        error:
          'Cannot delete this user because they still own linked records (for pickers this is usually delivery loads or stock alerts).',
      }
    }
    console.error('[team] deleteUser auth delete failed:', deleteError)
    return { error: 'Could not delete the user. Please try again.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}
