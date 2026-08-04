'use client'

// components/quote-requests/dashboard/QuoteKpiCards.tsx
// Top-line KPI strip for the Quote & order requests overview. Mirrors the
// visual language of components/dashboard/KpiCards.tsx (accent bar, icon
// surface, value + sparkline + trend pill) but formats counts as well as
// currency, since request volume — not money — is the headline here.

import { formatCurrency, formatPercentage, formatTrend, cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Sparkline } from '@/components/dashboard/Sparkline'
import type { QuoteKpiMetrics } from '@/lib/quote-request-dashboard'
import type { Trend } from '@/lib/dashboard-types'
import {
  Inbox,
  Clock,
  CheckCircle2,
  PoundSterling,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from 'lucide-react'

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'info'
type Format = 'count' | 'currency'

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

function formatValue(value: number, format: Format): string {
  if (format === 'currency') return formatCurrency(value)
  return Math.round(value).toLocaleString('en-GB')
}

interface CardDef {
  key: string
  title: string
  value: number
  format: Format
  subtitle: string
  trend: Trend
  invertTrend?: boolean
  tone: Tone
  icon: LucideIcon
  sparkline?: number[]
}

export function QuoteKpiCards({ metrics }: { metrics: QuoteKpiMetrics }) {
  const items: CardDef[] = [
    {
      key: 'total',
      title: 'Total requests',
      value: metrics.totalCount,
      format: 'count',
      subtitle: 'Last 30 days',
      trend: metrics.totalTrend,
      tone: 'primary',
      icon: Inbox,
      sparkline: metrics.totalSeries,
    },
    {
      key: 'awaiting',
      title: 'Awaiting review',
      value: metrics.openNow,
      format: 'count',
      subtitle: `+${metrics.pendingCreated.toLocaleString('en-GB')} new this period`,
      trend: metrics.pendingTrend,
      invertTrend: true,
      tone: 'warning',
      icon: Clock,
      sparkline: metrics.pendingSeries,
    },
    {
      key: 'converted',
      title: 'Converted',
      value: metrics.invoicedCount,
      format: 'count',
      subtitle: `${formatPercentage(metrics.conversionRate)} conversion`,
      trend: metrics.convertedTrend,
      tone: 'success',
      icon: CheckCircle2,
      sparkline: metrics.convertedSeries,
    },
    {
      key: 'pipeline',
      title: 'Estimated pipeline',
      value: metrics.pipelineValue,
      format: 'currency',
      subtitle: 'Last 30 days',
      trend: metrics.pipelineTrend,
      tone: 'info',
      icon: PoundSterling,
      sparkline: metrics.pipelineSeries,
    },
  ]

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
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

        const Icon = item.icon
        const showSparkline = item.sparkline && item.sparkline.length >= 2

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

              <div className="mt-3 flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
                  {formatValue(item.value, item.format)}
                </p>
                {showSparkline ? (
                  <div className="shrink-0 -mb-0.5 opacity-90 transition-opacity group-hover:opacity-100">
                    <Sparkline
                      values={item.sparkline!}
                      tone={item.tone}
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
