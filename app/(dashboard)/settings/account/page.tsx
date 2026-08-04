import { resolveSettingsAccess, requireAdminOrStaff } from '@/lib/auth/settings-access'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { UserDetailsForm } from '@/components/settings/UserDetailsForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Account settings',
}

export default async function AccountSettingsPage() {
  const access = await resolveSettingsAccess()
  // Profile, password and 2FA are self-service for admin and staff.
  requireAdminOrStaff(access)

  return (
    <SettingsCategoryShell
      title="Account"
      description="Your personal profile and sign-in security."
    >
      <UserDetailsForm profile={access.profile} />
    </SettingsCategoryShell>
  )
}
