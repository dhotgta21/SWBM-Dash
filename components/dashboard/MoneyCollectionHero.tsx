// components/dashboard/MoneyCollectionHero.tsx
// Headline money-collection widget for the Analytics page.
//
// Single row of four "money tiles" — Outstanding, Overdue, Due this
// week, DSO — plus a thin collection-rate strip beneath. The hero
// mirrors the TodaySnapshot treatment (dot-grid background, dual
// glows) so the page reads as a coordinated pair of headline cards
// but with a different palette (warning + destructive on the left
// half, info + success on the right half) so the two cards don't
// read as duplicates.

import { Clock, AlertCircle, Wallet, CalendarClock, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import type { CollectionTotals } from '@/lib/money-collection'

export interface MoneyCollectionHeroProps {
  totals: CollectionTotals
  dso: number | null
  /** 0–1 — what fraction of the period's invoices have been collected. */
  collectionRate: number
  /** Optional — same value the KPI cards use. Lets the strip below
   *  the hero show a target / progress. */
  collectedThisPeriod?: number
  invoicedThisPeriod?: number
}

const DSO_HELP = {
  great: { label: 'Healthy', tone: 'text-success', hint: 'Money is coming in fast.' },
  ok: { label: 'OK', tone: 'text-info', hint: 'Within typical trade terms.' },
  slow: { label: 'Slow', tone: 'text-warning', hint: 'Chasing overdue accounts will help.' },
  bad: { label: 'Critical', tone: 'text-destructive', hint: 'Cash flow at risk — chase overdue now.' },
} as const

function dsoBucket(days: number | null): (typeof DSO_HELP)[keyof typeof DSO_HELP] {
  if (days == null) return DSO_HELP.ok
  if (days <= 30) return DSO_HELP.great
  if (days <= 45) return DSO_HELP.ok
  if (days <= 60) return DSO_HELP.slow
  return DSO_HELP.bad
}

export function MoneyCollectionHero({
  totals,
  dso,
  collectionRate,
  collectedThisPeriod = 0,
  invoicedThisPeriod = 0,
}: MoneyCollectionHeroProps) {
  const overdueRatio =
    totals.outstandingTotal > 0
      ? totals.overdueTotal / totals.outstandingTotal
      : 0
  const overduePct = Math.round(overdueRatio * 100)
  const dsoHelp = dsoBucket(dso)
  const collectionPct = Math.round(collectionRate * 100)

  return (
    <Card className="relative overflow-hidden border-border/70 bg-card p-0 shadow-none animate-dashboard-fade">
      {/* Background — same dot-grid + dual-glow treatment as
          TodaySnapshot so the page's two hero cards feel like
          siblings, but with different glow colours so they read as
          distinct sections. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-destructive/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-20 h-56 w-56 rounded-full bg-info/8 blur-3xl"
      />

      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-12 lg:gap-8 lg:p-7">
        {/* Primary: Outstanding money owed */}
        <div className="lg:col-span-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-60 animate-pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            Money collection
          </div>
          <p className="mt-3 text-sm font-medium text-foreground/80">Outstanding right now</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[2.75rem] sm:leading-[1.05]">
            {formatCurrency(totals.outstandingTotal)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Across{' '}
            <span className="font-medium text-foreground">{totals.invoiceCount}</span>{' '}
            live invoice{totals.invoiceCount === 1 ? '' : 's'} from{' '}
            <span className="font-medium text-foreground">{totals.clientCount}</span>{' '}
            client{totals.clientCount === 1 ? '' : 's'}.
          </p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <InlineStat
              label="Overdue"
              value={formatCurrency(totals.overdueTotal)}
              sub={`${totals.overdueCount} invoice${totals.overdueCount === 1 ? '' : 's'}`}
              tone="destructive"
              icon={AlertCircle}
            />
            <InlineStat
              label="Due today"
              value={formatCurrency(totals.dueTodayTotal)}
              sub={`${totals.dueTodayCount} to chase`}
              tone="warning"
              icon={Clock}
            />
            <InlineStat
              label="Due 7d"
              value={formatCurrency(totals.dueThisWeekTotal)}
              sub={`${totals.dueThisWeekCount} upcoming`}
              tone="info"
              icon={CalendarClock}
            />
          </div>
        </div>

        {/* Secondary: DSO + Collection rate strip */}
        <div className="lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-2">
            <DsoCard days={dso} help={dsoHelp} />
            <CollectionRateCard
              pct={collectionPct}
              overduePct={overduePct}
              overdueAmount={totals.overdueTotal}
              collected={collectedThisPeriod}
              invoiced={invoicedThisPeriod}
            />
          </div>

          {/* Two-up summary band */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TallyTile
              label="Collected today"
              value={formatCurrency(totals.collectedToday)}
              tone="success"
              icon={Wallet}
            />
            <TallyTile
              label="Collected this month"
              value={formatCurrency(totals.collectedThisMonth)}
              tone="success"
              icon={TrendingUp}
            />
            <TallyTile
              label="Overdue"
              value={formatCurrency(totals.overdueTotal)}
              tone={totals.overdueTotal > 0 ? 'destructive' : 'muted'}
              icon={AlertCircle}
              pulse={totals.overdueTotal > 0}
            />
            <TallyTile
              label="DSO"
              value={dso != null ? `${dso}d` : '—'}
              sub={dsoHelp.label}
              tone="info"
              icon={Clock}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}

function InlineStat({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  sub: string
  tone: 'destructive' | 'warning' | 'info'
  icon: React.ComponentType<{ className?: string }>
}) {
  const tones = {
    destructive: 'bg-destructive-muted text-destructive ring-destructive/20',
    warning: 'bg-warning-muted text-warning ring-warning/20',
    info: 'bg-info-muted text-info ring-info/20',
  }[tone]
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md ring-1',
            tones
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 text-base font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  )
}

function DsoCard({
  days,
  help,
}: {
  days: number | null
  help: { label: string; tone: string; hint: string }
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Days Sales Outstanding
        </p>
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', help.tone)}>
          {help.label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-foreground">
        {days != null ? `${days}` : '—'}
        <span className="ml-1 text-base font-medium text-muted-foreground">days</span>
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{help.hint}</p>
    </div>
  )
}

function CollectionRateCard({
  pct,
  overduePct,
  overdueAmount,
  collected,
  invoiced,
}: {
  pct: number
  overduePct: number
  overdueAmount: number
  collected: number
  invoiced: number
}) {
  // Visualise the collection rate as a split bar — green segment is
  // what's been collected this period, red segment is what's
  // overdue. Makes the "where's the money?" question legible in one
  // glance without forcing the eye to scan four separate numbers.
  const barColor =
    pct >= 80
      ? 'bg-success'
      : pct >= 60
        ? 'bg-info'
        : pct >= 40
          ? 'bg-warning'
          : 'bg-destructive'

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Collection rate
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          this period
        </p>
      </div>
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums text-foreground">
        {pct}
        <span className="ml-1 text-base font-medium text-muted-foreground">%</span>
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          aria-hidden
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{formatCurrency(collected)} collected of {formatCurrency(invoiced || 0)}</span>
        {overduePct > 0 ? (
          <span className="text-destructive font-medium">{overduePct}% overdue</span>
        ) : (
          <span className="text-success font-medium">No overdue</span>
        )}
      </div>
    </div>
  )
}

function TallyTile({
  label,
  value,
  sub,
  tone,
  icon: Icon,
  pulse = false,
}: {
  label: string
  value: string
  sub?: string
  tone: 'success' | 'destructive' | 'info' | 'muted'
  icon: React.ComponentType<{ className?: string }>
  pulse?: boolean
}) {
  const tones = {
    success: 'bg-success-muted text-success ring-success/20',
    destructive: 'bg-destructive-muted text-destructive ring-destructive/20',
    info: 'bg-info-muted text-info ring-info/20',
    muted: 'bg-muted text-muted-foreground ring-border',
  }[tone]
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'relative inline-flex h-7 w-7 items-center justify-center rounded-md ring-1',
            tones
          )}
        >
          {pulse ? (
            <span className="absolute inset-0 rounded-md ring-2 ring-destructive/30 animate-pulse-dot" />
          ) : null}
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}