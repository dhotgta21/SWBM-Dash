import { redirect } from 'next/navigation'
import { UserCircle, Building2, Palette, Users, ShieldCheck, Plug } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { SettingsCategoryCard } from '@/components/settings/SettingsCategoryCard'
import { resolveSettingsAccess } from '@/lib/auth/settings-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Settings',
}

const TAB_REDIRECTS: Record<string, string> = {
  general: '/settings/company',
  appearance: '/settings/brand?tab=appearance',
  about: '/settings/brand?tab=about',
  social: '/settings/brand?tab=social',
  'user-details': '/settings/account',
  users: '/settings/team?tab=users',
  permissions: '/settings/team?tab=permissions',
  access: '/settings/team?tab=access',
  'data-protection': '/settings/security',
  ai: '/settings/integrations',
}

interface SettingsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const access = await resolveSettingsAccess()

  const { tab } = await searchParams
  if (tab && TAB_REDIRECTS[tab]) {
    redirect(TAB_REDIRECTS[tab])
  }

  // Account (profile / password / 2FA) and Security (action passwords) are
  // self-service for admin and staff. Company / Brand / Team / Integrations
  // stay gated to admins (and company editors, for Company).
  const showAccount = access.isAdmin || access.isStaff
  const showCompany = access.isAdmin || access.canEditCompany
  const showAdminOnly = access.isAdmin

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage company details, team access, security policies and integrations."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showAccount && (
          <SettingsCategoryCard
            href="/settings/account"
            icon={UserCircle}
            title="Account"
            description="Your personal profile, password and two-factor authentication."
          />
        )}
        {showCompany && (
          <SettingsCategoryCard
            href="/settings/company"
            icon={Building2}
            title="Company"
            description="Legal details, contact channels, document prefixes and bank information."
          />
        )}
        {showAdminOnly && (
          <SettingsCategoryCard
            href="/settings/brand"
            icon={Palette}
            title="Brand & content"
            description="Logo, colours, fonts, social media links, and the public About page."
          />
        )}
        {showAdminOnly && (
          <SettingsCategoryCard
            href="/settings/team"
            icon={Users}
            title="Team & access"
            description="Invite users, manage roles, set permissions and control IP bans."
          />
        )}
        <SettingsCategoryCard
          href="/settings/security"
          icon={ShieldCheck}
          title="Security"
          description="Set your personal passwords for client account actions and data deletion."
        />
        {showAdminOnly && (
          <SettingsCategoryCard
            href="/settings/integrations"
            icon={Plug}
            title="Integrations"
            description="Connect third-party services such as email, CAPTCHA, postcode lookup and the voice invoice assistant."
          />
        )}
      </div>
    </div>
  )
}
