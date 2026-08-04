// components/clients/ClientKpiStrip.tsx
// Headline KPI strip for the Client Dashboard. Four small cards in a
// responsive grid that mirror the visual language used by the
// Analytics KPI strip but with client-specific numbers and a static
// (non-trending) treatment — the client base doesn't move on a
// minute-by-minute basis the way invoiced/collected totals do, so
// trend deltas would mostly be noise.
//
// Money figures are blanked when `showMoney` is false (the operator
// lacks `clients_see_money`). The count cards always render.

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Users, Wallet, UserCheck, Receipt, type LucideIcon } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

type Tone = 'primary' | 'success' | 'warning' | 'info' | 'destructive'

const TONE_ICON_SURFACE: Record<Tone, string> = {
  primary: 'surface-accent-primary text-primary-foreground shadow-sm shadow-primary/20',
  success: 'surface-accent-success text-success-foreground shadow-sm shadow-success/20',
  warning: 'surface-accent-warning text-warning-foreground shadow-sm shadow-warning/20',
  info: 'surface-accent-info text-info-foreground shadow-sm shadow-info/20',
  destructive: 'surface-accent-destructive text-destructive-foreground shadow-sm shadow-destructive/20',
}

const TONE_ACCENT: Record<Tone, string> = {
  primary: 'before:bg-primary',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  info: 'before:bg-info',
  destructive: 'before:bg-destructive',
}

export interface ClientKpiStripProps {
  totalClients: number
  activeClients: number
  withBalance: number
  totalOutstanding: number
  averageBalance: number | null
  aiReviewPending: number
  temporaryPending: number
  /** When false, all £ values render as em-dashes. */
  showMoney: boolean
}

interface KpiItem {
  key: string
  title: string
  value: string
  caption: string
  icon: LucideIcon
  tone: Tone
  /** When true, the card hides £ values (used for the average row
   *  when the operator can't see money — we just blank the entire
   *  card rather than rendering a useless "—" twice). */
  moneyCard: boolean
}

export function ClientKpiStrip({
  totalClients,
  activeClients,
  withBalance,
  totalOutstanding,
  averageBalance,
  aiReviewPending,
  temporaryPending,
  showMoney,
}: ClientKpiStripProps) {
  const items: KpiItem[] = [
    {
      key: 'total',
      title: 'Account clients',
      value: totalClients.toLocaleString(),
      caption: `${activeClients.toLocaleString()} active (with invoices)`,
      icon: Users,
      tone: 'primary',
      moneyCard: false,
    },
    {
      key: 'balance',
      title: 'With balance',
      value: withBalance.toLocaleString(),
      caption:
        withBalance > 0
          ? `${totalClients > 0 ? Math.round((withBalance / totalClients) * 100) : 0}% of accounts`
          : 'No outstanding balances',
      icon: UserCheck,
      tone: withBalance > 0 ? 'warning' : 'success',
      moneyCard: false,
    },
    {
      key: 'outstanding',
      title: 'Total outstanding',
      value: showMoney ? formatCurrency(totalOutstanding) : '—',
      caption: showMoney
        ? `Across ${withBalance} client${withBalance === 1 ? '' : 's'}`
        : 'Money hidden by your permissions',
      icon: Wallet,
      tone: totalOutstanding > 0 ? 'destructive' : 'success',
      moneyCard: true,
    },
    {
      key: 'avg',
      title: 'Avg balance / client',
      value:
        showMoney && averageBalance != null
          ? formatCurrency(averageBalance)
          : showMoney
            ? '—'
            : '—',
      caption: showMoney
        ? averageBalance == null
          ? 'Everyone is paid up'
          : 'For clients with a balance'
        : 'Money hidden by your permissions',
      icon: Receipt,
      tone: 'info',
      moneyCard: true,
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card
            key={item.key}
            className={cn(
              'group relative overflow-hidden border-border/70 bg-card p-0 shadow-none',
              'transition-all duration-200',
              'hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-foreground/5',
              'before:absolute before:left-0 before:right-0 before:top-0 before:h-[3px] before:content-[""]',
              TONE_ACCENT[item.tone]
            )}
          >
            <div
              aria-hidden
              className={cn(
                'pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.07] blur-2xl',
                item.tone === 'primary' && 'bg-primary',
                item.tone === 'success' && 'bg-success',
                item.tone === 'warning' && 'bg-warning',
                item.tone === 'destructive' && 'bg-destructive',
                item.tone === 'info' && 'bg-info'
              )}
            />

            <div className="relative p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {item.title}
                  </p>
                </div>
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    TONE_ICON_SURFACE[item.tone]
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2.25} />
                </div>
              </div>

              <div className="mt-3">
                <p className="text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
                  {item.value}
                </p>
              </div>

              <div className="mt-3 text-xs text-muted-foreground truncate">
                {item.caption}
              </div>
            </div>
          </Card>
        )
      })}

      {/* Onboarding pulse row — kept tight below the KPI grid so the
          operator sees the queue depth without having to scroll. */}
      {(aiReviewPending > 0 || temporaryPending > 0) ? (
        <Card className="sm:col-span-2 lg:col-span-4 border-amber-200 bg-amber-50/60 p-0 shadow-none">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
            <span className="font-semibold text-amber-900">Onboarding queue:</span>
            {aiReviewPending > 0 ? (
              <Link
                href="/clients?view=accounts&filter=ai-review"
                className="inline-flex items-center gap-1.5 text-amber-900 hover:text-amber-950"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">
                  {aiReviewPending > 99 ? '99+' : aiReviewPending}
                </span>
                AI-created client{aiReviewPending === 1 ? '' : 's'} need review
              </Link>
            ) : null}
            {temporaryPending > 0 ? (
              <Link
                href="/clients?view=temporary"
                className="inline-flex items-center gap-1.5 text-amber-900 hover:text-amber-950"
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold">
                  {temporaryPending > 99 ? '99+' : temporaryPending}
                </span>
                walk-in client{temporaryPending === 1 ? '' : 's'} pending completion
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
