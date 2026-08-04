'use client'

// components/quote-requests/dashboard/QuoteRequestsOverTime.tsx
// Stacked area chart of request volume with a range toggle. Two series —
// Orders (info) and Quotes (warning) — stacked so the operator reads both the
// total inflow and the order/quote mix at once. Answers "how often are
// requests coming in?".

import { useMemo, useState } from 'react'
import {
  subDays,
  startOfDay,
  endOfDay,
  endOfWeek,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isWithinInterval,
  parseISO,
  format,
} from 'date-fns'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartContainer } from '@/components/dashboard/ChartContainer'
import type { QuoteDailyPoint } from '@/lib/quote-request-dashboard'

type Range = 'week' | 'month' | 'quarter' | 'year'

const RANGES: Record<Range, { label: string; windowDays: number; bucket: 'day' | 'week' | 'month' }> = {
  week: { label: '7 days', windowDays: 7, bucket: 'day' },
  month: { label: '30 days', windowDays: 30, bucket: 'day' },
  quarter: { label: '90 days', windowDays: 90, bucket: 'week' },
  year: { label: '12 months', windowDays: 365, bucket: 'month' },
}
const RANGE_ORDER: Range[] = ['week', 'month', 'quarter', 'year']
const DEFAULT_RANGE: Range = 'month'

interface Point {
  label: string
  fullLabel: string
  orders: number
  quotes: number
  total: number
}

function bucketDaily(
  range: Range,
  daily: QuoteDailyPoint[],
  endDate: Date
): Point[] {
  const config = RANGES[range]
  const end = startOfDay(endDate)
  const start = startOfDay(subDays(end, config.windowDays - 1))

  let bucketStarts: Date[] = []
  if (config.bucket === 'day') {
    bucketStarts = eachDayOfInterval({ start, end })
  } else if (config.bucket === 'week') {
    bucketStarts = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
  } else {
    bucketStarts = eachMonthOfInterval({ start, end })
  }

  return bucketStarts.map((bucketStart) => {
    const bucketEnd =
      config.bucket === 'day'
        ? endOfDay(bucketStart)
        : config.bucket === 'week'
          ? endOfWeek(bucketStart, { weekStartsOn: 1 })
          : endOfMonth(bucketStart)

    let orders = 0
    let quotes = 0
    for (const d of daily) {
      const day = startOfDay(parseISO(d.date))
      if (isWithinInterval(day, { start: bucketStart, end: bucketEnd })) {
        orders += d.orders
        quotes += d.quotes
      }
    }

    let label: string
    let fullLabel: string
    if (config.bucket === 'day') {
      label = config.windowDays <= 7 ? format(bucketStart, 'EEE') : format(bucketStart, 'd MMM')
      fullLabel = format(bucketStart, 'EEEE, d MMMM')
    } else if (config.bucket === 'week') {
      label = format(bucketStart, 'd MMM')
      fullLabel = `${format(bucketStart, 'd MMM')} – ${format(bucketEnd, 'd MMM')}`
    } else {
      label = format(bucketStart, 'MMM')
      fullLabel = format(bucketStart, 'MMMM yyyy')
    }

    return { label, fullLabel, orders, quotes, total: orders + quotes }
  })
}

export function QuoteRequestsOverTime({
  data,
  asOfDate,
}: {
  data: QuoteDailyPoint[]
  asOfDate?: string
}) {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const today = useMemo(
    () => startOfDay(asOfDate ? parseISO(asOfDate) : new Date()),
    [asOfDate]
  )
  const points = useMemo(() => bucketDaily(range, data, today), [range, data, today])
  const totalInRange = useMemo(() => points.reduce((s, p) => s + p.total, 0), [points])
  const hasData = totalInRange > 0

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Requests over time</CardTitle>
            <CardDescription className="mt-1">Orders vs quotes received</CardDescription>
          </div>
          <Tabs
            value={range}
            onValueChange={(value) => setRange(value as Range)}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              {RANGE_ORDER.map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {RANGES[key].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {totalInRange.toLocaleString('en-GB')}
            </p>
            <p className="text-xs text-muted-foreground">Total in selected range</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
              Orders
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
              Quotes
            </span>
          </div>
        </div>

        {hasData ? (
          <ChartContainer className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <defs>
                  <linearGradient id="qrOrdersFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="qrQuotesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--foreground)',
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    `${value} ${String(name).toLowerCase()}`,
                    name === 'orders' ? 'Orders' : 'Quotes',
                  ]}
                  labelFormatter={(_label, payload) => {
                    const p = payload?.[0]?.payload as Point | undefined
                    return p?.fullLabel ?? ''
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stackId="1"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#qrOrdersFill)"
                />
                <Area
                  type="monotone"
                  dataKey="quotes"
                  stackId="1"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#qrQuotesFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartContainer>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center">
            <p className="text-sm font-medium text-foreground">No requests in this period</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New shop requests will appear here automatically.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
