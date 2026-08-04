'use client'

// components/dashboard/ProductMovement.tsx
//
// Two-column "winners / losers" panel. Compares the current 12-month
// period with the prior 12-month period and surfaces the products whose
// revenue moved the most — up or down — by absolute % change.
//
// Lives inside the "Product Dashboard" tab on the Products page. Helps the
// operator answer: "Which products are picking up? Which are slipping?"
//
// Design notes:
//   - Each row = product + sparkline-style change indicator + £ diff.
//   - Direction tone (green up / red down / muted flat) is driven by the
//     `direction` field produced by the analytics lib so we don't have
//     to re-derive it on the client.
//   - "New" products (current > 0, previous = 0) get a dedicated badge.
//   - "Gone" products (current = 0, previous > 0) get a muted styling.
//   - The panel renders both columns on md+ screens; on mobile they
//     stack so the scroll depth is similar to other dashboard panels.

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { TrendingDown, TrendingUp, Minus, Sparkles, ArrowRight } from 'lucide-react'
import type {
  ProductMovementReport,
  ProductMovementRow,
} from '@/lib/product-analytics'
import { formatDate } from '@/lib/utils'

interface ProductMovementProps {
  data: ProductMovementReport
}

export function ProductMovement({ data }: ProductMovementProps) {
  const rangeLabel = `${formatDate(data.range.start)} – ${formatDate(data.range.end)}`
  const previousLabel = `${formatDate(data.previousRange.start)} – ${formatDate(data.previousRange.end)}`

  const empty = data.winners.length === 0 && data.losers.length === 0

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <CardTitle className="text-base font-semibold text-foreground">
          Product movement
        </CardTitle>
        <CardDescription className="mt-1">
          Revenue this period ({rangeLabel}) compared to the same length before ({previousLabel}).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {empty ? (
          <EmptyState />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <MovementColumn
              title="Picking up"
              tone="success"
              icon={<TrendingUp className="h-4 w-4" />}
              rows={data.winners}
              emptyHint="No products gained revenue in this period."
            />
            <MovementColumn
              title="Slipping"
              tone="destructive"
              icon={<TrendingDown className="h-4 w-4" />}
              rows={data.losers}
              emptyHint="No products lost revenue in this period."
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MovementColumn({
  title,
  tone,
  icon,
  rows,
  emptyHint,
}: {
  title: string
  tone: 'success' | 'destructive'
  icon: React.ReactNode
  rows: ProductMovementRow[]
  emptyHint: string
}) {
  const toneClasses =
    tone === 'success'
      ? 'bg-success/10 text-success ring-success/20'
      : 'bg-destructive/10 text-destructive ring-destructive/20'

  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-lg ring-1',
              toneClasses
            )}
          >
            {icon}
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Top {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card/40 px-3 py-6 text-center text-xs text-muted-foreground">
          {emptyHint}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <MovementRow key={`${row.name}-${row.code ?? ''}-${index}`} row={row} tone={tone} />
          ))}
        </ul>
      )}
    </div>
  )
}

function MovementRow({
  row,
  tone,
}: {
  row: ProductMovementRow
  tone: 'success' | 'destructive'
}) {
  const isNew = row.direction === 'new'
  const isGone = row.direction === 'gone'
  const isFlat = row.direction === 'flat'

  const deltaText =
    isNew
      ? 'New product'
      : isGone
        ? 'No longer selling'
        : isFlat
          ? 'No change'
          : `${row.change >= 0 ? '+' : '−'}${formatCurrency(Math.abs(row.change))}`

  const pctText =
    isNew
      ? '—'
      : isGone
        ? '−100%'
        : row.percentage === null
          ? '—'
          : `${(row.percentage * 100).toFixed(Math.abs(row.percentage) >= 1 ? 0 : 1)}%`

  const DirectionIcon =
    isNew ? Sparkles : isGone ? ArrowRight : isFlat ? Minus : row.direction === 'up' ? TrendingUp : TrendingDown

  const badgeClasses =
    isNew
      ? 'bg-primary/10 text-primary ring-primary/20'
      : isGone || tone === 'destructive'
        ? 'bg-destructive/10 text-destructive ring-destructive/20'
        : isFlat
          ? 'bg-muted text-muted-foreground ring-border'
          : 'bg-success/10 text-success ring-success/20'

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:bg-secondary/40">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={row.name}>
          {row.name}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatCurrency(row.current)} now · {formatCurrency(row.previous)} before
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1',
            badgeClasses
          )}
          title={deltaText}
        >
          <DirectionIcon className="h-3 w-3" />
          {pctText}
        </span>
      </div>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-8 text-center">
      <p className="text-sm font-semibold text-foreground">Not enough history yet.</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        Once you have invoice line items covering two consecutive 12-month periods,
        we'll show which products are gaining and which are losing revenue.
      </p>
    </div>
  )
}