// lib/public-products/price.ts
// Single source of truth for "what price should we show?" on the public
// catalogue. Wraps the existing sale-window helper so the rest of the UI
// never has to reason about sale dates, "from" semantics, or quote-only
// fallback modes.

import { getSaleInfo, getCampaignSaleInfo, type SaleInfo } from '@/lib/products/sale'
import type { PublicProduct } from '@/lib/public-products'

export type PriceDisplay =
  | {
      kind: 'sale'
      effectivePrice: number
      originalPrice: number
      discountPercent: number
      label: string | null
      endsAt: string | null
      state: 'live' | 'clearance'
      sale: SaleInfo
    }
  | {
      kind: 'scheduled'
      effectivePrice: number
      upcomingPrice: number
      startsAt: string
      label: string | null
      sale: SaleInfo
    }
  | {
      kind: 'fixed'
      effectivePrice: number
    }
  | {
      kind: 'from'
      effectivePrice: number
    }
  | { kind: 'quote' }

/**
 * Compute the price block to render for a product. Encapsulates:
 *   1. Is a sale active right now?
 *   2. Otherwise, is one scheduled?
 *   3. Otherwise, do we have a single price, a "from" price, or nothing?
 *
 * The returned `kind` is the single source of truth for the UI — components
 * switch on `kind` to pick their rendering branch. The component never has
 * to touch sale dates, percentage math or fallback modes directly.
 */
export function getEffectivePrice(product: PublicProduct, now: Date = new Date()): PriceDisplay {
  // Discounts are only eligible for products whose display mode is "Show price".
  const eligibleForDiscount = product.displayMode === 'show'

  // Campaign discount takes precedence over individual product sales.
  if (eligibleForDiscount && product.campaignDiscountPercent != null && product.campaignDiscountPercent > 0) {
    const campaignSale = getCampaignSaleInfo(
      {
        discountPercent: product.campaignDiscountPercent,
        startsAt: null,
        endsAt: null,
        isPaused: false,
        label: product.campaignLabel,
      },
      product.price,
      now
    )

    if (campaignSale.active) {
      return {
        kind: 'sale',
        effectivePrice: campaignSale.effectivePrice,
        originalPrice: product.price,
        discountPercent: campaignSale.discountPercent,
        label: campaignSale.label,
        endsAt: null,
        state: 'live',
        sale: campaignSale,
      }
    }
  }

  if (eligibleForDiscount) {
    const sale = getSaleInfo(
      {
        sale_price: product.salePrice,
        sale_starts_at: product.saleStartsAt,
        sale_ends_at: product.saleEndsAt,
        sale_label: product.saleLabel,
        default_price: product.price,
      },
      now
    )

    if (sale.active && sale.state !== 'expired') {
      return {
        kind: 'sale',
        effectivePrice: sale.effectivePrice,
        originalPrice: product.price,
        discountPercent: sale.discountPercent,
        label: sale.label,
        endsAt: sale.endsAt,
        state: sale.state === 'clearance' ? 'clearance' : 'live',
        sale,
      }
    }

    if (sale.state === 'scheduled' && sale.startsAt) {
      return {
        kind: 'scheduled',
        effectivePrice: product.price,
        upcomingPrice: sale.effectivePrice,
        startsAt: sale.startsAt,
        label: sale.label,
        sale,
      }
    }
  }

  if (product.price > 0 && (!product.priceFrom || product.priceFrom >= product.price)) {
    return { kind: 'fixed', effectivePrice: product.price }
  }

  if ((product.priceFrom ?? 0) > 0) {
    return { kind: 'from', effectivePrice: product.priceFrom as number }
  }

  return { kind: 'quote' }
}

/**
 * Convenience formatter used by `AddToCartButton` so the cart line carries
 * the same number the customer saw on the page. Falls back to `priceFrom`
 * when there's no sale so we don't regress pre-existing cart behaviour.
 */
export function getEffectivePriceNumber(product: PublicProduct): number | null {
  const display = getEffectivePrice(product)
  if (display.kind === 'quote') {
    // For quote-only products, fall back to the trade price if set so the
    // cart line still carries a number for downstream invoice math.
    return product.price > 0 ? product.price : null
  }
  return display.effectivePrice
}