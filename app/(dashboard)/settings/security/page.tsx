import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { SecuritySettingsTabs } from '@/components/settings/SecuritySettingsTabs'
import { getDeletionPasswordStatus } from '@/lib/actions/deletion-settings'
import { getClientAccountPasswordStatus } from '@/lib/actions/client-account-settings'
import { getPaymentPasswordStatus } from '@/lib/actions/payment-password-settings'
import { resolveSettingsAccess } from '@/lib/auth/settings-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Security settings',
}

export default async function SecuritySettingsPage() {
  // Self-service: any signed-in user manages their OWN action passwords here.
  // resolveSettingsAccess redirects unauthenticated visitors to the login page.
  await resolveSettingsAccess()

  const [deletionPasswordStatus, clientAccountPasswordStatus, paymentPasswordStatus] =
    await Promise.all([
      getDeletionPasswordStatus().catch((e) => {
        console.error('Security settings: could not load deletion password status:', e)
        return { hasPassword: false }
      }),
      getClientAccountPasswordStatus().catch((e) => {
        console.error('Security settings: could not load client account password status:', e)
        return { hasPassword: false }
      }),
      getPaymentPasswordStatus().catch((e) => {
        console.error('Security settings: could not load payment password status:', e)
        return { hasPassword: false }
      }),
    ])

  return (
    <SettingsCategoryShell
      title="Security"
      description="Set your personal passwords for recording payments, client account actions, and data deletion."
    >
      <SecuritySettingsTabs
        hasPaymentPassword={paymentPasswordStatus.hasPassword}
        hasClientAccountPassword={clientAccountPasswordStatus.hasPassword}
        hasDeletionPassword={deletionPasswordStatus.hasPassword}
      />
    </SettingsCategoryShell>
  )
}
