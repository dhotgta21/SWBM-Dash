import { createClient } from '@/lib/supabase/server'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { BrandSettingsTabs } from '@/components/settings/BrandSettingsTabs'
import { loadAppearanceSettings } from '@/lib/appearance'
import { listTeamMembersForAdmin, listHistoryMilestonesForAdmin } from '@/lib/actions/about'
import { resolveSettingsAccess, requireAdmin } from '@/lib/auth/settings-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Brand & content settings',
}

interface BrandSettingsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function BrandSettingsPage({ searchParams }: BrandSettingsPageProps) {
  const { tab } = await searchParams
  const access = await resolveSettingsAccess()
  requireAdmin(access)

  const supabase = await createClient()
  const loadErrors: string[] = []

  const companyResult = await supabase.from('company_settings').select('*').maybeSingle()
  if (companyResult.error && companyResult.error.code !== 'PGRST116') {
    loadErrors.push(`Company settings: ${companyResult.error.message} (${companyResult.error.code})`)
  }

  let appearanceSettings = null
  try {
    appearanceSettings = await loadAppearanceSettings()
  } catch (e) {
    console.error('Brand settings: could not load appearance settings:', e)
    loadErrors.push('Appearance settings could not be loaded.')
  }

  let teamMembers: Awaited<ReturnType<typeof listTeamMembersForAdmin>> = []
  let historyMilestones: Awaited<ReturnType<typeof listHistoryMilestonesForAdmin>> = []
  try {
    teamMembers = await listTeamMembersForAdmin()
  } catch (e) {
    console.error('Brand settings: could not load team members:', e)
    loadErrors.push('Team members could not be loaded.')
  }
  try {
    historyMilestones = await listHistoryMilestonesForAdmin()
  } catch (e) {
    console.error('Brand settings: could not load history milestones:', e)
    loadErrors.push('Company history could not be loaded.')
  }

  let yardSections: Array<{ name: string; icon: string; blurb: string }> = []
  if (Array.isArray((companyResult.data as { yard_sections?: unknown } | null)?.yard_sections)) {
    const raw = (companyResult.data as { yard_sections: unknown }).yard_sections
    if (Array.isArray(raw)) {
      yardSections = raw.filter(
        (s): s is { name: string; icon: string; blurb: string } =>
          typeof s === 'object' &&
          s !== null &&
          typeof (s as { name?: unknown }).name === 'string' &&
          typeof (s as { icon?: unknown }).icon === 'string',
      )
    }
  }

  const company = {
    id: companyResult.data?.id ?? 1,
    founded_year: companyResult.data?.founded_year ?? null,
    fleet_size: companyResult.data?.fleet_size ?? null,
    yard_description: companyResult.data?.yard_description ?? null,
    opening_hours_text: companyResult.data?.opening_hours_text ?? null,
  }

  return (
    <SettingsCategoryShell
      title="Brand & content"
      description="Logo, colours, fonts, social media links, and the public About page."
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

      <BrandSettingsTabs
        defaultTab={tab}
        appearanceSettings={appearanceSettings}
        logoUrl={companyResult.data?.logo_url}
        logoUpdatedAt={companyResult.data?.updated_at}
        canEdit={access.canEditCompany}
        seoSameAs={companyResult.data?.seo_same_as ?? null}
        company={company}
        teamMembers={teamMembers}
        historyMilestones={historyMilestones}
        yardSections={yardSections}
      />
    </SettingsCategoryShell>
  )
}
