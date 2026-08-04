'use client'

import { Users, ShieldCheck, ShieldOff } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TeamManagement } from './TeamManagement'
import { PermissionEditor, type StaffMember } from './PermissionEditor'
import { IpBanManager } from './IpBanManager'
import type { IpBanRow } from '@/lib/actions/admin-ip-bans'

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'staff' | 'picker' | 'driver'
  is_active: boolean
  last_sign_in_at: string | null
  last_active_at: string | null
}

interface TeamSettingsTabsProps {
  defaultTab?: string
  members: TeamMember[]
  currentUserId: string
  staffMembers: StaffMember[]
  activeIpBans: IpBanRow[]
}

const TEAM_TABS = ['users', 'permissions', 'access']

export function TeamSettingsTabs({
  defaultTab,
  members,
  currentUserId,
  staffMembers,
  activeIpBans,
}: TeamSettingsTabsProps) {
  const activeTab = defaultTab && TEAM_TABS.includes(defaultTab) ? defaultTab : 'users'
  return (
    <Tabs defaultValue={activeTab} className="w-full">
      <TabsList className="w-full justify-start overflow-x-auto flex-nowrap bg-card">
        <TabsTrigger value="users" className="shrink-0 gap-2">
          <Users className="h-4 w-4" />
          Users
        </TabsTrigger>
        <TabsTrigger value="permissions" className="shrink-0 gap-2">
          <ShieldCheck className="h-4 w-4" />
          Permissions
        </TabsTrigger>
        <TabsTrigger value="access" className="shrink-0 gap-2">
          <ShieldOff className="h-4 w-4" />
          IP bans
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>View team members, invite new users, and manage admin access.</CardDescription>
          </CardHeader>
          <CardContent>
            <TeamManagement members={members} currentUserId={currentUserId} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="permissions" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Staff Permissions</CardTitle>
            <CardDescription>
              Toggle what each staff member can see and do. Changes save per user
              and take effect immediately on their next page load. Admins always
              have full access. This editor only affects staff accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PermissionEditor members={staffMembers} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="access" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>IP Bans</CardTitle>
            <CardDescription>
              Quote-request submissions are auto-banned when more than 3
              distinct email addresses come from the same connection in 24
              hours. Lift false positives or manually block persistent
              spammers below the threshold.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IpBanManager initialBans={activeIpBans} canManageIpBans />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
