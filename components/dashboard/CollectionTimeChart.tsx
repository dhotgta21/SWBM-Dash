'use client'

import { useMemo, useState } from 'react'
import {
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  isWithinInterval,
  format,
} from 'date-fns'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { PaymentDuration, CollectionTimePoint } from '@/lib/dashboard-types'
import {
  COLLECTION_TIME_RANGES,
  COLLECTION_TIME_RANGE_ORDER,
  DEFAULT_COLLECTION_TIME_RANGE,
  type CollectionTimeRange,
} from '@/lib/dashboard-config'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface CollectionTimeChartProps {
  data: PaymentDuration[]
  asOfDate?: string
}

function parseDate(dateStr: string): Date {
  return startOfDay(new Date(dateStr))
}

function bucketDurations(
  range: CollectionTimeRange,
  durations: PaymentDuration[],
  endDate: Date
): CollectionTimePoint[] {
  const config = COLLECTION_TIME_RANGES[range]
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
    // Week/month buckets snap to their natural boundary, which can fall
    // BEFORE the window start — clamp the first bucket so the chart
    // matches the "last N days" window.
    const effectiveStart = bucketStart < start ? start : bucketStart
    const bucketEnd =
      config.bucket === 'day'
        ? endOfDay(effectiveStart)
        : config.bucket === 'week'
          ? endOfWeek(effectiveStart, { weekStartsOn: 1 })
          : endOfMonth(effectiveStart)

    const bucketDurations = durations.filter((d) => {
      const paymentDate = parseDate(d.paymentDate)
      return isWithinInterval(paymentDate, { start: effectiveStart, end: bucketEnd })
    })

    // Empty buckets get null (not 0) so the line shows a gap instead of
    // a fake dip to zero.
    const averageDays =
      bucketDurations.length > 0
        ? Math.round(
            bucketDurations.reduce((sum, d) => sum + d.daysToPay, 0) / bucketDurations.length
          )
        : null

    let label: string
    let fullLabel: string
    if (config.bucket === 'day') {
      label = format(effectiveStart, 'EEE')
      fullLabel = format(effectiveStart, 'EEEE, d MMMM')
    } else if (config.bucket === 'week') {
      label = format(effectiveStart, 'd MMM')
      fullLabel = `${format(effectiveStart, 'd MMM')} – ${format(bucketEnd, 'd MMM')}`
    } else {
      label = format(effectiveStart, 'MMM')
      fullLabel = format(effectiveStart, 'MMMM yyyy')
    }

    return {
      label,
      fullLabel,
      averageDays,
      paymentCount: bucketDurations.length,
    }
  })
}

function getTrend(points: CollectionTimePoint[]): 'up' | 'down' | 'flat' {
  const nonEmpty = points.filter((p) => p.paymentCount > 0)
  if (nonEmpty.length < 2) return 'flat'
  const first = nonEmpty[0].averageDays ?? 0
  const last = nonEmpty[nonEmpty.length - 1].averageDays ?? 0
  if (last > first) return 'up'
  if (last < first) return 'down'
  return 'flat'
}

export function CollectionTimeChart({ data, asOfDate }: CollectionTimeChartProps) {
  const [range, setRange] = useState<CollectionTimeRange>(DEFAULT_COLLECTION_TIME_RANGE)

  const today = useMemo(() => startOfDay(asOfDate ? new Date(asOfDate) : new Date()), [asOfDate])

  const points = useMemo(() => bucketDurations(range, data, today), [range, data, today])
  const averageDays = useMemo(() => {
    const config = COLLECTION_TIME_RANGES[range]
    const end = today
    const start = startOfDay(subDays(end, config.windowDays - 1))
    const durationsInRange = data.filter((d) => {
      const paymentDate = parseDate(d.paymentDate)
      return isWithinInterval(paymentDate, { start: startOfDay(start), end: endOfDay(end) })
    })
    if (durationsInRange.length === 0) return 0
    return Math.round(
      durationsInRange.reduce((sum, d) => sum + d.daysToPay, 0) / durationsInRange.length
    )
  }, [data, range, today])
  const trend = useMemo(() => getTrend(points), [points])

  const hasData = points.some((p) => p.paymentCount > 0)

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor =
    trend === 'up' ? 'text-destructive' : trend === 'down' ? 'text-success' : 'text-muted-foreground'
  const trendLabel = trend === 'up' ? 'Slowing' : trend === 'down' ? 'Improving' : 'Stable'

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">Collection time</CardTitle>
            <CardDescription className="mt-1">Average days from issue to payment</CardDescription>
          </div>
          <Tabs
            value={range}
            onValueChange={(value) => setRange(value as CollectionTimeRange)}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              {COLLECTION_TIME_RANGE_ORDER.map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {COLLECTION_TIME_RANGES[key].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums text-foreground">
              {averageDays}
              <span className="ml-1 text-sm font-medium text-muted-foreground">days</span>
            </p>
            <p className="text-xs text-muted-foreground">Average across selected range</p>
          </div>
          {hasData && (
            <div className={`flex items-center gap-1.5 text-sm font-medium ${trendColor}`}>
              <TrendIcon className="h-4 w-4" />
              {trendLabel}
            </div>
          )}
        </div>

        {hasData ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
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
                  formatter={(value, _name, props) => {
                    const point = props.payload as CollectionTimePoint
                    return [
                      point.paymentCount > 0 ? `${value} days avg` : 'No payments',
                      point.fullLabel,
                    ]
                  }}
                  labelFormatter={() => ''}
                />
                <Line
                  type="monotone"
                  dataKey="averageDays"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--primary)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center">
            <p className="text-sm font-medium text-foreground">No payment data</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Payments recorded in this period will appear here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
