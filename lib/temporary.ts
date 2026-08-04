// =============================================================================
// Helpers for the "temporary" client / product system.
//
// A temporary row is one created quickly from inside an invoice/quote (via the
// inline "+ New" affordance) that captures only the minimum needed to issue
// the document. These helpers compute the list of fields that are still
// missing so the dashboard can surface a chip per gap, and they expose the
// human-friendly labels used in the UI.
//
// Promotion logic lives next to the action layer (applyClientAutoPromote /
// applyProductAutoPromote). This file is purely *display* helpers.
// =============================================================================

export interface MissingFieldChip {
  /** Stable key used by React when rendering the list. */
  key: string
  /** Short label, e.g. "email", "real code". */
  label: string
  /** Optional context shown on hover (e.g. "real code still missing — placeholder is TEMP-XXXXXX"). */
  hint?: string
  /** True when this gap would block auto-promotion. */
  blocksPromotion: boolean
}

interface TempClientLike {
  email: string | null
  phone: string | null
  company_name: string | null
  address_line_1: string | null
  postcode: string | null
}

const has = (value: string | null | undefined) => !!(value && value.trim())

/**
 * Returns the list of fields still missing on a temporary client. Order is
 * preserved so chips render in the same order every time.
 */
export function temporaryClientMissingFields(c: TempClientLike): MissingFieldChip[] {
  const chips: MissingFieldChip[] = []
  const hasEmail = has(c.email)
  const hasPhone = has(c.phone)
  // Promotion only requires ONE contact channel (email OR phone — see
  // isClientCompleteEnough in lib/actions/clients.ts), so the blocking
  // chip only appears when both are missing. A single missing channel
  // is advisory only.
  if (!hasEmail && !hasPhone) {
    chips.push({ key: 'contact', label: 'email or phone', blocksPromotion: true })
  } else {
    if (!hasEmail) {
      chips.push({ key: 'email', label: 'email', blocksPromotion: false })
    }
    if (!hasPhone) {
      chips.push({ key: 'phone', label: 'phone', blocksPromotion: false })
    }
  }
  if (!has(c.company_name)) {
    chips.push({ key: 'company', label: 'company', blocksPromotion: false })
  }
  if (!has(c.address_line_1) || !has(c.postcode)) {
    chips.push({ key: 'address', label: 'address', blocksPromotion: false })
  }
  return chips
}

interface TempProductLike {
  code: string | null
  description: string | null
  unit: string | null
  category: string | null
  image_url: string | null
  default_price: number | string | null
  temp_placeholder_code: boolean
}

const price = (v: number | string | null | undefined) => {
  if (v == null) return 0
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

/**
 * Returns the list of fields still missing on a temporary product. Order is
 * preserved. Two chips ("real code" and "price") block auto-promotion; the
 * others are advisory.
 */
export function temporaryProductMissingFields(p: TempProductLike): MissingFieldChip[] {
  const chips: MissingFieldChip[] = []
  const codeHasPrefix = (p.code || '').trim().toUpperCase().startsWith('TEMP-')

  if (p.temp_placeholder_code || codeHasPrefix) {
    chips.push({
      key: 'real_code',
      label: 'real code',
      hint: `Placeholder is ${p.code ?? '—'}. Replace with a real SKU on save.`,
      blocksPromotion: true,
    })
  }
  if (!has(p.description)) {
    chips.push({ key: 'description', label: 'description', blocksPromotion: true })
  }
  if (price(p.default_price) <= 0) {
    chips.push({ key: 'price', label: 'price', blocksPromotion: true })
  }
  if (!has(p.category)) {
    chips.push({ key: 'category', label: 'category', blocksPromotion: false })
  }
  if (!has(p.image_url)) {
    chips.push({ key: 'image', label: 'image', blocksPromotion: false })
  }
  if (!has(p.unit)) {
    chips.push({ key: 'unit', label: 'unit', blocksPromotion: false })
  }
  return chips
}

/**
 * Format a created-at timestamptz as a friendly relative "X days ago" string.
 * Used by the dashboard chips to show how long a temp row has been pending.
 */
export function formatRelativeFromNow(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diffMs = Date.now() - then
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}
