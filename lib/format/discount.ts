// lib/format/discount.ts
//
// Manual invoice discount input — pure parser/format helpers, no React.
//
// The form exposes a single input per discount. The character decides:
//   * "£5" or "5"    → amount in pounds (£/unit for per-line, flat £ for order-level)
//   * "10%" or "10 %" → percent
//   * "  " (blank)   → no discount (cleared)
//
// Anything else is reported as `{kind: 'invalid', error}` so the input can
// show an inline error message instead of silently dropping characters.
//
// All numeric values are stored as positive figures — the caller is responsible
// for rendering the leading minus sign. This matches DB semantics
// (CHECK discount_amount >= 0) and makes arithmetic straightforward.

export type ParsedDiscount =
  | { kind: 'empty' }
  | { kind: 'amount'; valuePence: number }
  | { kind: 'percent'; value: number }
  | { kind: 'invalid'; error: string }

export interface ParseDiscountOptions {
  /**
   * Maximum allowed £ discount in pence.
   * - Per-line: unit price (discount is per unit)
   * - Order-level: post-line-discount subtotal
   * When exceeded, returns `{ kind: 'invalid', error }`.
   */
  maxAmountPence?: number | null
}

const AMOUNT_RE = /^£?\s*(\d+(?:\.\d{0,2})?)\s*£?\s*$/
const PERCENT_RE = /^(\d+(?:\.\d{0,2})?)\s*%\s*$/

/**
 * Parse the raw text in a discount input.
 *
 * Returns one of:
 *   - `{kind: 'empty'}` — blank input, treat as "no discount".
 *   - `{kind: 'amount', valuePence}` — pounds, converted to integer pence.
 *   - `{kind: 'percent', value}` — percentage as a number (10 == 10%).
 *   - `{kind: 'invalid', error}` — unparseable or over the product cost.
 */
export function parseDiscountInput(
  raw: string,
  options?: ParseDiscountOptions,
): ParsedDiscount {
  return parseInternal(raw, options)
}

/**
 * Variant for order-level discounts. Same parser; callers pass
 * `maxAmountPence` = subtotal when they want the cost cap.
 */
export function parseOrderDiscountInput(
  raw: string,
  options?: ParseDiscountOptions,
): ParsedDiscount {
  return parseInternal(raw, options)
}

function parseInternal(raw: string, options?: ParseDiscountOptions): ParsedDiscount {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'empty' }

  // Treat a bare currency symbol / percent sign / whitespace mix as "the
  // user is mid-edit" → empty. Otherwise an operator who types "£" and
  // pauses sees a hard error before they've even entered an amount.
  if (/^[£%\s]*$/.test(trimmed)) return { kind: 'empty' }

  // Try the percent shape first — it's the more specific pattern (the `%`
  // is unambiguous). Falling back to the amount shape means "10%" matches
  // amount as the string "10", which would be wrong.
  const percentMatch = PERCENT_RE.exec(trimmed)
  if (percentMatch) {
    const n = Number(percentMatch[1])
    if (!Number.isFinite(n) || n <= 0) {
      return { kind: 'invalid', error: 'Discount must be greater than 0%' }
    }
    if (n > 100) {
      return { kind: 'invalid', error: 'Discount cannot exceed 100%' }
    }
    return { kind: 'percent', value: n }
  }

  const amountMatch = AMOUNT_RE.exec(trimmed)
  if (amountMatch) {
    const pounds = Number(amountMatch[1])
    if (!Number.isFinite(pounds) || pounds < 0) {
      return { kind: 'invalid', error: 'Discount must be a positive amount' }
    }
    const pence = Math.round(pounds * 100)

    // Cap £ discounts to the product / order cost so the operator cannot
    // apply more off than the line or document is worth.
    const max = options?.maxAmountPence
    if (max != null && Number.isFinite(max) && max >= 0 && pence > max) {
      const maxPounds = (max / 100).toFixed(2)
      return {
        kind: 'invalid',
        error: `Discount cannot be greater than the cost (£${maxPounds})`,
      }
    }

    return { kind: 'amount', valuePence: pence }
  }

  // Catch the most common slip: user typed "10.555" or "£0.001" —
  // input had more than 2 decimal places, which we silently truncate via
  // regex. If they typed something completely different (letters, mixed
  // %+£, trailing comma) we surface a generic error.
  if (/[a-z]/i.test(trimmed)) {
    return { kind: 'invalid', error: 'Use a number, e.g. 5 or 10%' }
  }
  return { kind: 'invalid', error: 'Use a number, e.g. 5 or 10%' }
}

/**
 * Strip disallowed characters from a discount input string. Keeps digits,
 *  whitespace, period, `£`, and `%`. Anything else (letters, comma,
 *  semicolon, currency symbols other than `£`) is removed. The component
 *  applies this on every keystroke so pasted values land as clean input.
 */
export function sanitizeDiscountString(raw: string): string {
  // Allow only the charset the parser accepts. Be permissive on whitespace
  // (the parser trims it anyway) so the user can leave a space and have it
  // render as empty.
  return raw.replace(/[^0-9.\s£%]/g, '')
}

/**
 * Format a parsed discount for inline display next to the input.
 *  - amount → "−£50.00" or "−£0.50"
 *  - percent → "−10%"
 *  - empty / invalid → returns the raw trimmed input (or an empty string
 *    for empty) so the caller can keep the box populated while the user
 *    is mid-edit.
 */
export function formatDiscountLabel(parsed: ParsedDiscount, rawInput: string): string {
  if (parsed.kind === 'amount') {
    return `−£${(parsed.valuePence / 100).toFixed(2)}`
  }
  if (parsed.kind === 'percent') {
    const v = parsed.value
    const pretty = Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/\.?0+$/, '')
    return `−${pretty}%`
  }
  return rawInput.trim()
}

/**
 * Build the multi-line preview shown below the per-line input:
 *   "−£0.50 × 10 = −£5.00"
 *   "−10%  −£5.00"
 * Returns null when no preview should render (empty/invalid input,
 * or the discount is zero).
 */
export function buildLinePreview(
  parsed: ParsedDiscount,
  quantity: number,
  lineNetPence: number,
): string | null {
  if (parsed.kind === 'empty' || parsed.kind === 'invalid') return null
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (!Number.isFinite(lineNetPence) || lineNetPence <= 0) return null

  if (parsed.kind === 'amount') {
    const totalPence = Math.min(parsed.valuePence * quantity, lineNetPence)
    const perUnit = (parsed.valuePence / 100).toFixed(2)
    const total = (totalPence / 100).toFixed(2)
    return `−£${perUnit}/unit × ${quantity} = −£${total}`
  }

  // percent
  const v = parsed.value
  const discPence = Math.round((lineNetPence * v) / 100)
  const pretty = Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/\.?0+$/, '')
  return `−${pretty}% (−£${(discPence / 100).toFixed(2)})`
}

/**
 * Convenience for the form: convert a parsed discount to the two nullable
 *  columns the DB stores. Used when building the payload for
 *  createInvoice / updateInvoice.
 *   - amount  → { discount_amount, discount_percent: null }
 *   - percent → { discount_amount: null, discount_percent }
 *   - empty   → { discount_amount: null, discount_percent: null }
 *   - invalid → as `empty`, the server will recompute and ignore anyway
 */
export function toRowColumns(parsed: ParsedDiscount): {
  discountAmount: number | null
  discountPercent: number | null
} {
  if (parsed.kind === 'amount') {
    // Discounts are stored as POUNDS in the DB (numeric(12,2)). Convert
    // from pence back to pounds so the value stored is what the operator
    // typed — easier to read in admin / debugging tools.
    return { discountAmount: parsed.valuePence / 100, discountPercent: null }
  }
  if (parsed.kind === 'percent') {
    return { discountAmount: null, discountPercent: parsed.value }
  }
  return { discountAmount: null, discountPercent: null }
}

/**
 * Inverse of `toRowColumns`: read the DB columns for an existing invoice
 * or line item and produce a `ParsedDiscount` the form can re-render. When
 * both columns are NULL (the no-discount case) returns `{kind:'empty'}`.
 */
export function fromRowColumns(
  discountAmount: number | null | undefined,
  discountPercent: number | null | undefined,
): ParsedDiscount {
  if (discountAmount != null && discountAmount > 0) {
    return { kind: 'amount', valuePence: Math.round(discountAmount * 100) }
  }
  if (discountPercent != null && discountPercent > 0) {
    return { kind: 'percent', value: discountPercent }
  }
  return { kind: 'empty' }
}
