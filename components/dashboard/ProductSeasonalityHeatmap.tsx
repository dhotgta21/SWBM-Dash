'use client'

// components/dashboard/ProductSeasonalityHeatmap.tsx
//
// 12-month × top 10 products heatmap. Each cell is shaded by its share
// of the grid's max revenue so the eye can pick out seasonal spikes at
// a glance. Lives inside the "Product Dashboard" tab on the Products page.
//
// Why not recharts: recharts has no native heatmap, and the patterns we
// care about (per-row per-cell) are easier to render as a CSS grid.
// Going CSS keeps the payload small and the cells crisper on hi-dpi.
//
// Design notes:
//   - 12 columns (oldest left → newest right), N rows.
//   - Cell tint = cellRevenue / maxRevenue, clamped to [0,1] and
//     multiplied against a primary-tinted background gradient.
//   - Tooltip on hover shows the month, product, £ and order count.
//   - On narrow screens the grid stays scrollable horizontally rather
//     than re-flowing — keeps the month labels aligned across rows.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ProductSeasonalityReport } from '@/lib/product-analytics'

interface ProductSeasonalityHeatmapProps {
  data: ProductSeasonalityReport
}

export function ProductSeasonalityHeatmap({ data }: ProductSeasonalityHeatmapProps) {
  const monthColumns = data.rows[0]?.cells.map((c) => ({ month: c.month, label: c.monthLabel })) ?? []

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Seasonality
            </CardTitle>
            <CardDescription className="mt-1">
              Which months each top product sells. Darker cells = higher revenue.
              Use it to time promotions and restocking.
            </CardDescription>
          </div>
          {data.grandTotal > 0 ? (
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                12-month total
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(data.grandTotal)}
              </p>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {data.rows.length === 0 || monthColumns.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {/* Header row: empty corner cell + month labels */}
                <div
                  className="grid items-center gap-1 text-[11px] font-medium text-muted-foreground"
                  style={{ gridTemplateColumns: `minmax(180px,1.4fr) repeat(${monthColumns.length}, minmax(48px,1fr))` }}
                >
                  <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Product
                  </div>
                  {monthColumns.map((m) => (
                    <div key={m.month} className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider">
                      {m.label}
                    </div>
                  ))}
                </div>

                {/* Body rows */}
                <div className="mt-1 space-y-1">
                  {data.rows.map((row, index) => (
                    <SeasonalityRow
                      key={`${row.name}-${row.code ?? ''}-${index}`}
                      name={row.name}
                      code={row.code}
                      total={row.total}
                      cells={row.cells}
                      maxRevenue={data.maxRevenue}
                    />
                  ))}
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>Less</span>
                  <span className="h-2 w-32 overflow-hidden rounded-full bg-gradient-to-r from-muted to-primary" />
                  <span>More</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SeasonalityRow({
  name,
  code,
  total,
  cells,
  maxRevenue,
}: {
  name: string
  code: string | null
  total: number
  cells: { month: string; monthLabel: string; revenue: number; lineCount: number }[]
  maxRevenue: number
}) {
  return (
    <div
      className="grid items-center gap-1"
      style={{ gridTemplateColumns: `minmax(180px,1.4fr) repeat(${cells.length}, minmax(48px,1fr))` }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-2 py-1.5">
        <p className="truncate text-sm font-medium text-foreground" title={name}>
          {name}
        </p>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatCurrency(total)}
        </span>
      </div>
      {cells.map((cell) => {
        const intensity = maxRevenue > 0 ? Math.min(1, cell.revenue / maxRevenue) : 0
        // Use a tinted background — lower opacity at low intensity, full
        // primary tint at high intensity. `bg-primary/20` for the muted
        // base so even zero-revenue cells have a faint outline.
        const bg = cell.revenue === 0
          ? 'bg-muted/40 text-muted-foreground'
          : intensity > 0.66
            ? 'bg-primary text-primary-foreground'
            : intensity > 0.33
              ? 'bg-primary/70 text-primary-foreground'
              : 'bg-primary/30 text-foreground'
        return (
          <div
            key={`${name}-${cell.month}`}
            className={cn(
              'group relative h-9 rounded-md border border-border/60 px-1 py-1 text-center text-[11px] font-semibold tabular-nums transition-transform',
              bg
            )}
            title={`${name} · ${cell.monthLabel}: ${formatCurrency(cell.revenue)} (${cell.lineCount} order${cell.lineCount === 1 ? '' : 's'})`}
          >
            {cell.revenue > 0 ? formatCellValue(cell.revenue) : ''}
          </div>
        )
      })}
    </div>
  )
}

function formatCellValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return `£${Math.round(value)}`
}

function EmptyState() {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">No seasonality data yet.</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Once your top 10 products have sales across multiple months, you'll see the heatmap here.
      </p>
    </div>
  )
}