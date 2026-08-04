// lib/vat.ts
// Centralised VAT arithmetic so the dashboard, PDF preview, and server-side
// invoice/quote actions all agree on the same totals.
//
// All public helpers round to the nearest penny (half-up) so we never pass
// floating-point dust into the database or the UI. VAT rates are expressed
// as percentages (e.g. 20 for 20%) to match the database columns.

export const VAT_RATE_PERCENTAGE = 20
export const VAT_RATE_DECIMAL = VAT_RATE_PERCENTAGE / 100

export interface VatTotals {
  subtotal: number
  vatTotal: number
  total: number
}

export interface LineVatTotals extends VatTotals {
  vatAmount: number
}

function roundPence(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Calculate VAT and total for a single net amount (in pounds).
 * `vatRate` is a percentage (e.g. 20).
 */
export function calculateVatFromNet(net: number, vatRate = VAT_RATE_PERCENTAGE): LineVatTotals {
  const vatAmount = roundPence(net * (vatRate / 100))
  return {
    subtotal: roundPence(net),
    vatTotal: vatAmount,
    total: roundPence(net + vatAmount),
    vatAmount,
  }
}

export interface VatLineItem {
  quantity: number
  price: number // in pounds
  vat_rate: number // percentage, e.g. 20
}

export interface CalculatedVatLineItem extends VatLineItem {
  vat_amount: number
  line_total: number
}

/**
 * Calculate line-item and document totals from a list of items (in pounds).
 * Each line's net is `quantity * price`; VAT is `net * (vat_rate / 100)`.
 */
export function calculateDocumentTotals(
  items: VatLineItem[],
  options: { applyVat?: boolean } = {}
): { items: CalculatedVatLineItem[] } & VatTotals {
  const applyVat = options.applyVat !== false
  let subtotal = 0
  let vatTotal = 0

  const calculatedItems = items.map((item) => {
    const lineNet = roundPence(item.quantity * item.price)
    const lineVat = applyVat ? roundPence(lineNet * (item.vat_rate / 100)) : 0
    const lineTotal = roundPence(lineNet + lineVat)

    subtotal += lineNet
    vatTotal += lineVat

    return {
      ...item,
      vat_amount: lineVat,
      line_total: lineTotal,
    }
  })

  return {
    items: calculatedItems,
    subtotal: roundPence(subtotal),
    vatTotal: roundPence(vatTotal),
    total: roundPence(subtotal + vatTotal),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pence-based variants (used by server actions and the invoice form that store
// money as integer pence internally to avoid floating-point errors).
// ─────────────────────────────────────────────────────────────────────────────

export interface VatLineItemPence {
  quantity: number
  pricePence: number
  vat_rate: number // percentage, e.g. 20
  /**
   * Per-line fixed discount, in PENCE, PER UNIT. The caller is responsible
   * for parsing "£5" into a number of pence. Stored as the per-unit value
   * so a `£0.50` discount on a `10 × £5.00` line reads as "fifty pence
   * off each unit" (= £5 off the line). Multiply by quantity before
   * subtracting from the line net.
   */
  discountAmountPence?: number | null
  /**
   * Per-line percentage discount. Applied to the line net (qty × price)
   * before VAT, and clamped to (0, 100]. `null` means "no percent discount".
   * Percentage is stored as a percent, not a fraction (10 == 10%).
   */
  discountPercent?: number | null
}

/**
 * Order-level discount applied to the sum of post-discount line nets.
 *
 * - `amountPence`: a flat £ figure in pence, subtracted from the
 *   subtotal_pre_discount once (NOT multiplied by anything).
 * - `percent`: applied to subtotal_pre_discount as a percentage (10 == 10%).
 *
 * Either one, never both. The form's parser enforces this; the DB CHECK
 * constraints backstop it.
 */
export interface OrderDiscountPence {
  amountPence?: number | null
  percent?: number | null
}

export interface CalculatedVatLineItemPence extends VatLineItemPence {
  vat_amount_pence: number
  line_total_pence: number
  /** Per-line net AFTER the per-line discount, BEFORE VAT. In pence. */
  line_net_post_discount_pence: number
  /** Per-line discount applied, in pence. Computed from amount × qty or percent × net. */
  line_discount_pence: number
}

export interface DocumentTotalsPence {
  items: CalculatedVatLineItemPence[]
  /**
   * Sum of every line's post-discount net, in POUNDS. This is the figure
   * the form shows as "Subtotal" *before* the order-level discount is
   * taken off. Renamed from `subtotal` in the legacy return shape so
   * callers don't accidentally treat a discounted subtotal as a net.
   *
   * Kept as `subtotal` in the return object for backward compatibility
   * with existing callers (the form's calculateLineTotals + live totals).
   * The new `subtotal_pre_discount` field is included for explicit use.
   */
  subtotal_pre_discount: number
  /**
   * Order-level discount applied, in POUNDS. Always a non-negative figure
   * — the caller is expected to render it with a leading minus sign.
   * Zero when no order-level discount is set.
   */
  discount: number
  /** Subtotal AFTER the order-level discount, in POUNDS. */
  subtotal: number
  vatTotal: number
  total: number
}

export function penceToPounds(value: number): number {
  return value / 100
}

export function poundsToPence(value: number): number {
  return Math.round(value * 100)
}

/**
 * Compute the per-line discount in pence from the (possibly null) amount or
 * percent. Inputs are pre-validated — the parser and DB constraints guard
 * ranges, so we just sanity-clamp to never overshoot.
 */
function computeLineDiscountPence(
  quantity: number,
  pricePence: number,
  amountPence: number | null | undefined,
  percent: number | null | undefined,
): number {
  const lineNetPence = Math.round(quantity * pricePence)

  let discount = 0
  if (percent != null && percent > 0) {
    // Round half-up to the nearest penny so the operator sees a recognisable
    // number. The DB CHECK caps percent at 100; we clamp here too as a
    // belt-and-braces for direct API misuse.
    const pct = Math.max(0, Math.min(100, percent))
    discount = Math.round((lineNetPence * pct) / 100)
  } else if (amountPence != null && amountPence > 0) {
    // Per-unit: multiply by quantity. Never below 0.
    discount = Math.max(0, Math.round(amountPence * quantity))
  }

  // Never overshoot — discount can't reduce the line below £0.
  return Math.min(discount, lineNetPence)
}

/**
 * Calculate line-item and document totals from a list of items priced in pence.
 * `vat_rate` is a percentage (e.g. 20).
 *
 * The two stages:
 *   1. Per-line: discount applied first (per-unit for £, percent of net for %),
 *      then VAT on the discounted net.
 *   2. Order-level: discount applied to the SUM of all line nets (already
 *      discounted per-line), then VAT on the discounted order subtotal.
 *      VAT always tracks the net, so an order-level discount drops VAT too.
 */
/**
 * Clamp a VAT percentage to a sane 0–100 range. Non-finite values fall back
 * to the UK default so a bad settings row never NaNs money math.
 */
export function normalizeVatRatePercent(
  rate: number | null | undefined,
  fallback = VAT_RATE_PERCENTAGE
): number {
  if (rate == null || !Number.isFinite(rate)) return fallback
  return Math.max(0, Math.min(100, rate))
}

export function calculateDocumentTotalsPence(
  items: VatLineItemPence[],
  options: {
    /**
     * When false, document and line VAT are forced to zero. Callers MUST
     * pass this explicitly when the operator toggles VAT off — relying on
     * line `vat_rate = 0` alone is not enough, because order-level VAT is
     * recomputed from the document rate (not summed from lines).
     */
    applyVat?: boolean
    /**
     * Document-level VAT percentage used after order discounts (e.g. 20).
     * Defaults to VAT_RATE_PERCENTAGE. Loaded from company_settings.default_vat_rate.
     */
    documentVatRate?: number
    orderDiscount?: OrderDiscountPence | null
  } = {}
): DocumentTotalsPence {
  const applyVat = options.applyVat !== false
  const documentVatRate = normalizeVatRatePercent(options.documentVatRate)
  const orderDiscount = options.orderDiscount ?? null

  let subtotalPrePence = 0
  let vatTotalPence = 0

  const calculatedItems: CalculatedVatLineItemPence[] = items.map((item) => {
    const lineNetPence = Math.round(item.quantity * item.pricePence)
    const lineDiscPence = computeLineDiscountPence(
      item.quantity,
      item.pricePence,
      item.discountAmountPence,
      item.discountPercent,
    )
    const lineNetPostPence = Math.max(0, lineNetPence - lineDiscPence)
    const lineRate = applyVat ? normalizeVatRatePercent(item.vat_rate, documentVatRate) : 0
    const lineVatPence = applyVat ? Math.round((lineNetPostPence * lineRate) / 100) : 0
    const lineTotalPence = lineNetPostPence + lineVatPence

    subtotalPrePence += lineNetPostPence
    vatTotalPence += lineVatPence

    return {
      ...item,
      vat_rate: lineRate,
      vat_amount_pence: lineVatPence,
      line_total_pence: lineTotalPence,
      line_net_post_discount_pence: lineNetPostPence,
      line_discount_pence: lineDiscPence,
    }
  })

  // Order-level discount applied to the post-line-discount subtotal.
  let orderDiscPence = 0
  if (orderDiscount) {
    if (orderDiscount.percent != null && orderDiscount.percent > 0) {
      const pct = Math.max(0, Math.min(100, orderDiscount.percent))
      orderDiscPence = Math.round((subtotalPrePence * pct) / 100)
    } else if (orderDiscount.amountPence != null && orderDiscount.amountPence > 0) {
      orderDiscPence = Math.max(0, Math.round(orderDiscount.amountPence))
    }
  }
  // Clamp so the order subtotal never goes negative. VAT also tracks the
  // net, so this clamp is what keeps `total >= 0` even with absurd inputs.
  orderDiscPence = Math.min(orderDiscPence, subtotalPrePence)

  const subtotalPostPence = Math.max(0, subtotalPrePence - orderDiscPence)
  // Document VAT always tracks the discounted net at the company default
  // rate (or zero when VAT is off). Never re-introduce VAT when applyVat
  // is false, even if a caller left line rates non-zero by mistake.
  const orderVatPence = applyVat
    ? Math.round((subtotalPostPence * documentVatRate) / 100)
    : 0

  // VAT total is computed from the discounted subtotal, not summed from
  // the per-line figures — the per-line VAT figure is what the operator
  // sees per row, but the document VAT always tracks the discounted net
  // (per the INVOICE_DISCOUNTS_PLAN rule "VAT tracks the net").
  vatTotalPence = orderVatPence
  const totalPence = subtotalPostPence + vatTotalPence

  return {
    items: calculatedItems,
    subtotal_pre_discount: penceToPounds(subtotalPrePence),
    discount: penceToPounds(orderDiscPence),
    subtotal: penceToPounds(subtotalPostPence),
    vatTotal: penceToPounds(vatTotalPence),
    total: penceToPounds(totalPence),
  }
}
