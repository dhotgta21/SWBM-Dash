/**
 * Server-side helper for loading the current operator's full
 * context: identity + role + effective permissions.
 *
 * Pages and server actions should call this once at the top
 * instead of re-deriving role + permissions in five different
 * places. Keeps the auth fetch in one spot.
 */

import { createClient } from '@/lib/supabase/server'
import {
  resolveStaffPermissions,
  type StaffPermissions,
} from '@/lib/auth/permissions'
import { isAdmin, isDriver, isPicker, isStaff, type AppRole } from '@/lib/auth/roles'

export interface OperatorContext {
  userId: string
  email: string
  role: AppRole
  isAdmin: boolean
  isStaff: boolean
  isPicker: boolean
  isDriver: boolean
  /** Effective permissions — all-true for admins, otherwise the
   *  merged defaults + stored overrides for the user. Pickers and
   *  drivers do not use the staff permission matrix; this field is
   *  present for type-safety and is ignored for those flows. */
  permissions: StaffPermissions
}

/**
 * Returns null if there is no signed-in user. Callers in protected
 * layouts should treat null as "redirect to /login".
 */
export async function getOperatorContext(): Promise<OperatorContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, is_active')
    .eq('id', user.id)
    .maybeSingle()

  // Fail closed: a missing or deactivated profile should not be treated as an
  // operator. The middleware already redirects inactive users, but helpers used
  // directly by server actions must also reject these sessions.
  if (!profile || profile.is_active === false) return null
  if (
    profile.role !== 'admin' &&
    profile.role !== 'staff' &&
    profile.role !== 'client' &&
    profile.role !== 'picker' &&
    profile.role !== 'driver'
  ) {
    return null
  }

  const role: AppRole = profile.role as AppRole
  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    isAdmin: isAdmin(role),
    isStaff: isStaff(role),
    isPicker: isPicker(role),
    isDriver: isDriver(role),
    permissions: resolveStaffPermissions(role, profile?.permissions ?? null),
  }
}
