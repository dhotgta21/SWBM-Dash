'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleUserActive, deleteUser } from '@/lib/actions/team'
import { updateUserRole, type OperatorRole } from '@/lib/actions/update-user-role'
import { inviteStaffUser } from '@/lib/actions/staff-invite'
import { adminSendStaffPasswordReset } from '@/lib/actions/adminPasswordReset'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { KeyRound, Loader2 } from 'lucide-react'

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'staff' | 'picker' | 'driver'
  is_active: boolean
  last_sign_in_at: string | null
  last_active_at: string | null
}

interface TeamManagementProps {
  members: TeamMember[]
  currentUserId: string
}

type ConfirmAction =
  | { type: 'toggle'; member: TeamMember }
  | { type: 'delete'; member: TeamMember }
  | { type: 'reset'; member: TeamMember }
  | null

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 0) return 'Just now'
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.floor(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

function DesktopTeamTable({
  rows,
  currentUserId,
  isPending,
  isLastAdmin,
  onToggle,
  onDelete,
  onRoleChange,
  onResetPassword,
}: {
  rows: TeamMember[]
  currentUserId: string
  isPending: boolean
  isLastAdmin: (member: TeamMember) => boolean
  onToggle: (member: TeamMember) => void
  onDelete: (member: TeamMember) => void
  onRoleChange: (member: TeamMember, role: OperatorRole) => void
  onResetPassword: (member: TeamMember) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last sign-in</TableHead>
          <TableHead>Last active</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((u) => (
          <TableRow key={u.id} className={u.is_active ? undefined : 'opacity-60'}>
            <TableCell className="text-foreground">{u.email}</TableCell>
            <TableCell className="text-muted-foreground">{u.full_name || '-'}</TableCell>
            <TableCell className="capitalize text-foreground">
              {u.role}
              {u.id === currentUserId && (
                <span className="ml-2 text-xs text-muted-foreground">(you)</span>
              )}
            </TableCell>
            <TableCell>
              {(() => {
                const status = !u.is_active
                  ? { label: 'Suspended', cls: 'bg-muted text-muted-foreground' }
                  : !u.last_sign_in_at
                    ? { label: 'Invited', cls: 'bg-warning/10 text-warning' }
                    : { label: 'Active', cls: 'bg-success-muted text-success' }
                return (
                  <span
                    className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${status.cls}`}
                  >
                    {status.label}
                  </span>
                )
              })()}
            </TableCell>
            <TableCell
              className="text-muted-foreground"
              title={u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : undefined}
            >
              {formatRelativeTime(u.last_sign_in_at)}
            </TableCell>
            <TableCell
              className="text-muted-foreground"
              title={u.last_active_at ? new Date(u.last_active_at).toLocaleString() : undefined}
            >
              {formatRelativeTime(u.last_active_at)}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-wrap items-center justify-end gap-2">
                {u.id !== currentUserId && (
                  <Select
                    value={u.role}
                    onChange={(value) => onRoleChange(u, value as OperatorRole)}
                    options={[
                      { value: 'admin', label: 'Administrator' },
                      { value: 'staff', label: 'Staff' },
                      { value: 'picker', label: 'Picker' },
                      { value: 'driver', label: 'Driver' },
                    ]}
                    disabled={isPending || isLastAdmin(u)}
                    className="w-36"
                  />
                )}
                {/* Admin-only password reset. Hidden on the current user's
                    row so an admin can't lock themselves out via a button
                    that needs their own session. The server action also
                    rejects self-resets as defence-in-depth. */}
                {u.id !== currentUserId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onResetPassword(u)}
                    className="h-11"
                  >
                    <KeyRound className="w-4 h-4 mr-1.5" />
                    Reset password
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending || isLastAdmin(u) || u.id === currentUserId}
                  onClick={() => onToggle(u)}
                  className="h-11"
                >
                  {u.is_active ? 'Suspend' : 'Resume'}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={isPending || u.id === currentUserId || isLastAdmin(u)}
                  onClick={() => onDelete(u)}
                  className="h-11"
                >
                  Delete
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MobileTeamCard({
  member,
  currentUserId,
  isPending,
  isLastAdmin,
  onToggle,
  onDelete,
  onRoleChange,
  onResetPassword,
}: {
  member: TeamMember
  currentUserId: string
  isPending: boolean
  isLastAdmin: (member: TeamMember) => boolean
  onToggle: (member: TeamMember) => void
  onDelete: (member: TeamMember) => void
  onRoleChange: (member: TeamMember, role: OperatorRole) => void
  onResetPassword: (member: TeamMember) => void
}) {
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{member.email}</p>
          <p className="text-sm text-muted-foreground">{member.full_name || 'No name'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{member.role}</span>
            {member.id === currentUserId && <span>(you)</span>}
            {(() => {
              const status = !member.is_active
                ? { label: 'Suspended', cls: 'bg-muted text-muted-foreground' }
                : !member.last_sign_in_at
                  ? { label: 'Invited', cls: 'bg-warning/10 text-warning' }
                  : { label: 'Active', cls: 'bg-success-muted text-success' }
              return (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.cls}`}
                >
                  {status.label}
                </span>
              )
            })()}
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          {member.id !== currentUserId && (
            <Select
              value={member.role}
              onChange={(value) => onRoleChange(member, value as OperatorRole)}
              options={[
                { value: 'admin', label: 'Administrator' },
                { value: 'staff', label: 'Staff' },
                { value: 'picker', label: 'Picker' },
                { value: 'driver', label: 'Driver' },
              ]}
              disabled={isPending || isLastAdmin(member)}
              className="w-full"
            />
          )}
          {member.id !== currentUserId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => onResetPassword(member)}
              className="h-11"
            >
              <KeyRound className="w-4 h-4 mr-1.5" />
              Reset password
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || isLastAdmin(member) || member.id === currentUserId}
            onClick={() => onToggle(member)}
            className="h-11"
          >
            {member.is_active ? 'Suspend' : 'Resume'}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={isPending || member.id === currentUserId || isLastAdmin(member)}
            onClick={() => onDelete(member)}
            className="h-11"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TeamManagement({
  members,
  currentUserId,
}: TeamManagementProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'staff' | 'admin' | 'picker' | 'driver'>('staff')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const router = useRouter()

  // The DB trigger guards the last admin row regardless of is_active, so the
  // UI must mirror that semantics or the button will be enabled but fail.
  const adminCount = members.filter((m) => m.role === 'admin').length
  const isLastAdmin = (member: TeamMember) => member.role === 'admin' && adminCount <= 1

  function clearAlerts() {
    setError(null)
    setSuccess(null)
  }

  async function handleRoleChange(member: TeamMember, role: OperatorRole) {
    if (member.role === role) return
    clearAlerts()
    startTransition(async () => {
      const formData = new FormData()
      formData.set('userId', member.id)
      formData.set('role', role)
      const result = await updateUserRole(formData)
      if (result.error) setError(result.error)
      else {
        setSuccess(`Updated ${member.email} to ${role}.`)
        router.refresh()
      }
    })
  }

  async function handleInvite(formData: FormData) {
    clearAlerts()
    startTransition(async () => {
      const result = await inviteStaffUser(formData)
      if (result.error) setError(result.error)
      else {
        if ('demoInviteUrl' in result && result.demoInviteUrl) {
          setSuccess(
            `Demo mode: user created without email. Copy this invite link and open it to set their password:\n${result.demoInviteUrl}`
          )
        } else {
          setSuccess('Invite sent. The user will receive an email to register their account.')
        }
        setInviteName('')
        setInviteEmail('')
        setInviteRole('staff')
        router.refresh()
      }
    })
  }

  async function handleToggleConfirm() {
    if (!confirmAction || confirmAction.type !== 'toggle') return
    const member = confirmAction.member
    setConfirmAction(null)
    clearAlerts()

    startTransition(async () => {
      const formData = new FormData()
      formData.set('userId', member.id)
      const result = await toggleUserActive(formData)
      if (result.error) setError(result.error)
      else {
        setSuccess(member.is_active ? `Suspended ${member.email}.` : `Resumed ${member.email}.`)
        router.refresh()
      }
    })
  }

  async function handleDeleteConfirm() {
    if (!confirmAction || confirmAction.type !== 'delete') return
    const member = confirmAction.member
    setConfirmAction(null)
    clearAlerts()

    startTransition(async () => {
      const formData = new FormData()
      formData.set('userId', member.id)
      const result = await deleteUser(formData)
      if (result.error) setError(result.error)
      else {
        setSuccess(`Deleted ${member.email}.`)
        router.refresh()
      }
    })
  }

  async function handleResetPasswordConfirm() {
    if (!confirmAction || confirmAction.type !== 'reset') return
    const member = confirmAction.member
    setConfirmAction(null)
    clearAlerts()

    startTransition(async () => {
      const formData = new FormData()
      formData.set('userId', member.id)
      const result = await adminSendStaffPasswordReset(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const email = result.data?.targetEmail ?? member.email
      if (result.data?.demoResetUrl) {
        setSuccess(
          `Demo mode: password reset created without email for ${email}. Copy this link:\n${result.data.demoResetUrl}`
        )
      } else {
        setSuccess(
          `Password reset email sent to ${email}. The link expires in one hour and can be used once.`
        )
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert variant="success">
          <AlertDescription className="whitespace-pre-wrap break-all">{success}</AlertDescription>
        </Alert>
      )}

      <form action={handleInvite} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="invite-name">Invite user</Label>
          <p className="text-xs text-muted-foreground">
            Send an email invitation so a new team member can register their account. We&apos;ll
            use their name to personalise the email and pre-fill their profile.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
          <Input
            id="invite-name"
            name="fullName"
            type="text"
            placeholder="Full name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
            autoComplete="off"
          />
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="user@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
            autoComplete="off"
          />
          <Select
            name="role"
            value={inviteRole}
            onChange={(value) => setInviteRole(value as 'staff' | 'admin' | 'picker' | 'driver')}
            options={[
              { value: 'staff', label: 'Staff' },
              { value: 'admin', label: 'Admin' },
              { value: 'picker', label: 'Picker' },
              { value: 'driver', label: 'Driver' },
            ]}
            className="w-full sm:w-32"
          />
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send invite'}
          </Button>
        </div>
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
        {members.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No team members found.
          </div>
        ) : (
          <ResponsiveTable
            rows={members}
            keyField="id"
            renderDesktop={(rows) => (
              <DesktopTeamTable
                rows={rows}
                currentUserId={currentUserId}
                isPending={isPending}
                isLastAdmin={isLastAdmin}
                onToggle={(m) => setConfirmAction({ type: 'toggle', member: m })}
                onDelete={(m) => setConfirmAction({ type: 'delete', member: m })}
                onRoleChange={handleRoleChange}
                onResetPassword={(m) => setConfirmAction({ type: 'reset', member: m })}
              />
            )}
            renderMobile={(row) => (
              <MobileTeamCard
                member={row}
                currentUserId={currentUserId}
                isPending={isPending}
                isLastAdmin={isLastAdmin}
                onToggle={(m) => setConfirmAction({ type: 'toggle', member: m })}
                onDelete={(m) => setConfirmAction({ type: 'delete', member: m })}
                onRoleChange={handleRoleChange}
                onResetPassword={(m) => setConfirmAction({ type: 'reset', member: m })}
              />
            )}
          />
        )}
      </div>

      {/* Suspend / resume confirmation */}
      <Dialog
        open={confirmAction?.type === 'toggle'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.type === 'toggle' && confirmAction.member.is_active ? 'Suspend user' : 'Resume user'}</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'toggle' && (
                <>
                  {confirmAction.member.is_active
                    ? `${confirmAction.member.email} will no longer be able to sign in until they are resumed.`
                    : `${confirmAction.member.email} will be able to sign in again.`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={confirmAction?.type === 'toggle' && confirmAction.member.is_active ? 'danger' : 'primary'}
              onClick={handleToggleConfirm}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
            </Button>
          </div>
          <DialogClose onClick={() => setConfirmAction(null)} />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'delete' && (
                <>
                  Are you sure you want to permanently delete{' '}
                  <strong>{confirmAction.member.email}</strong>? This action cannot be undone. The
                  user will be blocked if they still own invoices or clients.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteConfirm}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </Button>
          </div>
          <DialogClose onClick={() => setConfirmAction(null)} />
        </DialogContent>
      </Dialog>

      {/* Reset password confirmation */}
      <Dialog
        open={confirmAction?.type === 'reset'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send password reset email</DialogTitle>
            <DialogDescription>
              {confirmAction?.type === 'reset' && (
                <>
                  Send <strong>{confirmAction.member.email}</strong> a one-hour password-reset link? They&apos;ll receive a branded email from our domain with a button that lands them on the &quot;set a new password&quot; screen. The link can only be used once.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleResetPasswordConfirm}
              disabled={isPending}
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send reset email'}
            </Button>
          </div>
          <DialogClose onClick={() => setConfirmAction(null)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
