'use client'

import { formatCurrency, formatPercentage, formatTrend, cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Sparkline } from './Sparkline'
import {
  PoundSterling,
  Wallet,
  Clock,
  AlertCircle,
  Percent,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react'

interface Trend {
  current: number
  previous: number
  change: number
  /** null when previous = 0 and current > 0 — rendered as "new". */
  percentage: number | null
  direction: 'up' | 'down' | 'flat'
}

interface KpiCardsProps {
  totalSales: number
  totalCollected: number
  totalOutstanding: number
  totalOverdue: number
  collectionRate: number
  invoiceCount: number
  salesTrend: Trend
  collectedTrend: Trend
  collectionRateTrend: Trend
  outstandingTrend: Trend
  overdueTrend: Trend
  /**
   * Per-period invoiced totals, oldest first, used to draw the sparkline on
   * the "Total Sales" card. Falls back to a flat line if not supplied.
   */
  salesSeries?: number[]
  /**
   * Per-period collected totals, oldest first, used to draw the sparkline on
   * the "Collected" card.
   */
  collectedSeries?: number[]
}

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'info'

type IconKey = 'sales' | 'collected' | 'outstanding' | 'overdue' | 'rate'

const ICONS: Record<IconKey, LucideIcon> = {
  sales: PoundSterling,
  collected: Wallet,
  outstanding: Clock,
  overdue: AlertCircle,
  rate: Percent,
}

const TONE_ICON_SURFACE: Record<Tone, string> = {
  primary: 'surface-accent-primary text-primary-foreground shadow-sm shadow-primary/20',
  success: 'surface-accent-success text-success-foreground shadow-sm shadow-success/20',
  warning: 'surface-accent-warning text-warning-foreground shadow-sm shadow-warning/20',
  destructive: 'surface-accent-destructive text-destructive-foreground shadow-sm shadow-destructive/20',
  info: 'surface-accent-info text-info-foreground shadow-sm shadow-info/20',
}

const TONE_ACCENT: Record<Tone, string> = {
  primary: 'before:bg-primary',
  success: 'before:bg-success',
  warning: 'before:bg-warning',
  destructive: 'before:bg-destructive',
  info: 'before:bg-info',
}

const TONE_SPARKLINE: Record<Tone, 'primary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  info: 'info',
}

export function KpiCards({
  totalSales,
  totalCollected,
  totalOutstanding,
  totalOverdue,
  collectionRate,
  invoiceCount,
  salesTrend,
  collectedTrend,
  collectionRateTrend,
  outstandingTrend,
  overdueTrend,
  salesSeries,
  collectedSeries,
}: KpiCardsProps) {
  const items: Array<{
    key: IconKey
    title: string
    value: number
    isPercentage?: boolean
    subtitle: string
    trend: Trend
    invertTrend?: boolean
    tone: Tone
    sparkline?: number[]
  }> = [
    {
      key: 'sales',
      title: 'Total Sales',
      value: totalSales,
      subtitle: `${invoiceCount.toLocaleString()} invoice${invoiceCount === 1 ? '' : 's'} in period`,
      trend: salesTrend,
      tone: 'primary',
      sparkline: salesSeries,
    },
    {
      key: 'collected',
      title: 'Collected',
      value: totalCollected,
      subtitle: `${formatPercentage(collectionRate)} of invoiced`,
      trend: collectedTrend,
      tone: 'success',
      sparkline: collectedSeries,
    },
    {
      key: 'outstanding',
      title: 'Outstanding',
      value: totalOutstanding,
      subtitle: 'Awaiting payment',
      trend: outstandingTrend,
      invertTrend: true,
      tone: 'warning',
    },
    {
      key: 'overdue',
      title: 'Overdue',
      value: totalOverdue,
      subtitle: 'Past due date',
      trend: overdueTrend,
      invertTrend: true,
      tone: 'destructive',
    },
    {
      key: 'rate',
      title: 'Collection Rate',
      value: collectionRate,
      isPercentage: true,
      subtitle: 'Collected vs invoiced',
      trend: collectionRateTrend,
      tone: 'info',
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 stagger-children">
      {items.map((item) => {
        const trendDirection = item.trend.direction
        const isUpGood = !item.invertTrend
        const trendIsPositive =
          trendDirection === 'flat'
            ? null
            : trendDirection === 'up'
              ? isUpGood
              : !isUpGood
        const TrendIcon =
          trendDirection === 'up'
            ? TrendingUp
            : trendDirection === 'down'
              ? TrendingDown
              : Minus

        const trendColor =
          trendIsPositive === null
            ? 'text-muted-foreground bg-muted'
            : trendIsPositive
              ? 'text-success bg-success-muted'
              : 'text-destructive bg-destructive-muted'

        const Icon = ICONS[item.key]
        const showSparkline = item.sparkline && item.sparkline.length >= 2

        return (
          <Card
            key={item.title}
            className={cn(
              'group relative overflow-hidden border-border/70 bg-card p-0 shadow-none',
              'transition-all duration-200',
              'hover:-translate-y-0.5 hover:border-border hover:shadow-md hover:shadow-foreground/5',
              'before:absolute before:left-0 before:right-0 before:top-0 before:h-[3px] before:content-[""]',
              TONE_ACCENT[item.tone]
            )}
          >
            {/* Decorative blur — gives each card a subtle depth cue */}
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

              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
                  {item.isPercentage
                    ? formatPercentage(item.value)
                    : formatCurrency(item.value)}
                </p>
                {showSparkline ? (
                  <div className="shrink-0 -mb-0.5 opacity-90 transition-opacity group-hover:opacity-100">
                    <Sparkline
                      values={item.sparkline!}
                      tone={TONE_SPARKLINE[item.tone]}
                      width={84}
                      height={28}
                      ariaLabel={`${item.title} trend`}
                    />
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs">
                <span className="text-muted-foreground truncate">{item.subtitle}</span>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold tabular-nums',
                    trendColor
                  )}
                  title={`Previous period: ${
                    item.isPercentage
                      ? formatPercentage(item.trend.previous)
                      : formatCurrency(item.trend.previous)
                  }`}
                >
                  <TrendIcon className="h-3 w-3" strokeWidth={2.5} />
                  {item.trend.percentage === null ? 'new' : formatTrend(item.trend.percentage)}
                </span>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}