'use server'

// Server action for admins to update a staff member's permission
// matrix. Persists to profiles.permissions + stamps who changed it
// and when for audit.
//
// SECURITY: caller MUST be an admin. The action refuses silently
// with a generic error otherwise.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'
import { rateLimit } from '@/lib/rate-limit'
import {
  STAFF_DEFAULT_PERMISSIONS,
  type StaffPermissions,
} from '@/lib/auth/permissions'

// Derive the Zod schema from StaffPermissions so adding a new flag to
// the type is automatically reflected here. Previously this was a
// hand-maintained list that could silently drift out of sync with the
// interface — the worst case being a client sending a new flag and
// having it silently stripped from the persisted object.
function buildPermissionsSchema() {
  const shape: Record<keyof StaffPermissions, z.ZodBoolean> = {} as Record<
    keyof StaffPermissions,
    z.ZodBoolean
  >
  for (const key of Object.keys(STAFF_DEFAULT_PERMISSIONS) as Array<keyof StaffPermissions>) {
    shape[key] = z.boolean()
  }
  return z.object(shape)
}

const PermissionsSchema = buildPermissionsSchema()

const UpdateSchema = z.object({
  targetUserId: z.string().uuid('Invalid user id'),
  permissions: PermissionsSchema,
})

export async function updateStaffPermissions(input: {
  targetUserId: string
  permissions: StaffPermissions
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // SECURITY: failClosed — a compromised admin session could otherwise
  // spam permission flips with no bound. The RPC outage cost is just a
  // short "please try again" message to the admin, which is the right
  // trade for a sensitive mutation.
  const rl = await rateLimit(supabase, `perms:${user.id}`, 30, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many changes. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Only administrators can change permissions.' }
  }

  const parsed = UpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: 'Invalid permission payload.' }
  }

  // Refuse to demote yourself via this action — use the team page
  // for that. Prevents the admin accidentally locking their own
  // dashboard out.
  if (parsed.data.targetUserId === user.id) {
    return { error: 'You cannot change your own permissions from this page.' }
  }

  const { data: target, error: lookupError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', parsed.data.targetUserId)
    .maybeSingle()

  if (lookupError) {
    return { error: safeActionError('perms.lookup', lookupError, 'Could not look up the user.') }
  }
  if (!target) {
    return { error: 'No user with that id.' }
  }
  if (target.role !== 'staff') {
    return { error: 'Only staff permissions can be edited here. Admins always have full access.' }
  }

  const nowIso = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      permissions: parsed.data.permissions,
      permissions_updated_at: nowIso,
      permissions_updated_by: user.id,
    })
    .eq('id', parsed.data.targetUserId)

  if (updateError) {
    return { error: safeActionError('perms.update', updateError, 'Could not save permissions.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}

/**
 * Reset a staff member's permission matrix back to the code-level
 * defaults. Stored column becomes NULL — same effect as the matrix
 * the defaults would produce.
 */
export async function resetStaffPermissions(targetUserId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // SECURITY: failClosed for the same reason as updateStaffPermissions
  // — a compromised admin should not be able to mass-reset permissions.
  // Shared 30/hr budget keyed on the caller (not the target) so a
  // single admin flipping many accounts still gets one combined limit.
  const rl = await rateLimit(supabase, `perms:${user.id}`, 30, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return { error: `Too many changes. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
  }

  if (!(await isAdminUser(supabase, user.id))) {
    return { error: 'Only administrators can change permissions.' }
  }

  const parsedId = z.string().uuid().safeParse(targetUserId)
  if (!parsedId.success) {
    return { error: 'Invalid user id.' }
  }

  if (parsedId.data === user.id) {
    return { error: 'You cannot change your own permissions from this page.' }
  }

  const { data: target, error: lookupError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', parsedId.data)
    .maybeSingle()

  if (lookupError) {
    return { error: safeActionError('perms.lookup', lookupError, 'Could not look up the user.') }
  }
  if (!target) {
    return { error: 'No user with that id.' }
  }
  if (target.role !== 'staff') {
    return { error: 'Only staff permissions can be edited here.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      permissions: null,
      permissions_updated_at: new Date().toISOString(),
      permissions_updated_by: user.id,
    })
    .eq('id', parsedId.data)

  if (updateError) {
    return { error: safeActionError('perms.reset', updateError, 'Could not reset permissions.') }
  }

  revalidatePath('/settings')
  return { ok: true }
}

