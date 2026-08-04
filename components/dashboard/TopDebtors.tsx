// components/dashboard/TopDebtors.tsx
// "Top debtors" widget — used on the Analytics page and the Clients
// → Dashboard tab. Renders the customers with the largest outstanding
// exposure so the operator can chase the highest-leverage accounts
// first. Each row shows the client, total outstanding, overdue
// portion, their average payment turnaround (from invoice issue to
// settle) and the date of their last payment — so the operator knows
// whether a slow payer is a new pattern or a long-running one.

import Link from 'next/link'
import { Users, ArrowRight, Clock, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { TopDebtor } from '@/lib/money-collection'

export interface TopDebtorsProps {
  debtors: TopDebtor[]
  max?: number
}

export function TopDebtors({ debtors, max = 5 }: TopDebtorsProps) {
  const shown = debtors.slice(0, max)

  return (
    <Card className="relative overflow-hidden border-border/70 bg-card p-0 shadow-none">
      <CardHeader className="border-b border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Top debtors
            </CardTitle>
            <CardDescription>
              Customers with the most outstanding money. Click a row to open the customer record
              and chase the balance.
            </CardDescription>
          </div>
          <Link
            href="/clients"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover"
          >
            See all clients
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-success-muted text-success">
              <Users className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">No outstanding balances.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Every active customer is fully paid up.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((debtor) => (
              <DebtorRow key={debtor.clientId} debtor={debtor} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DebtorRow({ debtor }: { debtor: TopDebtor }) {
  const overdueShare =
    debtor.outstanding > 0
      ? Math.round((debtor.overdueAmount / debtor.outstanding) * 100)
      : 0
  const speedLabel =
    debtor.avgDaysToPay == null
      ? 'No payment history'
      : debtor.avgDaysToPay <= 30
        ? 'Pays fast'
        : debtor.avgDaysToPay <= 45
          ? 'Pays on terms'
          : debtor.avgDaysToPay <= 60
            ? 'Slow payer'
            : 'Chronic late'

  const speedTone =
    debtor.avgDaysToPay == null
      ? 'text-muted-foreground'
      : debtor.avgDaysToPay <= 30
        ? 'text-success'
        : debtor.avgDaysToPay <= 45
          ? 'text-info'
          : debtor.avgDaysToPay <= 60
            ? 'text-warning'
            : 'text-destructive'

  return (
    <li>
      <Link
        href={`/clients/${debtor.clientId}`}
        className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/40 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {debtor.companyName || debtor.clientName}
          </p>
          {debtor.companyName ? (
            <p className="truncate text-xs text-muted-foreground">{debtor.clientName}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={cn('inline-flex items-center gap-1 font-medium', speedTone)}>
              <Clock className="h-3 w-3" />
              {speedLabel}
              {debtor.avgDaysToPay != null ? ` · ${debtor.avgDaysToPay}d avg` : ''}
            </span>
            {debtor.lastPaymentAt ? (
              <span>Last paid {formatDate(debtor.lastPaymentAt)}</span>
            ) : (
              <span className="text-warning">Never paid yet</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums text-foreground">
            {formatCurrency(debtor.outstanding)}
          </p>
          {debtor.overdueAmount > 0 ? (
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
              <TrendingDown className="h-3 w-3" />
              {formatCurrency(debtor.overdueAmount)} overdue · {overdueShare}%
            </p>
          ) : (
            <p className="text-[11px] font-medium text-muted-foreground">Within terms</p>
          )}
        </div>
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:inline" />
      </Link>
    </li>
  )
}