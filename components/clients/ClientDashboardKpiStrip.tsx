import { Card } from '@/components/ui/card'
import { Receipt, Wallet, Clock, TrendingUp, AlertCircle, type LucideIcon } from 'lucide-react'
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

interface ClientDashboardKpiStripProps {
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  accountBalance: number
  invoiceCount: number
  overdueCount: number
  averageDaysToPay: number | null
  showMoney: boolean
}

interface KpiItem {
  title: string
  value: string
  caption: string
  icon: LucideIcon
  tone: Tone
  moneyCard: boolean
}

export function ClientDashboardKpiStrip({
  totalInvoiced,
  totalPaid,
  totalOutstanding,
  accountBalance,
  invoiceCount,
  overdueCount,
  averageDaysToPay,
  showMoney,
}: ClientDashboardKpiStripProps) {
  const items: KpiItem[] = [
    {
      title: 'Total Invoiced',
      value: showMoney ? formatCurrency(totalInvoiced) : '—',
      caption: `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}`,
      icon: Receipt,
      tone: 'primary',
      moneyCard: true,
    },
    {
      title: 'Total Paid',
      value: showMoney ? formatCurrency(totalPaid) : '—',
      caption: showMoney ? `${totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0}% collected` : 'Money hidden',
      icon: TrendingUp,
      tone: 'success',
      moneyCard: true,
    },
    {
      title: 'Outstanding',
      value: showMoney ? formatCurrency(totalOutstanding) : '—',
      caption: overdueCount > 0 ? `${overdueCount} overdue` : 'All current',
      icon: AlertCircle,
      tone: totalOutstanding > 0 ? 'destructive' : 'success',
      moneyCard: true,
    },
    {
      title: 'Account Balance',
      value: showMoney ? formatCurrency(accountBalance) : '—',
      caption: accountBalance > 0 ? 'Credit available' : 'No prepaid credit',
      icon: Wallet,
      tone: accountBalance > 0 ? 'success' : 'info',
      moneyCard: true,
    },
    {
      title: 'Avg Days to Pay',
      value: averageDaysToPay != null ? `${averageDaysToPay}` : '—',
      caption: averageDaysToPay != null ? 'days' : 'No paid invoices yet',
      icon: Clock,
      tone: 'info',
      moneyCard: false,
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <Card
          key={item.title}
          className={cn(
            'relative h-full overflow-hidden border-border/70 p-0 shadow-none',
            'before:absolute before:left-0 before:right-0 before:top-0 before:h-[3px]',
            TONE_ACCENT[item.tone]
          )}
        >
          <div className="flex h-full flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  TONE_ICON_SURFACE[item.tone]
                )}
              >
                <item.icon className="h-4 w-4" strokeWidth={2.25} />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.title}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">
                {item.value}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.caption}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
