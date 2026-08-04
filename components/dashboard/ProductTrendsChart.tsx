'use client'

// components/dashboard/ProductTrendsChart.tsx
//
// Multi-line chart of revenue over time for the top 5 products. Lives
// inside the "Product Dashboard" tab on the Products page. Helps the operator
// answer: "When does each product move best? Is it the same month as
// last year?"
//
// Design notes:
//   - Recharts LineChart, one line per product.
//   - Buckets are monthly (12 months) to keep the chart readable; we
//     use a sibling component (`ProductSeasonalityHeatmap`) for the
//     denser month-by-product grid.
//   - The legend collapses on small screens (Recharts default).
//   - Hovering a point shows a tooltip with the product, month and £.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer } from './ChartContainer'
import type { ProductTrendSeries } from '@/lib/product-analytics'
import { formatCurrency } from '@/lib/utils'

interface ProductTrendsChartProps {
  data: ProductTrendSeries
}

// Eight visually-distinct tones for the legend + lines. Picked to stay
// readable on both the light primary-tinted background and the dark
// variant.
const SERIES_TONES = [
  'var(--primary)',
  'var(--info)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
] as const

interface TooltipPayload {
  color?: string
  name?: string
  value?: number | string
  dataKey?: string
  payload?: Record<string, number | string>
}

export function ProductTrendsChart({ data }: ProductTrendsChartProps) {
  const products = data.products
  // Stable series keys: product names can collide or contain dots
  // (Recharts treats dots in a dataKey as nested paths), so lines are
  // keyed by the product code, falling back to the index. The name is
  // only used for the legend label / tooltip.
  const series = products.map((p, i) => ({ ...p, key: p.code ?? `product-${i}` }))
  const points = data.points.map((p) => {
    const row: Record<string, string | number> = {
      bucket: p.bucket,
      label: p.label,
      fullLabel: p.fullLabel,
    }
    for (const prod of series) {
      row[prod.key] = p.byProduct[prod.name] ?? 0
    }
    return row
  })

  const grandTotal = products.reduce((s, p) => s + p.revenue, 0)

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Top product trends
            </CardTitle>
            <CardDescription className="mt-1">
              Monthly revenue for your best 5 sellers over the last 12 months.
              Spikes = seasonal demand. Flat lines = opportunity to promote.
            </CardDescription>
          </div>
          <SummaryStats total={grandTotal} products={products.length} />
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {products.length === 0 ? (
          <EmptyState />
        ) : (
          <ChartContainer className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
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
                  tickFormatter={(value) => `£${formatAxis(value)}`}
                  width={56}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '2 2' }}
                  content={<TrendsTooltip series={series} />}
                />
                <Legend
                  iconType="plainline"
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                />
                {series.map((p, i) => (
                  <Line
                    key={p.key}
                    type="monotone"
                    dataKey={p.key}
                    name={p.name}
                    stroke={SERIES_TONES[i % SERIES_TONES.length]}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: 'var(--card)' }}
                    activeDot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function TrendsTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
  series: { name: string; key: string }[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const fullLabel = payload[0]?.payload?.fullLabel ?? label ?? ''
  const rows = series
    .map((s) => {
      const entry = payload.find((p) => p.dataKey === s.key)
      return { name: s.name, value: Number(entry?.value ?? 0), color: entry?.color }
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const monthTotal = rows.reduce((s, r) => s + r.value, 0)

  return (
    <div className="min-w-[200px] rounded-lg border border-border bg-card p-3 text-xs shadow-lg shadow-foreground/10">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {fullLabel}
      </p>
      <div className="mt-2 space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">No sales in this period.</p>
        ) : (
          rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                <span className="max-w-[140px] truncate">{r.name}</span>
              </span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatCurrency(r.value)}
              </span>
            </div>
          ))
        )}
      </div>
      {monthTotal > 0 ? (
        <p className="mt-2 border-t border-border pt-1.5 text-[11px] font-medium text-muted-foreground">
          Month total: <span className="tabular-nums text-foreground">{formatCurrency(monthTotal)}</span>
        </p>
      ) : null}
    </div>
  )
}

function SummaryStats({ total, products }: { total: number; products: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-left sm:text-right">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Combined revenue
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(total)}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Products tracked
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">{products}</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-foreground">No product sales yet.</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Issue some invoices with line items and the trend lines for your top sellers will appear here.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <a href="/invoices/new">Create invoice</a>
      </Button>
    </div>
  )
}

function formatAxis(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return `${value}`
}