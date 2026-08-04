// lib/products/sale.ts
// Helpers for the product-seasonality feature.
//
// A product is "on sale" when:
//   • sale_price is set AND
//   • the current time is inside the [sale_starts_at, sale_ends_at]
//     window (when both are set) OR no end is set (clearance).
//   • sale_starts_at is in the past (if set) AND
//   • sale_ends_at is in the future (if set).
//
// A product with sale_price set but no dates is treated as an
// always-on sale (e.g. clearance line). A product with dates but no
// sale_price is ignored — the operator forgot to set a price.

export interface ProductSaleFields {
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
  default_price: number
}

export interface SaleInfo {
  /** True when the sale is live *right now* and should be applied. */
  active: boolean
  /** Resolved live price — sale_price when active, else default_price. */
  effectivePrice: number
  /** Discount percentage vs default_price. 0 when no sale is active. */
  discountPercent: number
  /** Optional campaign label (e.g. "Winter Sale"). */
  label: string | null
  /** Start of the sale, or null for "always on" / not scheduled. */
  startsAt: string | null
  /** End of the sale, or null for open-ended. */
  endsAt: string | null
  /** Days (rounded down) until the sale expires. null when no end or not active. */
  daysRemaining: number | null
  /**
   * "scheduled" — sale is in the future.
   * "live"     — sale is on right now.
   * "expired"  — sale window has ended.
   * "clearance" — sale_price set with no end date (open-ended).
   * "none"     — no sale configured.
   */
  state: 'scheduled' | 'live' | 'expired' | 'clearance' | 'none'
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getSaleInfo(
  product: ProductSaleFields,
  now: Date = new Date()
): SaleInfo {
  const defaultPrice = Number(product.default_price ?? 0) || 0
  const salePrice = product.sale_price == null ? null : Number(product.sale_price)
  const startsAt = toDate(product.sale_starts_at)
  const endsAt = toDate(product.sale_ends_at)
  const label = product.sale_label?.trim() || null

  // No sale configured.
  if (salePrice == null) {
    return {
      active: false,
      effectivePrice: defaultPrice,
      discountPercent: 0,
      label,
      startsAt: product.sale_starts_at ?? null,
      endsAt: product.sale_ends_at ?? null,
      daysRemaining: null,
      state: 'none',
    }
  }

  // Mis-configured: start after end → treat as no sale.
  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
    return {
      active: false,
      effectivePrice: defaultPrice,
      discountPercent: 0,
      label,
      startsAt: product.sale_starts_at ?? null,
      endsAt: product.sale_ends_at ?? null,
      daysRemaining: null,
      state: 'none',
    }
  }

  const started = startsAt ? now >= startsAt : true
  const notEnded = endsAt ? now < endsAt : true

  if (started && notEnded) {
    // Live sale (or open-ended clearance).
    const state: SaleInfo['state'] = endsAt ? 'live' : 'clearance'
    const daysRemaining = endsAt
      ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / MS_PER_DAY))
      : null
    const discountPercent =
      defaultPrice > 0
        ? Math.max(0, Math.round(((defaultPrice - salePrice) / defaultPrice) * 100))
        : 0
    return {
      active: true,
      // A mis-keyed sale price ABOVE the trade price must never charge
      // more than the default — clamp the effective price (the badge
      // percentage above already clamps to 0).
      effectivePrice: defaultPrice > 0 ? Math.min(salePrice, defaultPrice) : salePrice,
      discountPercent,
      label,
      startsAt: product.sale_starts_at ?? null,
      endsAt: product.sale_ends_at ?? null,
      daysRemaining,
      state,
    }
  }

  if (endsAt && now >= endsAt) {
    return {
      active: false,
      effectivePrice: defaultPrice,
      discountPercent: 0,
      label,
      startsAt: product.sale_starts_at ?? null,
      endsAt: product.sale_ends_at ?? null,
      daysRemaining: null,
      state: 'expired',
    }
  }

  if (startsAt && now < startsAt) {
    return {
      active: false,
      effectivePrice: defaultPrice,
      discountPercent: 0,
      label,
      startsAt: product.sale_starts_at ?? null,
      endsAt: product.sale_ends_at ?? null,
      daysRemaining: null,
      state: 'scheduled',
    }
  }

  return {
    active: false,
    effectivePrice: defaultPrice,
    discountPercent: 0,
    label,
    startsAt: product.sale_starts_at ?? null,
    endsAt: product.sale_ends_at ?? null,
    daysRemaining: null,
    state: 'none',
  }
}

/** Format a sale label + days-remaining for UI badges. */
export function describeSaleWindow(sale: SaleInfo): string | null {
  if (sale.state === 'clearance') return 'Clearance'
  if (sale.state === 'scheduled') return 'Upcoming sale'
  if (sale.state === 'live' && sale.daysRemaining != null) {
    if (sale.daysRemaining === 0) return 'Ends today'
    if (sale.daysRemaining === 1) return '1 day left'
    return `${sale.daysRemaining} days left`
  }
  if (sale.state === 'expired') return 'Sale ended'
  return null
}

/**
 * Format a date for the dashboard widget. Falls back to a short format
 * so the widget stays readable on mobile.
 */
export function formatSaleDate(value: string | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Campaign discount helpers
// ---------------------------------------------------------------------------

export interface CampaignSaleFields {
  discountPercent: number
  startsAt: string | null
  endsAt: string | null
  isPaused: boolean
  label?: string | null
}

export type CampaignStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'ended'

/**
 * Same window logic as getSaleInfo, but campaigns are always expressed as a
 * percentage discount. Returns a SaleInfo so existing badge/schedule helpers
 * can be reused with minimal changes.
 */
export function getCampaignSaleInfo(
  campaign: CampaignSaleFields,
  defaultPrice: number,
  now: Date = new Date()
): SaleInfo {
  const price = Number(defaultPrice ?? 0) || 0
  const discount = Number(campaign.discountPercent ?? 0) || 0
  const startsAt = toDate(campaign.startsAt)
  const endsAt = toDate(campaign.endsAt)
  const label = campaign.label?.trim() || null

  // Paused campaigns are never active, regardless of dates.
  if (campaign.isPaused || discount <= 0 || discount > 100) {
    return {
      active: false,
      effectivePrice: price,
      discountPercent: 0,
      label,
      startsAt: campaign.startsAt ?? null,
      endsAt: campaign.endsAt ?? null,
      daysRemaining: null,
      state: 'none',
    }
  }

  // Mis-configured: start after end → treat as no sale.
  if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
    return {
      active: false,
      effectivePrice: price,
      discountPercent: 0,
      label,
      startsAt: campaign.startsAt ?? null,
      endsAt: campaign.endsAt ?? null,
      daysRemaining: null,
      state: 'none',
    }
  }

  const started = startsAt ? now >= startsAt : true
  const notEnded = endsAt ? now < endsAt : true

  const salePrice = price > 0 ? Math.round(price * (1 - discount / 100) * 100) / 100 : 0
  const discountPercent = price > 0 ? Math.round(discount) : 0

  if (started && notEnded) {
    const state: SaleInfo['state'] = endsAt ? 'live' : 'clearance'
    const daysRemaining = endsAt
      ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / MS_PER_DAY))
      : null
    return {
      active: true,
      effectivePrice: salePrice,
      discountPercent,
      label,
      startsAt: campaign.startsAt ?? null,
      endsAt: campaign.endsAt ?? null,
      daysRemaining,
      state,
    }
  }

  if (endsAt && now >= endsAt) {
    return {
      active: false,
      effectivePrice: price,
      discountPercent: 0,
      label,
      startsAt: campaign.startsAt ?? null,
      endsAt: campaign.endsAt ?? null,
      daysRemaining: null,
      state: 'expired',
    }
  }

  if (startsAt && now < startsAt) {
    return {
      active: false,
      effectivePrice: price,
      discountPercent: 0,
      label,
      startsAt: campaign.startsAt ?? null,
      endsAt: campaign.endsAt ?? null,
      daysRemaining: null,
      state: 'scheduled',
    }
  }

  return {
    active: false,
    effectivePrice: price,
    discountPercent: 0,
    label,
    startsAt: campaign.startsAt ?? null,
    endsAt: campaign.endsAt ?? null,
    daysRemaining: null,
    state: 'none',
  }
}

/**
 * Derive a human-readable campaign status. Only 'live' means the campaign
 * discount is currently running and product-level seasonal sales should be
 * locked.
 */
export function getCampaignStatus(campaign: CampaignSaleFields, now: Date = new Date()): CampaignStatus {
  const startsAt = toDate(campaign.startsAt)
  const endsAt = toDate(campaign.endsAt)

  // A campaign past its end date is 'ended' even when paused — check the end
  // date before the paused short-circuit so the UI doesn't show a finished
  // campaign as merely paused.
  if (endsAt && now >= endsAt) return 'ended'
  if (campaign.isPaused) return 'paused'

  if (!startsAt && !endsAt) return 'draft'
  if (startsAt && now < startsAt) return 'scheduled'

  // Invalid discounts (0% / negative / over 100%) never apply a price change
  // (see getCampaignSaleInfo), so don't report them as live even inside the
  // window — treat them like a draft.
  const discount = Number(campaign.discountPercent ?? 0) || 0
  if (discount <= 0 || discount > 100) return 'draft'

  // startsAt in the past (or missing) and endsAt in the future (or missing).
  return 'live'
}

/**
 * Convenience check: is this campaign actively applying a discount right now?
 */
export function isCampaignRunning(campaign: CampaignSaleFields, now: Date = new Date()): boolean {
  return getCampaignStatus(campaign, now) === 'live'
}