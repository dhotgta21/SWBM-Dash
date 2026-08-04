import { createClient } from '@/lib/supabase/server'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsCategoryShell } from '@/components/settings/SettingsCategoryShell'
import { TeamSettingsTabs } from '@/components/settings/TeamSettingsTabs'
import { listActiveIpBans } from '@/lib/actions/admin-ip-bans'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { resolveSettingsAccess, requireAdmin } from '@/lib/auth/settings-access'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Team & access settings',
}

interface TeamSettingsPageProps {
  searchParams: Promise<{ tab?: string }>
}

export default async function TeamSettingsPage({ searchParams }: TeamSettingsPageProps) {
  const { tab } = await searchParams
  const access = await resolveSettingsAccess()
  requireAdmin(access)

  const supabase = await createClient()
  const loadErrors: string[] = []

  const { data: users, error: usersError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (usersError) {
    loadErrors.push(`Users: ${usersError.message} (${usersError.code})`)
  }

  const staffMembers = (users ?? [])
    .filter((u) => u.role === 'staff')
    .map((u) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      permissions: u.permissions
        ? resolveStaffPermissions(u.role, u.permissions)
        : null,
      permissions_updated_at: u.permissions_updated_at ?? null,
    }))

  let activeIpBans: Awaited<ReturnType<typeof listActiveIpBans>> = []
  try {
    activeIpBans = await listActiveIpBans()
  } catch (e) {
    console.error('Team settings: could not load IP bans:', e)
    loadErrors.push('IP bans could not be loaded.')
  }

  return (
    <SettingsCategoryShell
      title="Team & access"
      description="Invite users, manage roles, set staff permissions, and control IP bans."
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

      <TeamSettingsTabs
        defaultTab={tab}
        members={(users ?? [])
          .filter((u) => u.role === 'admin' || u.role === 'staff' || u.role === 'picker' || u.role === 'driver')
          .map((u) => ({
            id: u.id,
            email: u.email,
            full_name: u.full_name,
            role: u.role as 'admin' | 'staff' | 'picker' | 'driver',
            is_active: u.is_active,
            last_sign_in_at: u.last_sign_in_at,
            last_active_at: u.last_active_at,
          }))}
        currentUserId={access.user.id}
        staffMembers={staffMembers}
        activeIpBans={activeIpBans}
      />
    </SettingsCategoryShell>
  )
}
