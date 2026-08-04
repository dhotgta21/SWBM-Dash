// Single source of truth for invoice/quotation status transitions.
// Shared by the server action (lib/actions/invoices.ts) and the UI status
// controls (InvoiceStatusDropdown / InvoiceStatusUpdater) so they can't drift.

export type DocumentType = 'invoice' | 'quotation'

// We dropped 'cancelled' from the transition table. The workflow is:
//   delete a draft / sent doc instead of cancelling it. Once money is in
//   (partial / paid) the doc is hard-locked, and 'converted' quotes can't be
//   re-opened. So the only legal destinations are the natural next states.
export const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['paid', 'partial'],
  partial: ['paid'],
  paid: [],
}

export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent'],
  sent: ['converted'],
  converted: [],
}

// Statuses a brand-new document may start with.
export const NEW_DOCUMENT_STATUSES = ['draft', 'sent'] as const

export function normalizeStatus(status: string): string {
  return status.toLowerCase().trim()
}

function transitionsFor(type: DocumentType): Record<string, string[]> {
  return type === 'quotation' ? QUOTE_TRANSITIONS : INVOICE_TRANSITIONS
}

export function isValidStatusTransition(
  type: DocumentType,
  current: string,
  next: string
): boolean {
  const normalizedCurrent = normalizeStatus(current)
  const normalizedNext = normalizeStatus(next)
  if (normalizedCurrent === normalizedNext) return true
  const allowed = transitionsFor(type)[normalizedCurrent]
  return allowed?.includes(normalizedNext) ?? false
}

// Options to present in a status <select>: the current status first, then the
// legal next states. (The current status is always allowed as a no-op.)
export function getSelectableStatuses(type: DocumentType, current: string): string[] {
  const allowed = transitionsFor(type)[current] ?? []
  return [current, ...allowed]
}

// 'paid' / 'partial' → hard-locked. Once money is recorded the document
// cannot be edited at all; the edit tab is hidden.
export function isHardLocked(status?: string): boolean {
  const normalized = normalizeStatus(status || '')
  if (!normalized) return false
  return ['paid', 'partial'].includes(normalized)
}

// 'sent' is treated as a simple tag and does not lock the form. Only
// converted quotes remain soft-locked: editable only by admins. Staff with
// invoices_edit can still read the page but the form inputs are disabled.
export function isSoftLocked(status?: string): boolean {
  const normalized = normalizeStatus(status || '')
  if (!normalized) return false
  return ['converted'].includes(normalized)
}
