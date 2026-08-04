import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'GBP'
) {
  let value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0
  // Guard against NaN / Infinity from malformed data so the UI doesn't crash.
  if (!Number.isFinite(value)) value = 0
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(value)
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return '-'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function formatDateInput(date: Date = new Date()) {
  // Local date components — toISOString() would use UTC and could show
  // yesterday/tomorrow for users ahead of/behind UTC.
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Return a YYYY-MM-DD date string that is `days` after the supplied date.
// The input can be a Date or an ISO date string. Returns the original string
// if the input cannot be parsed.
export function addDays(date: Date | string, days: number): string {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime())
  if (Number.isNaN(d.getTime())) return typeof date === 'string' ? date : ''
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// Returns the current time in 24-hour HH:MM (the value an <input type="time">
// round-trips through). We deliberately read the wall clock from `new Date()`
// rather than `toISOString().slice(11, 16)` because the latter uses UTC, which
// can drift by an hour depending on the user's timezone vs. the server's.
export function formatTimeInput(date: Date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

// Pretty-print a 24-hour HH:MM[:SS] time (e.g. what comes back from the DB's
// `time` column or the <input type="time"> control) as 9:41 AM. Returns ''
// for empty / null / undefined so callers can use the result directly in
// templates without an extra guard.
export function formatTime(time: string | null | undefined) {
  if (!time) return ''
  // Accept both "HH:MM" and "HH:MM:SS" — strip the seconds if present.
  const [hh, mm] = time.split(':')
  if (!hh || !mm) return time
  const h = Number(hh)
  const m = Number(mm)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function getPaymentStatus(
  amountPaid: number,
  total: number,
  dueDate?: string | null
) {
  const balance = total - amountPaid
  if (balance <= 0) return 'paid'
  if (amountPaid > 0) return 'partial'
  if (dueDate && new Date(dueDate) < new Date()) return 'overdue'
  return 'due'
}

export const PAYMENT_STATUS_STYLES = {
  paid: 'bg-success-muted text-success',
  partial: 'bg-info-muted text-info',
  overdue: 'bg-destructive-muted text-destructive',
  due: 'bg-warning-muted text-warning',
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-primary-muted text-primary',
  converted: 'bg-secondary text-secondary-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}

/**
 * Returns the status label to display for an invoice/quotation.
 *
 * Some document statuses (cancelled, converted) are stored explicitly on the
 * row and should be shown verbatim. For everything else we derive the payment
 * state from the amounts and due date.
 */
export function getInvoiceDisplayStatus(
  status: string,
  amountPaid: number,
  total: number,
  dueDate?: string | null
) {
  if (status === 'cancelled' || status === 'converted') return status
  return getPaymentStatus(amountPaid, total, dueDate)
}

/**
 * Delivery / fulfilment lifecycle, shown as a second tag next to the payment
 * status. Derived from the columns that already exist (no redundant storage):
 *   - picking_status === 'delivered'        → Delivered
 *   - status === 'draft'                    → Draft
 *   - anything else (sent/partial/paid/...) → Created (the order is issued)
 *
 * Note: the stored value `sent` is the historical name for "issued/created".
 * We relabel it to "Created" at the presentation layer only (see
 * getDocumentStatusLabel) — the underlying enum value is unchanged.
 */
export type DeliveryStatus = 'draft' | 'created' | 'delivered' | 'converted'

export function getDeliveryStatus(
  status: string,
  pickingStatus?: string | null
): DeliveryStatus {
  if (pickingStatus === 'delivered') return 'delivered'
  if (status === 'draft') return 'draft'
  if (status === 'converted') return 'converted'
  return 'created'
}

export const DELIVERY_STATUS_STYLES: Record<DeliveryStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  created: 'bg-primary-muted text-primary',
  delivered: 'bg-success-muted text-success',
  converted: 'bg-success-muted text-success',
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: 'Draft',
  created: 'Created',
  delivered: 'Delivered',
  converted: 'Converted',
}

/**
 * Human label for a stored invoice/quotation status value. The stored value
 * `sent` is presented as "Created"; everything else is simply capitalised.
 */
export function getDocumentStatusLabel(status: string): string {
  if (!status) return ''
  if (status === 'sent') return 'Created'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function daysBetween(start: string | Date, end: string | Date = new Date()): number {
  const toUTCDate = (d: string | Date) => {
    const date = new Date(d)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.floor((toUTCDate(end) - toUTCDate(start)) / msPerDay)
}

export function formatPercentage(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatTrend(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${(value * 100).toFixed(1)}%`
}

// Normalize a phone number for use with https://wa.me/<number>, which expects
// international format: digits only, no leading +, no spaces, with country
// code. UK numbers in local format (starting 0) are converted to 44. Numbers
// already in international format (with or without +) are passed through.
// Returns '' for null/undefined input or for inputs whose digit count is
// outside the E.164-compatible range (4..15 digits — anything outside that is
// either malformed or a DoS attempt and gets dropped); callers should
// validate the result before using it in a wa.me link.
export function normalizePhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return ''
  // Reject obviously oversized inputs without doing the regex work —
  // 64 chars is well past any real phone number and keeps the regex
  // bounded against DoS payloads.
  if (phone.length > 64) return ''
  let digits = phone.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  let normalized: string
  if (digits.startsWith('44')) normalized = digits
  else if (digits.startsWith('0')) normalized = '44' + digits.slice(1)
  else normalized = digits
  // E.164 caps real numbers at 15 digits. Below 4 is not a real phone
  // number either. Anything in between is fine; out of range → drop.
  if (normalized.length < 4 || normalized.length > 15) return ''
  return normalized
}

// Permissive-but-not-stupid email check. The local part allows the usual
// printable ASCII set, the domain allows alphanumerics / hyphens / dots,
// and the TLD must be at least 2 letters. This is intentionally NOT
// RFC 5322 — we use it as a first-pass sanity check before handing the
// address to Resend (which does the real validation). Catches the common
// "a@b" / "no @" / "spaces" mistakes that a too-loose regex misses.
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/

export function isLikelyValidEmail(value: string | null | undefined): boolean {
  if (!value) return false
  return EMAIL_RE.test(value.trim())
}

// Strip common Markdown formatting so text can be spoken by the browser's
// speech synthesis API without reading out asterisks, underscores, etc.
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`{1,3}(.+?)`{1,3}/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
