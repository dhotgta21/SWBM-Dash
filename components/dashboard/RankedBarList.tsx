'use client'

import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'
import { ArrowRight, type LucideIcon, Package, Users } from 'lucide-react'
import { EmptyState } from './EmptyState'

interface RankedBarListProps<T> {
  title: string
  description?: string
  data: T[]
  /** Total used to compute the share %. If omitted, share is computed from the sum of values. */
  total?: number
  /** Builds a display label for each row. */
  renderLabel: (item: T) => string
  /** Builds a secondary line for each row (e.g. "SKU-123" or "12 invoices"). */
  renderSubLabel?: (item: T) => string | null
  /** Returns the numeric value for this row. */
  getValue: (item: T) => number
  /** Builds the link URL for each row. If omitted, the row is non-clickable. */
  getHref?: (item: T) => string | null
  /** Icon shown next to the title. */
  icon: LucideIcon
  /** "View all" link in the header. */
  viewAllHref?: string
  viewAllLabel?: string
  /** Optional cap on rows shown. */
  limit?: number
  /** Empty state message. */
  emptyMessage?: string
  emptyHint?: string
}

const RANK_TONE: Array<{ bar: string; badge: string; text: string }> = [
  { bar: 'bg-primary', badge: 'bg-primary text-primary-foreground', text: 'text-primary' },
  { bar: 'bg-primary/85', badge: 'bg-primary/15 text-primary', text: 'text-primary' },
  { bar: 'bg-primary/70', badge: 'bg-primary/10 text-primary', text: 'text-primary' },
  { bar: 'bg-info', badge: 'bg-info/15 text-info', text: 'text-info' },
  { bar: 'bg-info/80', badge: 'bg-info/10 text-info', text: 'text-info' },
]

/**
 * List-style "leaderboard" visualisation.
 *
 * Renders each item as a row with: rank badge · label/sub-label · value ·
 * animated progress bar showing share of total. More information-dense and
 * scannable than a horizontal bar chart while keeping the same data.
 */
export function RankedBarList<T>({
  title,
  description,
  data,
  total,
  renderLabel,
  renderSubLabel,
  getValue,
  getHref,
  icon: Icon,
  viewAllHref,
  viewAllLabel = 'View all',
  limit = 5,
  emptyMessage = 'No data yet',
  emptyHint,
}: RankedBarListProps<T>) {
  const visible = data.slice(0, limit)
  const sumOfValues = visible.reduce((s, d) => s + getValue(d), 0)
  const denom = total && total > 0 ? total : sumOfValues

  return (
    <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
      <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
              <Icon className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
              {description ? (
                <CardDescription className="mt-1">{description}</CardDescription>
              ) : null}
            </div>
          </div>
          {viewAllHref ? (
            <Link
              href={viewAllHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {viewAllLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        {visible.length === 0 ? (
          <EmptyState message={emptyMessage} hint={emptyHint} />
        ) : (
          <ul className="space-y-3.5">
            {visible.map((item, index) => {
              const rawValue = getValue(item)
              const value = Number.isFinite(rawValue) ? rawValue : 0
              const share = denom > 0 && Number.isFinite(denom) ? value / denom : 0
              const tone = RANK_TONE[index] ?? RANK_TONE[RANK_TONE.length - 1]
              const href = getHref?.(item)
              const inner = (
                <RankedRow
                  rank={index + 1}
                  tone={tone}
                  label={renderLabel(item)}
                  subLabel={renderSubLabel?.(item) ?? null}
                  value={value}
                  share={share}
                />
              )
              return (
                <li key={String((item as { id?: string | number }).id ?? index)}>
                  {href ? (
                    <Link
                      href={href}
                      className="block rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RankedRow({
  rank,
  tone,
  label,
  subLabel,
  value,
  share,
}: {
  rank: number
  tone: { bar: string; badge: string; text: string }
  label: string
  subLabel: string | null
  value: number
  share: number
}) {
  const safeShare = Number.isFinite(share) ? share : 0
  const widthPct = safeShare > 0 ? Math.max(2, Math.min(100, safeShare * 100)) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold ${tone.badge}`}
          >
            {rank}
          </span>
          <p className="truncate text-sm font-medium text-foreground" title={label}>
            {label}
          </p>
          {subLabel ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">{subLabel}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(value)}
          </span>
          <span className={`text-xs font-medium tabular-nums ${tone.text}`}>
            {(safeShare * 100).toFixed(safeShare >= 0.1 ? 0 : 1)}%
          </span>
        </div>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(widthPct)}
        aria-label={`${label} share`}
      >
        <div
          className={`h-full rounded-full ${tone.bar} transition-all duration-700 ease-out`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  )
}

/** Helper hook to feed the ranked list with client / product data. */
export const CLIENT_ICON = Users
export const PRODUCT_ICON = Package