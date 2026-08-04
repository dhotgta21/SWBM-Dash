import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { resolveStaffPermissions, type StaffPermissions } from '@/lib/auth/permissions'

export interface SettingsAccess {
  user: User
  profile: {
    id: string
    email?: string | null
    full_name?: string | null
    role?: string | null
    phone?: string | null
    employee_number?: string | null
    date_of_birth?: string | null
    id_security_number?: string | null
    job_title?: string | null
    department?: string | null
    permissions?: StaffPermissions | null
  } | null
  isAdmin: boolean
  isStaff: boolean
  canEditCompany: boolean
}

export async function resolveSettingsAccess(): Promise<SettingsAccess> {
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch (err) {
    console.error('Settings access: failed to create Supabase client:', err)
    redirect(ADMIN_LOGIN_PATH)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(ADMIN_LOGIN_PATH)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, role, permissions, phone, employee_number, date_of_birth, id_security_number, job_title, department'
    )
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff'
  const permissions: StaffPermissions | null = profile?.permissions
    ? resolveStaffPermissions(profile.role, profile.permissions)
    : null
  const canEditCompany = isAdmin || permissions?.settings_edit_company === true

  return {
    user,
    profile,
    isAdmin,
    isStaff,
    canEditCompany,
  }
}

export function requireAdmin(access: SettingsAccess): void {
  if (!access.isAdmin) {
    if (access.canEditCompany) {
      redirect('/settings/company')
    }
    redirect('/invoices?view=due')
  }
}

/**
 * Account settings (profile, password, 2FA) — admin and staff only.
 * Pickers/drivers/clients are redirected away.
 */
export function requireAdminOrStaff(access: SettingsAccess): void {
  if (access.isAdmin || access.isStaff) return
  if (access.canEditCompany) {
    redirect('/settings/company')
  }
  redirect('/invoices?view=due')
}

export function requireCompanyEdit(access: SettingsAccess): void {
  if (!access.isAdmin && !access.canEditCompany) {
    redirect('/invoices?view=due')
  }
}
