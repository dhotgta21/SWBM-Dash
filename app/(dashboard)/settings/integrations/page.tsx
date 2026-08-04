import { redirect } from 'next/navigation'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { IntegrationSecretsForm } from '@/components/settings/IntegrationSecretsForm'
import { getInvoiceAssistantSettings } from '@/lib/actions/invoice-assistant-settings'
import { getIntegrationSecrets } from '@/lib/actions/integration-secrets'
import { resolveSettingsAccess, requireAdmin } from '@/lib/auth/settings-access'
import { shouldHideIntegrations } from '@/lib/demo/mode'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Integrations settings',
}

export default async function IntegrationsSettingsPage() {
  // Demo deployments skip third-party API setup (Resend, Turnstile, GoAddress).
  if (shouldHideIntegrations()) {
    redirect('/settings')
  }

  const access = await resolveSettingsAccess()
  requireAdmin(access)

  let invoiceAssistantSettings: Awaited<ReturnType<typeof getInvoiceAssistantSettings>> = {
    has_api_key: false,
    api_key_last4: null,
    model: null,
    updated_at: null,
  }
  let integrationSecrets: Awaited<ReturnType<typeof getIntegrationSecrets>> = {
    resend: { hasApiKey: false, apiKeyLast4: null, fromAddress: null, updatedAt: null },
    turnstile: { hasSecretKey: false, secretKeyLast4: null, siteKey: null, updatedAt: null },
    goaddress: { hasToken: false, tokenLast4: null, updatedAt: null },
    rotationWarningDays: 90,
    updatedAt: null,
  }

  try {
    invoiceAssistantSettings = await getInvoiceAssistantSettings()
  } catch (e) {
    console.error('Integrations settings: could not load invoice assistant settings:', e)
  }

  try {
    integrationSecrets = await getIntegrationSecrets()
  } catch (e) {
    console.error('Integrations settings: could not load integration secrets:', e)
  }

  return (
    <SettingsCategoryShell
      title="Integrations"
      description="Connect third-party services such as email delivery, CAPTCHA and postcode lookup."
    >
      <IntegrationSecretsForm
        initialSettings={invoiceAssistantSettings}
        initialSecrets={integrationSecrets}
      />
    </SettingsCategoryShell>
  )
}
