'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, RefreshCw, KeyRound, X, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { revokeClientInvite, sendClientInvite } from '@/lib/actions/invites'
import { adminSendClientPasswordReset } from '@/lib/actions/adminPasswordReset'

interface ClientInvitation {
  id: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  created_at: string
  accepted_at: string | null
  expires_at: string
}

interface ClientPortalInviteCardProps {
  clientId: string
  clientEmail: string
  clientName: string
  invitations: ClientInvitation[]
  canSendInvite?: boolean
  canRevokeInvite?: boolean
}

function statusBadge(status: ClientInvitation['status']) {
  switch (status) {
    case 'accepted':
      return { label: 'Active', icon: CheckCircle2, cls: 'bg-success-muted text-success' }
    case 'pending':
      return { label: 'Pending', icon: Clock, cls: 'bg-warning-muted text-warning' }
    case 'revoked':
      return { label: 'Revoked', icon: X, cls: 'bg-muted text-muted-foreground' }
    case 'expired':
      return { label: 'Expired', icon: AlertCircle, cls: 'bg-muted text-muted-foreground' }
    default:
      return { label: status, icon: AlertCircle, cls: 'bg-muted text-muted-foreground' }
  }
}

function relativeTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms)) return iso
  const abs = Math.abs(ms)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  if (abs < 60_000) return ms < 0 ? 'just now' : 'in a moment'
  if (minutes < 60) return ms < 0 ? `${minutes} min ago` : `in ${minutes} min`
  if (hours < 24) return ms < 0 ? `${hours}h ago` : `in ${hours}h`
  return ms < 0 ? `${days}d ago` : `in ${days}d`
}

export function ClientPortalInviteCard({
  clientId,
  clientEmail,
  clientName,
  invitations,
  canSendInvite = true,
  canRevokeInvite = true,
}: ClientPortalInviteCardProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'send' | 'revoke' | 'reset' | null>(null)

  // Portal is active once any invite has been accepted. Pending invites
  // after that are legacy/stray rows (server now refuses re-invite when a
  // profile is already linked) — still show them for revoke, but never as
  // the primary "send again" path.
  const hasAccepted = invitations.some((i) => i.status === 'accepted')
  const pendingInvite = invitations.find((i) => i.status === 'pending')

  const portalState: 'none' | 'pending' | 'active' = hasAccepted
    ? 'active'
    : pendingInvite
      ? 'pending'
      : 'none'

  function clearMessages() {
    setError(null)
    setSuccess(null)
  }

  function handleSend() {
    clearMessages()
    setBusyAction('send')
    startTransition(async () => {
      const result = await sendClientInvite(clientId)
      setBusyAction(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data?.demoInviteUrl) {
        setSuccess(
          `Demo mode: invite created without email. Copy this link:\n${result.data.demoInviteUrl}`
        )
      } else {
        setSuccess(`Invite sent to ${clientEmail}.`)
      }
      router.refresh()
    })
  }

  function handleRevoke(invitationId: string) {
    clearMessages()
    setBusyAction('revoke')
    startTransition(async () => {
      const result = await revokeClientInvite(invitationId)
      setBusyAction(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSuccess('Invite revoked.')
      router.refresh()
    })
  }

  // Admin-triggered password reset — only meaningful when the client
  // already has a portal account (otherwise there's no auth.users row to
  // reset). Send a Supabase recovery link branded via our Resend template,
  // landing on /auth/callback?code=… and then redirecting to /update-password.
  function handleResetPassword() {
    clearMessages()
    setBusyAction('reset')
    startTransition(async () => {
      const result = await adminSendClientPasswordReset(clientId)
      setBusyAction(null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const email = result.data?.targetEmail ?? clientEmail
      if (result.data?.demoResetUrl) {
        setSuccess(
          `Demo mode: password reset created without email for ${email}. Copy this link:\n${result.data.demoResetUrl}`
        )
      } else {
        setSuccess(
          `Password reset email sent to ${email}. They have one hour to click the link before it expires.`
        )
      }
      router.refresh()
    })
  }

  // A pending invite past its expiry is shown as Expired — the server
  // treats it as expired on accept, so the badge should not promise
  // otherwise. Resend extends the expiry, so the button stays as-is.
  const isInviteExpired = (inv: ClientInvitation) =>
    inv.status === 'pending' && new Date(inv.expires_at).getTime() < Date.now()

  const isPending = pending

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Client Portal Access</CardTitle>
            <CardDescription>
              {portalState === 'active' && 'This client can sign in to view their invoices.'}
              {portalState === 'pending' && 'An invite is out. Waiting for the client to set up their account.'}
              {portalState === 'none' && 'Send a one-time invite so this client can sign in and view their invoices.'}
            </CardDescription>
          </div>
          <PortalStatePill state={portalState} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
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

        <div className="flex flex-wrap items-center gap-3">
          {/* Active portal accounts must use password reset — a fresh invite
              cannot be accepted (one profile per client). Only show Send /
              Resend when no accepted invite exists yet. */}
          {canSendInvite && !hasAccepted ? (
            <Button onClick={handleSend} disabled={isPending}>
              {busyAction === 'send' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : pendingInvite ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Resend invite
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send portal invite
                </>
              )}
            </Button>
          ) : !canSendInvite && !hasAccepted ? (
            <p className="text-sm text-muted-foreground">You do not have permission to send portal invites.</p>
          ) : null}
          {/* Admin-triggered password reset. Only useful when there IS a
              portal account to reset (otherwise the invite path above is
              what the operator wants). Permission gate matches send invite. */}
          {canSendInvite && hasAccepted && (
            <Button
              variant="outline"
              onClick={handleResetPassword}
              disabled={isPending}
            >
              {busyAction === 'reset' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending reset…
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Reset password
                </>
              )}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {portalState === 'active'
              ? 'Reset will email a one-hour link to '
              : 'Invite will be emailed to '}
            <span className="font-medium text-foreground">{clientEmail}</span>.
          </p>
        </div>

        {invitations.length > 0 && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
              Recent invitations
            </p>
            <ul className="space-y-2">
              {invitations.slice(0, 5).map((inv) => {
                const badge = statusBadge(isInviteExpired(inv) ? 'expired' : inv.status)
                const Icon = badge.icon
                return (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                          badge.cls
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {badge.label}
                      </span>
                      <span className="text-muted-foreground truncate">
                        Sent {relativeTime(inv.created_at)}
                        {inv.status === 'pending' && ` · expires ${relativeTime(inv.expires_at)}`}
                        {inv.accepted_at && ` · accepted ${relativeTime(inv.accepted_at)}`}
                      </span>
                    </div>
                    {inv.status === 'pending' && canRevokeInvite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleRevoke(inv.id)}
                      >
                        {busyAction === 'revoke' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <X className="w-4 h-4 mr-1" />
                            Revoke
                          </>
                        )}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Invitations for {clientName}, sent to {clientEmail}.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PortalStatePill({ state }: { state: 'none' | 'pending' | 'active' }) {
  if (state === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-muted px-3 py-1 text-xs font-medium text-success">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Portal active
      </span>
    )
  }
  if (state === 'pending') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-muted px-3 py-1 text-xs font-medium text-warning">
        <Clock className="w-3.5 h-3.5" />
        Invite pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
      No portal access
    </span>
  )
}
