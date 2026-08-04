'use client'

import { formatCurrency } from '@/lib/utils'
import { DASHBOARD_RANGES, type DashboardRange } from '@/lib/dashboard-config'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ChartContainer } from './ChartContainer'

interface SalesChartProps {
  data: { label: string; fullLabel: string; invoiced: number; collected: number; invoiceCount: number }[]
  range: DashboardRange
}

interface SalesTooltipPayload {
  color?: string
  name?: string
  value?: number | string
  dataKey?: string
  payload?: { fullLabel?: string; invoiceCount?: number }
}

export function SalesChart({ data, range }: SalesChartProps) {
  const summary = computeSummary(data)

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Sales over time
            </CardTitle>
            <CardDescription className="mt-1">
              {DASHBOARD_RANGES[range].chartDescription}
            </CardDescription>
          </div>
          <SummaryStats summary={summary} />
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <ChartContainer className="h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sales-bar-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="collected-bar-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
                strokeOpacity={0.6}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(value) => `£${formatAxis(value)}`}
                width={60}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(value) => `${value}`}
                width={36}
                tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={<CustomTooltip />}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Bar
                yAxisId="left"
                dataKey="invoiced"
                name="Invoiced"
                fill="url(#sales-bar-fill)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Bar
                yAxisId="left"
                dataKey="collected"
                name="Collected"
                fill="url(#collected-bar-fill)"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="invoiceCount"
                name="Invoices"
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: 'var(--card)', stroke: 'var(--muted-foreground)', strokeWidth: 2 }}
                activeDot={{ r: 5, fill: 'var(--muted-foreground)' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: SalesTooltipPayload[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null

  const fullLabel = payload[0]?.payload?.fullLabel ?? label ?? ''
  const invoiceCount = payload[0]?.payload?.invoiceCount

  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-card p-3 text-xs shadow-lg shadow-foreground/10">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {fullLabel}
      </p>
      <div className="mt-2 space-y-1.5">
        {payload.map((entry) => {
          const isCount = entry.dataKey === 'invoiceCount'
          const display = isCount
            ? `${entry.value} invoice${Number(entry.value) === 1 ? '' : 's'}`
            : formatCurrency(Number(entry.value))
          return (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.name}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{display}</span>
            </div>
          )
        })}
      </div>
      {typeof invoiceCount === 'number' && payload.length < 3 ? (
        <p className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'} issued
        </p>
      ) : null}
    </div>
  )
}

function SummaryStats({ summary }: { summary: ReturnType<typeof computeSummary> }) {
  return (
    <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-left sm:text-right">
      <SummaryStat label="Invoiced" value={formatCurrency(summary.totalInvoiced)} />
      <SummaryStat label="Collected" value={formatCurrency(summary.totalCollected)} />
      <SummaryStat label="Peak" value={formatCurrency(summary.peak)} hint={summary.peakLabel} />
    </div>
  )
}

function SummaryStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function computeSummary(
  data: SalesChartProps['data']
): {
  totalInvoiced: number
  totalCollected: number
  peak: number
  peakLabel: string
} {
  if (data.length === 0) {
    return { totalInvoiced: 0, totalCollected: 0, peak: 0, peakLabel: '' }
  }
  const totalInvoiced = data.reduce((s, d) => s + d.invoiced, 0)
  const totalCollected = data.reduce((s, d) => s + d.collected, 0)
  const peakEntry = data.reduce((best, d) => (d.invoiced > best.invoiced ? d : best), data[0])
  return {
    totalInvoiced,
    totalCollected,
    peak: peakEntry.invoiced,
    peakLabel: peakEntry.label,
  }
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k`
  return `${value}`
}