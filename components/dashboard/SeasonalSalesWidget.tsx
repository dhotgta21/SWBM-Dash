// components/dashboard/SeasonalSalesWidget.tsx
// "Seasonal sales" hero card used on the Analytics page and the
// Products → Data Dashboard tab.
//
// Pulls every product with a `sale_price` set and surfaces:
//
//   • Total discount value (sum of `default_price − sale_price`) so the
//     operator sees "how much revenue is on the line" at a glance.
//   • Active sale count + clearance / upcoming / expired counts.
//   • Up to four featured products with their badge, label, % off,
//     window (or "Clearance" / "Upcoming") and a direct edit link.

import Link from 'next/link'
import { Tag, ArrowUpRight, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { getSaleInfo, describeSaleWindow, formatSaleDate } from '@/lib/products/sale'
import type { ProductSaleFields } from '@/lib/products/sale'

export interface SeasonalSalesProduct extends ProductSaleFields {
  id: string
  code: string
  name: string
  is_active: boolean
}

interface SeasonalSalesWidgetProps {
  products: SeasonalSalesProduct[]
  /** Optional cap on the number of featured rows shown. Defaults to 4. */
  maxFeatured?: number
}

const STATE_BADGE_CLASSES = {
  live: 'bg-success-muted text-success ring-1 ring-success/20',
  clearance: 'bg-warning-muted text-warning ring-1 ring-warning/20',
  scheduled: 'bg-info-muted text-info ring-1 ring-info/20',
  expired: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground',
} as const

const STATE_LABEL = {
  live: 'Live now',
  clearance: 'Clearance',
  scheduled: 'Upcoming',
  expired: 'Ended',
  none: '—',
} as const

export function SeasonalSalesWidget({
  products,
  maxFeatured = 4,
}: SeasonalSalesWidgetProps) {
  // Compute the live state for each product once so the render is cheap.
  const enriched = products.map((p) => {
    const sale = getSaleInfo(p)
    return { product: p, sale }
  })

  // Clearance sales are `active` too (open-ended), so `live` must exclude
  // them explicitly — otherwise every clearance product appears in both
  // lists, renders twice with a duplicate key, and double-counts below.
  const live = enriched.filter(
    (e) => e.sale.active && e.sale.state !== 'clearance' && e.product.is_active
  )
  const clearance = enriched.filter(
    (e) => e.sale.state === 'clearance' && e.product.is_active
  )
  const scheduled = enriched.filter(
    (e) => e.sale.state === 'scheduled' && e.product.is_active
  )
  const expired = enriched.filter((e) => e.sale.state === 'expired').slice(0, 3)

  // Discount-at-risk = sum of (default − sale) for products currently
  // live. Negative value means we'd actually gain by running the
  // promotion — clamp at 0 for display so the metric always reads as
  // a revenue trade-off.
  const totalDiscountValue = [...live, ...clearance].reduce((sum, e) => {
    const delta = e.product.default_price - (e.sale.effectivePrice ?? e.product.default_price)
    return sum + Math.max(0, delta)
  }, 0)

  // Featured = live first, then clearance, then upcoming. Capped so the
  // card never feels cramped.
  const featured = [...live, ...clearance, ...scheduled].slice(0, maxFeatured)

  const empty = live.length === 0 && clearance.length === 0 && scheduled.length === 0

  return (
    <Card className="relative overflow-hidden border-border/70 bg-card p-0 shadow-none animate-dashboard-fade">
      {/* Decorative background — same treatment as TodaySnapshot so the
          dashboard cards share a coherent look. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dot-grid opacity-30 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-warning/8 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-info/8 blur-3xl"
      />

      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-12 lg:gap-8 lg:p-7">
        {/* Primary summary */}
        <div className="lg:col-span-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-60 animate-pulse-dot" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            Product discounts
          </div>
          <p className="mt-3 text-sm font-medium text-foreground/80">Live promotions</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground tabular-nums sm:text-[2.75rem] sm:leading-[1.05]">
            {live.length + clearance.length}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {live.length} live · {clearance.length} clearance · {scheduled.length} upcoming
          </p>

          {totalDiscountValue > 0 && (
            <div className="mt-5 rounded-xl border border-border/60 bg-card p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Discount at risk
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(totalDiscountValue)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Total margin traded against {live.length + clearance.length} live promotion
                {live.length + clearance.length === 1 ? '' : 's'}.
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/admin/campaigns?view=individual">
              <Button variant="outline" size="sm">
                <Tag className="h-4 w-4 mr-1.5" />
                Manage discounts
              </Button>
            </Link>
          </div>
        </div>

        {/* Featured rows */}
        <div className="lg:col-span-7">
          {empty ? (
            <EmptyState />
          ) : (
            <ul className="space-y-2">
              {featured.map(({ product, sale }) => (
                <FeaturedSaleRow key={product.id} product={product} sale={sale} />
              ))}
              {expired.length > 0 && (
                <li className="pt-2">
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                    Recently ended
                  </p>
                  <ul className="space-y-1.5">
                    {expired.map(({ product, sale }) => (
                      <FeaturedSaleRow key={product.id} product={product} sale={sale} muted />
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </Card>
  )
}

function FeaturedSaleRow({
  product,
  sale,
  muted = false,
}: {
  product: SeasonalSalesProduct
  sale: ReturnType<typeof getSaleInfo>
  muted?: boolean
}) {
  const state = sale.state
  const discount =
    sale.discountPercent > 0 ? `${sale.discountPercent}% off` : null
  const window = describeSaleWindow(sale)
  const startLabel = formatSaleDate(sale.startsAt)
  const endLabel = formatSaleDate(sale.endsAt)

  return (
    <li>
      <Link
        href="/admin/products"
        className={cn(
          'group block rounded-xl border border-border/60 bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
          muted && 'opacity-70'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  STATE_BADGE_CLASSES[state as keyof typeof STATE_BADGE_CLASSES]
                )}
              >
                {STATE_LABEL[state as keyof typeof STATE_LABEL]}
              </span>
              {discount ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-muted px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3" />
                  {discount}
                </span>
              ) : null}
              {sale.label ? (
                <span className="text-xs font-medium text-foreground">{sale.label}</span>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-sm font-semibold text-foreground">
              {product.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {product.code}
              {sale.startsAt || sale.endsAt ? ' · ' : ''}
              {sale.state === 'clearance'
                ? 'Clearance · open-ended'
                : sale.state === 'scheduled'
                  ? `Starts ${startLabel}`
                  : sale.state === 'live'
                    ? `${startLabel} → ${endLabel}`
                    : sale.state === 'expired'
                      ? `${startLabel} → ${endLabel}`
                      : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {sale.active ? (
              <>
                <p className="text-base font-semibold tabular-nums text-foreground">
                  {formatCurrency(sale.effectivePrice)}
                </p>
                <p className="text-[11px] text-muted-foreground line-through tabular-nums">
                  {formatCurrency(product.default_price)}
                </p>
              </>
            ) : (
              <p className="text-base font-semibold tabular-nums text-foreground">
                {formatCurrency(product.default_price)}
              </p>
            )}
            {window ? (
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {window}
              </p>
            ) : null}
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </Link>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning ring-1 ring-warning/15">
        <Tag className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">No seasonal sales right now.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Schedule a sale on any product to see it here. Staff and the public shop will pick up
        the new price automatically.
      </p>
      <Link href="/admin/products" className="mt-4">
        <Button variant="outline" size="sm">
          Open Products
        </Button>
      </Link>
    </div>
  )
}

// Avoid pulling the badge component into the dashboard widget when the
// call site doesn't use it — keeps the import list short and the
// component self-contained.
export { Badge as _SeasonalSalesBadge }