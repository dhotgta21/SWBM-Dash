// components/settings/IpBanManager.tsx
// Admin-only panel for managing banned IPs. Two halves:
//
//   1. Currently-banned list — every active ban (no expiry, or expiry
//      still in the future). "Lift ban" button per row.
//   2. Manual ban form — IP + reason + optional expiry. Used when a
//      persistent spammer is below the auto-ban threshold.
//
// The initial list is loaded server-side and revalidated on every
// action so the UI stays in sync without a refresh.

'use client'

import { useMemo, useState, useTransition } from 'react'
import { ShieldOff, ShieldAlert, ShieldCheck, Loader2, Ban, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import {
  banIpManually,
  unbanIpById,
  type IpBanRow,
} from '@/lib/actions/admin-ip-bans'

interface IpBanManagerProps {
  initialBans: IpBanRow[]
  canManageIpBans?: boolean
}

type Feedback = { kind: 'ok' | 'err'; message: string } | null

export function IpBanManager({ initialBans, canManageIpBans = true }: IpBanManagerProps) {
  const [bans, setBans] = useState<IpBanRow[]>(initialBans)
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  // Manual-ban form state.
  const [ip, setIp] = useState('')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  const hasBans = bans.length > 0

  // Optimistic lift — we still call the server, but if it succeeds we
  // drop the row from local state immediately so the admin sees
  // instant feedback.
  function liftBan(ban: IpBanRow) {
    setBusyId(ban.id)
    setFeedback(null)
    startTransition(async () => {
      const result = await unbanIpById(ban.id)
      setBusyId(null)
      if (!result.ok) {
        setFeedback({ kind: 'err', message: result.error ?? 'Could not lift the ban.' })
        return
      }
      setBans((prev) => prev.filter((b) => b.id !== ban.id))
      setFeedback({ kind: 'ok', message: `Lifted ban on ${ban.ip_address}.` })
    })
  }

  function submitManualBan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await banIpManually({
        ip: ip.trim(),
        reason: reason.trim(),
        expiresAt: expiresAt.trim() || undefined,
      })
      if (!result.ok) {
        setFeedback({ kind: 'err', message: result.error ?? 'Could not save the ban.' })
        return
      }
      setIp('')
      setReason('')
      setExpiresAt('')
      setFeedback({
        kind: 'ok',
        message: `Banned ${result.ok ? ip.trim() : 'the IP'}. Reload the page to see it in the list.`,
      })
      // We don't optimistically insert — the server revalidates and
      // the next page load picks up the new row.
    })
  }

  const sortedBans = useMemo(
    () => [...bans].sort((a, b) => (a.banned_at < b.banned_at ? 1 : -1)),
    [bans]
  )

  if (!canManageIpBans) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to manage IP bans.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p>
          IPs get auto-banned when more than 3 distinct email addresses
          submit quote requests from the same connection within 24
          hours. Lift a ban if it was a false positive (shared office
          NAT, VPN exit, etc.) or use the form below for one-off blocks.
        </p>
      </div>

      {feedback && (
        <Alert
          variant={feedback.kind === 'ok' ? 'default' : 'destructive'}
          className={cn(
            feedback.kind === 'ok' &&
              'border-success/30 bg-success/10 text-success [&>svg]:text-success'
          )}
        >
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      )}

      <section>
        <header className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Active bans</h3>
          <span className="text-xs text-muted-foreground">
            {bans.length} {bans.length === 1 ? 'ban' : 'bans'}
          </span>
        </header>

        {!hasBans ? (
          <div className="rounded-md border border-dashed border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
            <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No active bans. Quote requests are accepted from any IP.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {sortedBans.map((ban) => {
              const isLifting = busyId === ban.id && pending
              return (
                <li
                  key={ban.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-secondary px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                        {ban.ip_address}
                      </code>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          ban.is_automatic
                            ? 'bg-warning-muted text-warning'
                            : 'bg-primary/10 text-primary'
                        )}
                      >
                        {ban.is_automatic ? (
                          <>
                            <ShieldAlert className="h-3 w-3" />
                            Auto
                          </>
                        ) : (
                          <>
                            <Ban className="h-3 w-3" />
                            Manual
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{ban.reason}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Banned {new Date(ban.banned_at).toLocaleString()}
                      {ban.expires_at && (
                        <>
                          {' · expires '}
                          {new Date(ban.expires_at).toLocaleString()}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => liftBan(ban)}
                    disabled={isLifting}
                  >
                    {isLifting ? (
                      <>
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Lifting…
                      </>
                    ) : (
                      <>
                        <ShieldOff className="mr-2 h-3.5 w-3.5" />
                        Lift ban
                      </>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <header className="mb-2">
          <h3 className="text-sm font-semibold text-foreground">Ban an IP manually</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use when a persistent spammer is below the auto-ban threshold.
            Leave the expiry blank for a permanent block.
          </p>
        </header>

        <form onSubmit={submitManualBan} className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ban-ip">IP address</Label>
              <Input
                id="ban-ip"
                type="text"
                inputMode="text"
                placeholder="203.0.113.42"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ban-expires">Expires (optional)</Label>
              <Input
                id="ban-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ban-reason">Reason</Label>
            <Input
              id="ban-reason"
              type="text"
              placeholder="Persistent quote spam, no legitimate submissions"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={280}
              disabled={pending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Ban className="mr-2 h-4 w-4" />
                  Ban IP
                </>
              )}
            </Button>
          </div>
        </form>
      </section>

      <p className="text-xs text-muted-foreground">
        Tip: if you need to undo an automatic ban that keeps re-firing,
        find the IP in the list above and lift it once &mdash; the
        <code className="mx-1 rounded bg-secondary px-1 font-mono text-[10px]">
          ip_email_log
        </code>
        rows from the last 24h will expire on their own and the
        threshold will reset.
        <RotateCcw className="ml-1 inline h-3 w-3 align-text-bottom" />
      </p>
    </div>
  )
}
