'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'staff', 'picker', 'driver']),
})

export type OperatorRole = 'admin' | 'staff' | 'picker' | 'driver'

/**
 * Update an operator's role (admin, staff, or picker). Admin only.
 * Demoting the last admin is blocked here in code (the DB trigger only
 * catches admin -> staff, not admin -> picker), so any valid transition is
 * safe to attempt.
 */
export async function updateUserRole(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const rl = await rateLimit(supabase, `update-role:${user.id}`, 20, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many actions. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Not authorised' }
  }

  const parsed = UpdateRoleSchema.safeParse({
    userId: formData.get('userId'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { error: 'Invalid request.' }
  }

  const { userId: targetUserId, role } = parsed.data

  if (targetUserId === user.id) {
    return { error: 'You cannot change your own role.' }
  }

  const adminClient = createAdminClient()

  const { data: targetProfile, error: targetError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetError) {
    return { error: safeActionError('team.updateUserRole.lookup', targetError, 'Could not look up the user.') }
  }
  if (!targetProfile) {
    return { error: 'No user found.' }
  }
  if (targetProfile.role === 'client') {
    return { error: 'Client roles cannot be changed from the team page.' }
  }
  if (targetProfile.role === role) {
    return { ok: true }
  }

  // App-level last-admin guard. The DB trigger only fires on admin -> staff,
  // so an admin -> picker demotion could otherwise lock the workspace out.
  if (targetProfile.role === 'admin' && role !== 'admin') {
    const { count: otherAdmins, error: countErr } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
      .neq('id', targetUserId)
    if (countErr) {
      return { error: safeActionError('team.updateUserRole.countAdmins', countErr, 'Could not verify admin count.') }
    }
    if ((otherAdmins ?? 0) === 0) {
      return { error: 'Cannot change the role of the last admin. Promote a replacement first.' }
    }
  }

  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ role })
    .eq('id', targetUserId)

  if (updateError) {
    if (updateError.code === '42501' || updateError.message?.toLowerCase().includes('last admin')) {
      return { error: 'Cannot change the role of the last admin. Promote a replacement first.' }
    }
    return { error: safeActionError('team.updateUserRole', updateError, 'Could not update the user role.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}
