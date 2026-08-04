'use client'

import {
  Trash2,
  Minus,
  Plus,
  Info,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import type { CartItem } from '@/lib/cart/cart-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CartLineItemProps {
  item: CartItem
  /** Discount applied at product level; cart preserves the was-price for the strikethrough. */
  onSale: boolean
  /** Per-line total = price × qty. null when the line is unpriced. */
  lineTotal: number | null
  /** Setter is shared with useCart().setQuantity. */
  onSetQuantity: (cartKey: string, quantity: number) => void
  onRemove: (cartKey: string) => void
}

/**
 * Format a GBP amount. Kept here (instead of imported) so the cart file
 * can stay focused on layout without pulling money utilities.
 */
function formatGBP(value: number): string {
  return `£${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Compact per-line breakdown used inside both the priced and awaiting-quote
 * sections. The mobile layout stacks everything; the sm+ layout uses a
 * tidy grid so the breakdown reads like an invoice.
 */
export function CartLineItem({
  item,
  onSale,
  lineTotal,
  onSetQuantity,
  onRemove,
}: CartLineItemProps) {
  const isPriced = item.price !== null
  const perUnitLabel = `per ${item.unit.toLowerCase()}`

  return (
    <li className="px-5 py-4">
      {/* Mobile: stacked layout. sm+: 5-column grid (code+name / qty / per-item / line-total / trash). */}
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center sm:gap-4">
        {/* Code + name + variant + sale label */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.code}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
          {item.variantDescription && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.variantDescription}
            </p>
          )}
          {/* Sale tag sits under the name on mobile so it doesn't crowd the per-item column. */}
          {isPriced && onSale && item.saleLabel && (
            <span className="mt-1.5 inline-flex rounded-full bg-success-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success sm:hidden">
              {item.saleLabel}
            </span>
          )}
        </div>

        {/* Quantity stepper */}
        <div className="inline-flex items-center rounded-md border border-border">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => onSetQuantity(item.cartKey, Math.max(0, item.quantity - 1))}
            className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={item.quantity}
            onChange={(e) => onSetQuantity(item.cartKey, Number(e.target.value))}
            aria-label={`Quantity for ${item.name}`}
            className="h-9 w-14 border-x border-border bg-background text-center text-sm font-semibold text-foreground focus:outline-none"
          />
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => onSetQuantity(item.cartKey, item.quantity + 1)}
            className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Per-item price */}
        <div className="text-right text-sm sm:min-w-[5.5rem]">
          {isPriced ? (
            <>
              <div className="font-semibold text-foreground tabular-nums">
                {formatGBP(item.price as number)}
              </div>
              <div className="text-[10px] font-normal text-muted-foreground">{perUnitLabel}</div>
              {onSale && item.originalPrice != null && (
                <div className="text-[10px] text-muted-foreground line-through tabular-nums">
                  was {formatGBP(item.originalPrice)}
                </div>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Info className="h-3 w-3" aria-hidden />
              To quote
            </span>
          )}
        </div>

        {/* Line total — only when priced + more than one of them. */}
        <div className="text-right text-sm sm:min-w-[6rem]">
          {lineTotal !== null ? (
            <div
              className={cn(
                'font-bold tabular-nums',
                onSale ? 'text-primary' : 'text-foreground'
              )}
            >
              {formatGBP(lineTotal)}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {isPriced && onSale && item.saleLabel && (
            <span className="mt-1 hidden rounded-full bg-success-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success sm:inline-flex">
              {item.saleLabel}
            </span>
          )}
        </div>

        {/* Remove */}
        <button
          type="button"
          aria-label={`Remove ${item.name}`}
          onClick={() => onRemove(item.cartKey)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  )
}

interface CartSectionProps {
  /** Section heading shown in the summary row. */
  title: string
  /** Optional right-aligned value (e.g. "£47.90") next to the title. */
  amount?: string | null
  /** Number of lines in this section, shown as a chip. */
  count: number
  /** Lucide icon used in the section header. */
  icon: LucideIcon
  /** Tones drive the border / icon / badge palette. */
  tone: 'success' | 'warning'
  /** When true the details body is open by default. Always true here. */
  open?: boolean
  /** Optional caption rendered under the title (e.g. "Awaiting pricing"). */
  caption?: string | null
  /** Footer content (e.g. subtotal row or "operator will phone" line). */
  footer?: React.ReactNode
  children: React.ReactNode
}

/**
 * Reusable accordion-style section used for both "Priced items" and
 * "Awaiting quote" cards. Uses native <details> for accessibility, free
 * keyboard support, and zero JS — and gives the user the freedom to
 * collapse either section once their cart gets long.
 */
export function CartSection({
  title,
  amount,
  count,
  icon: Icon,
  tone,
  open = true,
  caption,
  footer,
  children,
}: CartSectionProps) {
  const toneClasses =
    tone === 'success'
      ? 'border-success/30 bg-success-muted/30 text-success'
      : 'border-warning/40 bg-warning-muted/30 text-warning'

  const badgeClasses =
    tone === 'success'
      ? 'bg-success text-white'
      : 'bg-warning text-white'

  return (
    <details
      open={open}
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 border-l-4 px-5 py-4 transition-colors hover:bg-muted/40 [&::-webkit-details-marker]:hidden',
          toneClasses
        )}
      >
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
            tone === 'success' ? 'bg-success/15' : 'bg-warning/15'
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white',
                badgeClasses
              )}
            >
              {count} {count === 1 ? 'line' : 'lines'}
            </span>
            {amount && (
              <span className="text-base font-extrabold tabular-nums text-foreground">
                {amount}
              </span>
            )}
          </div>
          {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <ul className="divide-y divide-border border-t border-border">{children}</ul>

      {footer && <div className="border-t border-border bg-muted/20 px-5 py-3">{footer}</div>}
    </details>
  )
}