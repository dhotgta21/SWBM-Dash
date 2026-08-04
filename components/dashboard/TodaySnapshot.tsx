'use client'

import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import {
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarCheck,
  Clock,
  CircleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

interface TodaySnapshotProps {
  collectedToday: number
  dueTodayTotal: number
  dueTodayCount: number
  overdueTotal: number
  overdueCount: number
  dueThisWeekTotal: number
  averageDaysOverdue: number
  asOfDate: string
  currency?: string
}

interface Metric {
  label: string
  value: string
  icon: LucideIcon
  tone: 'success' | 'warning' | 'destructive' | 'info'
  hint: string
  href?: string
  /** Compact highlight — used for the primary stat at the top of the card. */
  primary?: boolean
}

/**
 * Hero card shown above the dashboard grid.
 *
 * Communicates "where you stand today" at a glance — what's been collected,
 * what's due now, what's overdue — and links straight to the actionable
 * lists underneath. Designed to be the first thing the eye lands on.
 */
export function TodaySnapshot({
  collectedToday,
  dueTodayTotal,
  dueTodayCount,
  overdueTotal,
  overdueCount,
  dueThisWeekTotal,
  averageDaysOverdue,
  asOfDate,
  currency = 'GBP',
}: TodaySnapshotProps) {
  const metrics: Metric[] = [
    {
      label: 'Collected today',
      value: formatCurrency(collectedToday, currency),
      icon: Banknote,
      tone: 'success',
      hint: collectedToday > 0 ? 'Payments recorded so far' : 'No payments yet today',
      primary: true,
    },
    {
      label: 'Due today',
      value: formatCurrency(dueTodayTotal, currency),
      icon: CalendarCheck,
      tone: 'warning',
      hint:
        dueTodayCount > 0
          ? `${dueTodayCount} invoice${dueTodayCount === 1 ? '' : 's'} awaiting payment`
          : 'Nothing due today',
      href: '/invoices?view=due',
    },
    {
      label: 'Overdue',
      value: formatCurrency(overdueTotal, currency),
      icon: CircleAlert,
      tone: 'destructive',
      hint:
        overdueCount > 0
          ? `${overdueCount} invoice${overdueCount === 1 ? '' : 's'}${
              averageDaysOverdue > 0 ? ` · avg ${Math.round(averageDaysOverdue)}d late` : ''
            }`
          : 'All caught up',
      href: '/invoices?view=overdue',
    },
    {
      label: 'Due this week',
      value: formatCurrency(dueThisWeekTotal, currency),
      icon: Clock,
      tone: 'info',
      hint: 'Coming due in the next 7 days',
      href: '/invoices?view=due',
    },
  ]

  const primaryMetric = metrics.find((m) => m.primary)!
  const secondaryMetrics = metrics.filter((m) => !m.primary)

  return (
    <Card className="relative overflow-hidden border-border/70 bg-card p-0 shadow-none animate-dashboard-fade">
      {/* Decorative background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dot-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-info/6 blur-3xl"
      />

      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-12 lg:gap-8 lg:p-7">
        {/* Primary hero stat */}
        <div className="lg:col-span-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Today · {formatHeroDate(asOfDate)}
          </div>
          <p className="mt-3 text-sm font-medium text-foreground/80">Collected today</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[2.75rem] sm:leading-[1.05]">
            {primaryMetric.value}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{primaryMetric.hint}</p>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/invoices/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Wallet className="h-4 w-4" />
              New invoice
            </Link>
            <Link
              href="/invoices?view=list&status=overdue"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Review overdue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Secondary metric grid */}
        <div className="lg:col-span-7">
          <div className="grid gap-3 sm:grid-cols-3">
            {secondaryMetrics.map((metric) => (
              <SnapshotMetric key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function SnapshotMetric({ metric }: { metric: Metric }) {
  const Icon = metric.icon
  const toneClasses = {
    success: 'bg-success-muted text-success',
    warning: 'bg-warning-muted text-warning',
    destructive: 'bg-destructive-muted text-destructive',
    info: 'bg-info-muted text-info',
  }[metric.tone]

  const content = (
    <div className="group relative h-full rounded-xl border border-border/60 bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-foreground/5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {metric.label}
        </p>
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses)}>
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {metric.value}
      </p>
      <p className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground truncate">{metric.hint}</span>
        {metric.href ? (
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        ) : null}
      </p>
    </div>
  )

  return metric.href ? (
    <Link href={metric.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
      {content}
    </Link>
  ) : (
    content
  )
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function formatHeroDate(dateStr: string): string {
  // Parse as LOCAL date: `new Date('YYYY-MM-DD')` is UTC midnight, which
  // renders the wrong day in most time zones and mismatches hydration.
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}