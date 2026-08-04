// lib/invoices/pdf-helpers.ts
// Pure layout helpers shared between InvoiceDocument, InvoicePdfTemplate,
// DeliveryNoteDocument and DeliveryNotePdfTemplate. Keeping them in one
// place stops the two template families from drifting apart.

import { filterChannelsByContext, type CompanyContactChannel } from '@/lib/company'

export interface ClientInfo {
  first_name: string | null
  last_name: string | null
  company_name: string | null
  address_line_1?: string | null
  address_line_2?: string | null
  town?: string | null
  county?: string | null
  postcode?: string | null
  email?: string | null
  phone?: string | null
}

export function getClientDisplay(client?: ClientInfo | null): {
  primary: string
  secondary?: string
  phone?: string | null
} {
  const primary =
    client?.company_name ||
    [client?.first_name, client?.last_name].filter(Boolean).join(' ') ||
    ''
  const secondary =
    client?.company_name && client?.first_name
      ? [client.first_name, client.last_name].filter(Boolean).join(' ')
      : undefined
  return { primary, secondary, phone: client?.phone }
}

/**
 * Build the address lines for the "Invoice to" / "Deliver to" blocks.
 * Keeps the address compact by collapsing town + county + postcode
 * onto a single trailing line (comma-joined, postcode trailing):
 *
 *   line 1: name (or company name)
 *   line 2: address_line_1   (street + house number)
 *   line 3: address_line_2   (apt / building — only if present)
 *   line 4: town, county postcode   (e.g. "Slough, Berkshire SL1 3JD")
 *
 * When address_line_2 is absent the trailing line shifts up to line 3
 * so the rendered block stays as short as possible (3 lines instead of
 * 4). The "Invoice to" and "Deliver to" columns are rendered with the
 * same number of lines so they always stay vertically aligned.
 */
export function paddedAddressLines(
  name: string | null | undefined,
  l1: string | null | undefined,
  l2: string | null | undefined,
  town: string | null | undefined,
  county: string | null | undefined,
  postcode: string | null | undefined
): string[] {
  const cleanName = (name || '').trim()
  const cleanL1 = (l1 || '').replace(/^[,\s]+|[,\s]+$/g, '').trim()
  const cleanL2 = (l2 || '').replace(/^[,\s]+|[,\s]+$/g, '').trim()
  const cleanTown = (town || '').replace(/^[,\s]+|[,\s]+$/g, '').trim()
  const cleanCounty = (county || '').replace(/^[,\s]+|[,\s]+$/g, '').trim()
  const cleanPostcode = (postcode || '').replace(/^[,\s]+|[,\s]+$/g, '').trim()

  const standaloneFields = [cleanTown.toLowerCase(), cleanCounty.toLowerCase(), cleanPostcode.toLowerCase()].filter(Boolean)

  const cleanLineOfRedundancies = (line: string) => {
    if (!line) return ''
    const parts = line.split(',')
    const cleanParts = parts
      .map((p) => p.trim())
      .filter((p) => p && !standaloneFields.includes(p.toLowerCase()))
    return cleanParts.join(', ')
  }

  const processedL1 = cleanLineOfRedundancies(cleanL1)
  const processedL2 = cleanLineOfRedundancies(cleanL2)

  // Compose the trailing line: "<town>, <county> <postcode>". If only one
  // of town/county is present, drop the comma. Postcode always trails.
  const trailing: string[] = []
  if (cleanTown) trailing.push(cleanTown)
  if (cleanCounty) trailing.push(cleanCounty)
  const trailingLine = cleanPostcode
    ? trailing.length > 0
      ? `${trailing.join(', ')} ${cleanPostcode}`
      : cleanPostcode
    : trailing.join(', ')

  // Build the lines. When l2 is blank we omit it so the trailing line
  // sits on line 3 instead of being pushed down by a blank line 3.
  const lines: string[] = []
  lines.push(cleanName) // line 1 — name
  lines.push(processedL1) // line 2 — street
  if (cleanL2) lines.push(processedL2) // line 3 — apt / building (only if present)
  lines.push(trailingLine) // last line — town, county postcode

  return lines
}

/**
 * Compact company address for the invoice header.
 * Returns two comma-joined lines to keep the header block short:
 *   line 1 = address_line_1 + address_line_2
 *   line 2 = town + county + postcode
 */
export function compactCompanyAddress(
  l1: string | null | undefined,
  l2: string | null | undefined,
  town: string | null | undefined,
  county: string | null | undefined,
  postcode: string | null | undefined
): [string, string] {
  const cleanL1 = (l1 || '').replace(/^[\s,]+|[\s,]+$/g, '').trim()
  const cleanL2 = (l2 || '').replace(/^[\s,]+|[\s,]+$/g, '').trim()
  const cleanTown = (town || '').replace(/^[\s,]+|[\s,]+$/g, '').trim()
  const cleanCounty = (county || '').replace(/^[\s,]+|[\s,]+$/g, '').trim()
  const cleanPostcode = (postcode || '').replace(/^[\s,]+|[\s,]+$/g, '').trim()

  // Avoid printing town/county/postcode twice if they already appear in l1/l2.
  const standaloneFields = [cleanTown.toLowerCase(), cleanCounty.toLowerCase(), cleanPostcode.toLowerCase()].filter(Boolean)

  const cleanLineOfRedundancies = (line: string) => {
    if (!line) return ''
    const parts = line.split(',').map((p) => p.trim()).filter((p) => p && !standaloneFields.includes(p.toLowerCase()))
    return parts.join(', ')
  }

  const processedL1 = cleanLineOfRedundancies(cleanL1)
  const processedL2 = cleanLineOfRedundancies(cleanL2)

  const line1 = [processedL1, processedL2].filter(Boolean).join(', ')
  const line2 = [cleanTown, cleanCounty, cleanPostcode].filter(Boolean).join(', ')

  return [line1, line2]
}

export function formatDateUK(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return typeof date === 'string' ? date : ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function formatTime12h(time: string | null | undefined): string {
  if (!time) return ''
  const [hh, mm] = time.split(':')
  if (!hh || !mm) return ''
  const h = Number(hh)
  const m = Number(mm)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function formatItemQuantity(quantity: number | string, unit?: string | null): string {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return unit ? `0 ${unit}` : '0'
  let fixed: string
  if (n % 1 === 0) fixed = n.toFixed(0)
  else if (Math.abs(n) < 0.0005) fixed = '0'
  else if (Math.abs(n) < 0.005) fixed = n.toFixed(4).replace(/\.?0+$/, '')
  else fixed = n.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${fixed} ${unit}` : fixed
}

export function emDash(value: string | null | undefined): string {
  return value ? value : '\u2014'
}

export interface HeaderContactInfo {
  telValue: string
  primaryTelLink: string | null
  primaryEmail: string
  extraEmails: string[]
}

/**
 * One row of the head-office contact grid. Pairs phone[i] with email[i]
 * (when both exist). Either side can be missing — the renderer leaves
 * the matching cell blank instead of skipping the row, so the 2-column
 * layout stays vertically aligned across rows.
 */
export interface HeaderContactGridRow {
  phone?: CompanyContactChannel
  email?: CompanyContactChannel
}

/**
 * Build a 2-column contact grid for the invoice header.
 *
 *   phones = [P1, P2, P3, P4], emails = [E1, E2, E3, E4] →
 *     [
 *       { phone: P1, email: E1 },
 *       { phone: P2, email: E2 },
 *       { phone: P3, email: E3 },
 *       { phone: P4, email: E4 },
 *     ]
 *
 * When one side has fewer entries the matching cells are omitted (the
 * renderer still draws a row so the other column stays aligned). For
 * example phones=[P1,P2], emails=[E1,E2,E3,E4] →
 *     [
 *       { phone: P1, email: E1 },
 *       { phone: P2, email: E2 },
 *       {            email: E3 },
 *       {            email: E4 },
 *     ]
 *
 * The grid is always at most `max(phones.length, emails.length)` rows
 * and never zero when at least one side has entries. The single-column
 * legacy `HeaderContactInfo` is left alone for callers that still want
 * the flat "Tel: A / B" / "Email: a, b" rendering.
 */
export function buildHeaderContactGrid(
  phones: CompanyContactChannel[],
  emails: CompanyContactChannel[]
): HeaderContactGridRow[] {
  const rowCount = Math.max(phones.length, emails.length)
  if (rowCount === 0) return []
  const grid: HeaderContactGridRow[] = []
  for (let i = 0; i < rowCount; i++) {
    grid.push({
      phone: phones[i],
      email: emails[i],
    })
  }
  return grid
}

/**
 * One cell of the head-office contact block.
 */
export interface HeaderContactBlockCell {
  type: 'phone' | 'email'
  channel?: CompanyContactChannel
}

/**
 * Build a 2-column contact block for the invoice header, grouping all
 * phones first, then all emails.
 *
 *   phones = [P1, P2, P3, P4], emails = [E1, E2, E3, E4] →
 *     [
 *       [{ type: 'phone', channel: P1 }, { type: 'phone', channel: P2 }],
 *       [{ type: 'phone', channel: P3 }, { type: 'phone', channel: P4 }],
 *       [{ type: 'email', channel: E1 }, { type: 'email', channel: E2 }],
 *       [{ type: 'email', channel: E3 }, { type: 'email', channel: E4 }],
 *     ]
 *
 * The block always reserves space for two 2×2 sub-blocks (four rows in
 * total) so the layout does not shift when contacts are added later.
 * Empty cells contain an undefined channel and are rendered as blank
 * space. If neither side has any contacts, an empty array is returned so
 * the caller can fall back to the legacy single-line display.
 */
export function buildHeaderContactBlocks(
  phones: CompanyContactChannel[],
  emails: CompanyContactChannel[]
): HeaderContactBlockCell[][] {
  if (phones.length === 0 && emails.length === 0) return []

  const MAX_PER_TYPE = 4
  const limitedPhones = phones.slice(0, MAX_PER_TYPE)
  const limitedEmails = emails.slice(0, MAX_PER_TYPE)
  const rows: HeaderContactBlockCell[][] = []

  for (let row = 0; row < 2; row++) {
    rows.push([
      { type: 'phone', channel: limitedPhones[row * 2] },
      { type: 'phone', channel: limitedPhones[row * 2 + 1] },
    ])
  }
  for (let row = 0; row < 2; row++) {
    rows.push([
      { type: 'email', channel: limitedEmails[row * 2] },
      { type: 'email', channel: limitedEmails[row * 2 + 1] },
    ])
  }

  return rows
}

export function getHeaderContactInfo(
  phones: CompanyContactChannel[] | undefined | null,
  emails: CompanyContactChannel[] | undefined | null,
  legacyPhone?: string | null,
  legacyEmail?: string | null
): HeaderContactInfo {
  const invoicePhones = filterChannelsByContext(phones ?? [], 'invoice')
  const invoiceEmails = filterChannelsByContext(emails ?? [], 'invoice')
  const telValue =
    invoicePhones.length > 0
      ? invoicePhones.map((p) => p.value).join(' / ')
      : legacyPhone || ''
  const primaryEmail =
    invoiceEmails.find((e) => e.isPrimary)?.value ||
    invoiceEmails[0]?.value ||
    legacyEmail ||
    ''
  const extraEmails = invoiceEmails
    .filter((e) => e.value && e.value !== primaryEmail)
    .map((e) => e.value)
    .slice(0, 3)
  const primaryTelLink = invoicePhones[0]?.value
    ? `tel:${invoicePhones[0].value.replace(/\s+/g, '')}`
    : legacyPhone
      ? `tel:${legacyPhone.replace(/\s+/g, '')}`
      : null

  return { telValue, primaryTelLink, primaryEmail, extraEmails }
}
