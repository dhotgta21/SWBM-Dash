'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  DASHBOARD_RANGE_ORDER,
  DASHBOARD_RANGES,
  DEFAULT_DASHBOARD_RANGE,
  type DashboardRange,
} from '@/lib/dashboard-config'

interface DashboardRangeControlProps {
  current: DashboardRange
}

const RANGE_TAB_LABEL: Record<DashboardRange, string> = {
  week: '7 days',
  month: '30 days',
  year: '12 months',
}

export function DashboardRangeControl({ current }: DashboardRangeControlProps) {
  const searchParams = useSearchParams()

  const buildHref = (range: DashboardRange) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('range', range)
    return `/dashboard?${params.toString()}`
  }

  return (
    <div
      role="tablist"
      aria-label="Dashboard time range"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-card p-0.5 shadow-sm shadow-foreground/[0.02]"
    >
      {DASHBOARD_RANGE_ORDER.map((range) => {
        const isActive = range === (current ?? DEFAULT_DASHBOARD_RANGE)
        const config = DASHBOARD_RANGES[range]
        return (
          <Link
            key={range}
            role="tab"
            aria-selected={isActive}
            href={buildHref(range)}
            scroll={false}
            className={cn(
              'relative inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              isActive
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
            title={config.label}
          >
            {RANGE_TAB_LABEL[range]}
          </Link>
        )
      })}
    </div>
  )
}