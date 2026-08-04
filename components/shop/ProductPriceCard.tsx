// components/shop/ProductPriceCard.tsx
// Shared public-facing price block. Renders one of six states:
//   1. Live sale — was/now with strikethrough, % off chip, campaign label,
//      and a pulsing "X days left" badge when the sale is time-bounded.
//   2. Open-ended clearance — same was/now, but a static "Clearance" badge.
//   3. Scheduled (upcoming) sale — current price + a "Starts DATE · £X" hint.
//   4. Single fixed price — clean £X per unit.
//   5. "From" price — lowest entry-point across sizes.
//   6. No price — "Trade price on application".
//
// Used on:
//   • The PDP purchase card (full PDP price block).
//   • The catalogue card (compressed price chip).
//   • Inline product detail in the quote builder.

import { cn } from '@/lib/utils'
import { getEffectivePrice, type PriceDisplay } from '@/lib/public-products/price'

export interface ProductPriceCardProps {
  product: {
    price: number
    priceFrom: number | null
    priceIncludesVat: boolean
    salePrice: number | null
    saleStartsAt: string | null
    saleEndsAt: string | null
    saleLabel: string | null
  }
  /** Smaller paddings + type scale for catalogue-card use. */
  compact?: boolean
  /** Show the "per <unit>" suffix. Defaults to true. */
  showPerUnit?: boolean
  /** Unit label (e.g. "each", "m²"). Defaults to "each". */
  unit?: string
  /** Override the "now" used for sale-window math (mostly for tests). */
  now?: Date
  className?: string
}

function formatDays(days: number | null | undefined): string | null {
  if (days == null) return null
  if (days <= 0) return 'Ends today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

function SaleBadge({
  display,
  compact,
}: {
  display: Extract<PriceDisplay, { kind: 'sale' }>
  compact: boolean
}) {
  const live = display.state === 'live'
  const clearance = display.state === 'clearance'

  const countdown = live ? formatDays(display.sale.daysRemaining) : null

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {live && (
          <span className="relative inline-flex items-center gap-1 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-white opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            −{display.discountPercent}%
          </span>
        )}
        {clearance && (
          <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
            Clearance
          </span>
        )}
        {display.label && (
          <span className="text-[9px] font-semibold text-amber-700">{display.label}</span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {live && countdown && (
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          {countdown}
        </span>
      )}
      {clearance && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
          Clearance
        </span>
      )}
      {display.label && (
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-amber-300">
          {display.label}
        </span>
      )}
    </div>
  )
}

export function ProductPriceCard({
  product,
  compact = false,
  showPerUnit = true,
  unit,
  now,
  className,
}: ProductPriceCardProps) {
  const display = getEffectivePrice(product as never, now)

  const perUnit = unit ?? (product as { unit?: string }).unit ?? 'each'
  const perUnitSuffix = showPerUnit ? `per ${perUnit.toLowerCase()}` : null

  const vatHint = product.priceIncludesVat ? ' inc. VAT' : null

  // ── Sale (live or clearance) ─────────────────────────────────────
  if (display.kind === 'sale') {
    if (compact) {
      return (
        <div className={cn('flex items-baseline justify-between gap-2', className)}>
          <span className="text-base font-extrabold text-primary tabular-nums">
            £{display.effectivePrice.toFixed(2)}
          </span>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-muted-foreground line-through tabular-nums">
              £{display.originalPrice.toFixed(2)}
            </span>
            {display.state === 'live' && display.sale.daysRemaining != null && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatDays(display.sale.daysRemaining)}
              </span>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className={cn('rounded-xl border-2 border-amber-300/60 bg-amber-50/40 p-4', className)}>
        <SaleBadge display={display} compact={false} />
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">Price</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold tracking-tight text-primary tabular-nums">
              £{display.effectivePrice.toFixed(2)}
            </span>
            {perUnitSuffix && <span className="text-sm text-muted-foreground">{perUnitSuffix}</span>}
            {vatHint && <span className="text-xs text-muted-foreground">{vatHint}</span>}
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums">
              Save {display.discountPercent}%
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            <span className="line-through">Was £{display.originalPrice.toFixed(2)}{perUnitSuffix ? ` ${perUnitSuffix}` : ''}</span>
            {display.endsAt && display.state === 'live' && (
              <>
                <span className="mx-2 text-neutral-300">·</span>
                Sale runs until {new Date(display.endsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </>
            )}
            {display.state === 'clearance' && (
              <>
                <span className="mx-2 text-neutral-300">·</span>
                Ends when stock runs out
              </>
            )}
          </p>
        </div>
      </div>
    )
  }

  // ── Scheduled sale ───────────────────────────────────────────────
  if (display.kind === 'scheduled') {
    if (compact) {
      return (
        <div className={cn('flex items-baseline justify-between gap-2', className)}>
          <span className="text-base font-extrabold tabular-nums">
            £{display.effectivePrice.toFixed(2)}
          </span>
        </div>
      )
    }
    return (
      <div className={cn('rounded-xl border border-blue-200 bg-blue-50/40 p-4', className)}>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">
          ⏱ Sale starts{' '}
          {new Date(display.startsAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          })}{' '}
          · £{display.upcomingPrice.toFixed(2)}
          {display.label ? ` · ${display.label}` : ''}
        </div>
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">Price</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums">
              £{display.effectivePrice.toFixed(2)}
            </span>
            {perUnitSuffix && <span className="text-sm text-muted-foreground">{perUnitSuffix}</span>}
            {vatHint && <span className="text-xs text-muted-foreground">{vatHint}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Add to quote to lock in current pricing before the sale begins.
          </p>
        </div>
      </div>
    )
  }

  // ── Fixed price ──────────────────────────────────────────────────
  if (display.kind === 'fixed') {
    if (compact) {
      return (
        <div className={cn('flex items-baseline justify-between gap-2', className)}>
          <span className="text-base font-extrabold tabular-nums">
            £{display.effectivePrice.toFixed(2)}
          </span>
          {showPerUnit && <span className="text-[10px] text-muted-foreground">{perUnitSuffix}</span>}
        </div>
      )
    }
    return (
      <div className={cn(className)}>
        <p className="text-sm text-muted-foreground">Price</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight tabular-nums">
            £{display.effectivePrice.toFixed(2)}
          </span>
          {perUnitSuffix && <span className="text-sm text-muted-foreground">{perUnitSuffix}</span>}
          {vatHint && <span className="text-xs text-muted-foreground">{vatHint}</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Trade and volume pricing available on request.
        </p>
      </div>
    )
  }

  // ── "From" price ─────────────────────────────────────────────────
  if (display.kind === 'from') {
    if (compact) {
      return (
        <div className={cn('flex items-baseline justify-between gap-2', className)}>
          <span className="text-base font-extrabold tabular-nums">
            from £{display.effectivePrice.toFixed(2)}
          </span>
          {showPerUnit && <span className="text-[10px] text-muted-foreground">{perUnitSuffix}</span>}
        </div>
      )
    }
    return (
      <div className={cn(className)}>
        <p className="text-sm text-muted-foreground">Price</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-semibold text-muted-foreground">From</span>
          <span className="text-3xl font-extrabold tracking-tight tabular-nums">
            £{display.effectivePrice.toFixed(2)}
          </span>
          {perUnitSuffix && <span className="text-sm text-muted-foreground">{perUnitSuffix}</span>}
          {vatHint && <span className="text-xs text-muted-foreground">{vatHint}</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Final price depends on size &amp; spec. Send your schedule for a fixed-price quote.
        </p>
      </div>
    )
  }

  // ── Quote-only ───────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={cn('text-[11px] text-muted-foreground', className)}>Price on application</div>
    )
  }
  return (
    <div className={cn('rounded-lg border border-dashed border-border bg-muted/30 p-4', className)}>
      <p className="text-sm text-muted-foreground">Price</p>
      <p className="text-lg font-semibold text-foreground">Trade price on application</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Submit your schedule and we&rsquo;ll reply same day with trade pricing.
      </p>
    </div>
  )
}