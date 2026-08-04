import { createClient } from '@/lib/supabase/server'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { resolveSettingsAccess, requireCompanyEdit } from '@/lib/auth/settings-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Company settings',
}

export default async function CompanySettingsPage() {
  const access = await resolveSettingsAccess()
  requireCompanyEdit(access)

  const supabase = await createClient()
  const loadErrors: string[] = []

  const companyResult = await supabase.from('company_settings').select('*').maybeSingle()
  if (companyResult.error && companyResult.error.code !== 'PGRST116') {
    loadErrors.push(`Company settings: ${companyResult.error.message} (${companyResult.error.code})`)
  }

  const [bankResult, phonesResult, emailsResult] = await Promise.all([
    supabase.from('company_bank_details').select('*').maybeSingle(),
    supabase.from('company_phones').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
    supabase.from('company_emails').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
  ])

  if (bankResult.error && bankResult.error.code !== 'PGRST116') {
    loadErrors.push(`Bank details: ${bankResult.error.message} (${bankResult.error.code})`)
  }
  if (phonesResult.error && phonesResult.error.code !== 'PGRST116') {
    loadErrors.push(`Phone numbers: ${phonesResult.error.message} (${phonesResult.error.code})`)
  }
  if (emailsResult.error && emailsResult.error.code !== 'PGRST116') {
    loadErrors.push(`Email addresses: ${emailsResult.error.message} (${emailsResult.error.code})`)
  }

  const company = companyResult.data
    ? {
        ...companyResult.data,
        phones: phonesResult.data ?? [],
        emails: emailsResult.data ?? [],
      }
    : {
        enable_stock_routing: false,
        phones: phonesResult.data ?? [],
        emails: emailsResult.data ?? [],
      }

  return (
    <SettingsCategoryShell
      title="Company"
      description="Legal details, contact channels, document prefixes and bank information."
    >
      {loadErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <p className="font-medium">Unable to load some settings. Please try again later.</p>
            <ul className="mt-2 list-disc pl-4 text-sm">
              {loadErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <SettingsForm company={company} bankDetails={bankResult.data} canEdit={access.canEditCompany} />
    </SettingsCategoryShell>
  )
}
