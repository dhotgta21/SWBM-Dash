import {
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import { formatTime } from '@/lib/utils'
import {
  type CompanyContactChannel,
  filterChannelsByContext,
} from '@/lib/company'
import { compactCompanyAddress, buildHeaderContactBlocks, paddedAddressLines } from '@/lib/invoices/pdf-helpers'

/**
 * Star Hawk delivery / picker note.
 *
 * Uses the same layout, colours, logo and typography as the invoice PDF.
 * The ONLY differences are:
 *   • Title is "Delivery Note" or "Picker Note".
 *   • Line items show Quantity | Product | V (no Price / Total).
 *   • The bottom financial block is replaced with:
 *       - Date printed
 *       - Driver signature box
 *       - Customer signature box
 */

const PAGE_PADDING = 28

/**
 * Max line items per page for delivery / picker notes. The delivery note
 * items table is 3 columns (Quantity / Product / V) — narrower than the
 * invoice's 5-column table — so each row is roughly the same height, and
 * 12 items fits comfortably above the date-printed / signature block on
 * the last page.
 */
export const DELIVERY_NOTE_ITEMS_PER_PAGE = 12

const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#000000',
    lineHeight: 1.3,
  },

  // ── 1. Header ────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  headerLogoWrap: {
    width: 44,
  },
  headerLogo: {
    width: 44,
    height: 64,
    objectFit: 'contain',
  },
  headerLogoPlaceholder: {
    width: 44,
    height: 64,
    backgroundColor: '#C8202C',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 3,
  },
  headerLogoPlaceholderText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 10,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    // Widened from 55% → 50% so the 2-column contact grid (phones
    // left, emails right, up to 4 rows each) fits inside the head
    // office block. The previous 55% was tuned for the single-line
    // "Tel: … / …" / "Email: …, …" rendering and clipped longer
    // contact lists. 50% is the upper bound before the block starts
    // overlapping the logo block (logo ends ~226pt from content-area
    // left = 254pt from page left; head office right edge is 12pt
    // from content-area right = 555pt from page left; 50% × 595pt =
    // 297pt keeps the left edge at 258pt, just clear of the logo).
    maxWidth: '50%',
    marginTop: 8,
    marginRight: 12,
  },
  headOfficeLabel: {
    fontWeight: 'bold',
    fontSize: 9,
    marginBottom: 1,
    fontFamily: 'Helvetica-Bold',
  },
  headerAddress: {
    fontSize: 9,
    marginBottom: 1,
    textAlign: 'left',
    fontFamily: 'Helvetica',
  },
  headerContactGap: {
    height: 4,
  },
  headerContactRow: {
    fontSize: 9,
    marginBottom: 1,
    textAlign: 'left',
    fontFamily: 'Helvetica',
  },
  headerContactLabel: {
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
  },
  // 2-column contact grid: phones (left) | emails (right), paired
  // row-by-row. The grid lives in its own sub-View inside the head
  // office block so the contact rows can flow as a single flex column
  // with each row being a horizontal flex of (phone cell, email cell).
  headerContactGridRow: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  headerContactGridCell: {
    width: '50%',
    fontSize: 9,
    fontFamily: 'Helvetica',
    textAlign: 'left',
    lineHeight: 1.1,
    paddingRight: 4,
  },

  // ── 2. Title + address row ───────────────────────────────────────────
  titleAddressRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 14,
  },
  titleAddressCol: {
    flex: 1,
    paddingRight: 8,
  },
  titleAddressColCenter: {
    width: 120,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  invoiceToLabel: {
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  invoiceToLine: {
    fontSize: 9,
    fontFamily: 'Helvetica',
    marginBottom: 1,
    minHeight: 9, // preserves vertical space when blank
  },
  invoiceNumberLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    marginBottom: 1,
  },
  invoiceNumberValue: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },

  // ── 3. Account table ─────────────────────────────────────────────────
  accountTable: {
    borderWidth: 2.0,
    borderColor: '#E5E5E5',
    marginTop: 16,
    marginBottom: 8,
  },
  accountRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: '#E5E5E5',
  },
  accountRowLast: {
    flexDirection: 'row',
  },
  accountHeaderCellBase: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'Courier-Bold',
    backgroundColor: '#E5E5E5',
  },
  accountHeaderCellLeft: {
    width: '15%',
  },
  accountHeaderCellWide: {
    width: '45%',
  },
  accountHeaderCellRight: {
    width: '25%',
    textAlign: 'right',
  },
  accountHeaderCellLast: {
    width: '15%',
    textAlign: 'right',
  },
  // Label row ("Your Contact / Your Reference / Page") — bold, with gray bg
  accountLabelCellBase: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'Courier-Bold',
    backgroundColor: '#E5E5E5',
  },
  accountLabelCellLeft: {
    width: '18%',
  },
  accountLabelCellWide: {
    width: '42%',
  },
  accountLabelCellRight: {
    width: '25%',
    textAlign: 'right',
  },
  accountLabelCellLast: {
    width: '15%',
    textAlign: 'right',
  },
  accountCellBase: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '500',
  },
  accountCellLeft: {
    width: '15%',
  },
  accountCellWide: {
    width: '45%',
  },
  accountCellRight: {
    width: '25%',
    textAlign: 'right',
  },
  accountCellLast: {
    width: '15%',
    textAlign: 'right',
  },

  // ── 4. Line items (inside the joined outer container) ────────────────
  // The entire items table uses Courier monospace — header + all columns —
  // so the table looks like ONE consistent block. NO outer border here —
  // the outer container (joinedSection) draws the surrounding border.
  itemsHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E5E5',
  },
  itemsHeaderCell: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    fontSize: 9,
    fontFamily: 'Courier-Bold',
    fontWeight: 'bold',
  },
  itemsHeaderCellLast: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    fontSize: 9,
    fontFamily: 'Courier-Bold',
    fontWeight: 'bold',
  },
  itemsRow: {
    flexDirection: 'row',
  },
  itemQtyCell: {
    width: '12%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: '500',
  },
  itemProductCell: {
    width: '45%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'left',
    fontWeight: '500',
  },
  itemPriceCell: {
    width: '24%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: '500',
  },
  itemTotalCell: {
    width: '14%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: '500',
  },
  itemVatCell: {
    width: '5%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'center',
    fontWeight: '500',
  },

  // ── Joined outer container (items + VAT/Totals + payment) ───────────
  joinedSection: {
    borderWidth: 2.0,
    borderColor: '#E5E5E5',
    marginBottom: 8,
    height: 440,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  joinedDivider: {
    height: 8,
    backgroundColor: '#E5E5E5',
  },

  // ── 5. Bottom joined section (VAT + Totals) ─────────────────────────
  // Rendered as ONE continuous 7-column table inside the outer
  // joinedSection rectangle. Column widths mirror the HTML/Tailwind
  // invoice document: 10% | 14% | 16% | 13% | 4% gap | 28% | 15%.
  bottomTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.3,
    borderBottomColor: '#E5E5E5',
  },
  bottomTableRowLast: {
    flexDirection: 'row',
  },
  // VAT breakdown cells (first four columns)
  vatHeaderCell: {
    width: '10%',
    padding: 4,
    backgroundColor: '#E5E5E5',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
  },
  vatRateHeaderCell: {
    width: '14%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier-Bold',
    fontWeight: 'bold',
    textAlign: 'right',
    backgroundColor: '#E5E5E5',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
  },
  vatGoodsHeaderCell: {
    width: '16%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier-Bold',
    fontWeight: 'bold',
    textAlign: 'right',
    backgroundColor: '#E5E5E5',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
  },
  vatAmountHeaderCell: {
    width: '13%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier-Bold',
    fontWeight: 'bold',
    textAlign: 'right',
    backgroundColor: '#E5E5E5',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
  },
  vatBodyCell: {
    width: '10%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
    fontWeight: '500',
  },
  vatRateBodyCell: {
    width: '14%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
    fontWeight: '500',
  },
  vatGoodsBodyCell: {
    width: '16%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
    fontWeight: '500',
  },
  vatAmountBodyCell: {
    width: '13%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
    fontWeight: '500',
  },
  // Visual gap between VAT breakdown and Totals columns
  vatTotalsGap: {
    width: '4%',
  },
  // Totals cells (last two columns)
  totalsLabelCell: {
    width: '28%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    borderRightWidth: 0.75,
    borderRightColor: '#E5E5E5',
    fontWeight: '500',
  },
  totalsValueCell: {
    width: '15%',
    padding: 4,
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: '500',
  },

  // ── 6. Payment info (inside the outer rectangle) ─────────────────────
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 4,
    marginBottom: 4,
  },
  paymentLeft: {
    flex: 1,
  },
  paymentLine: {
    fontSize: 9,
    fontFamily: 'Courier',
    marginBottom: 1,
    fontWeight: '500',
  },
  paymentLineRight: {
    fontSize: 8,
    fontFamily: 'Courier',
    textAlign: 'right',
    fontWeight: '500',
  },

  // ── 7. Footer ────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 14,
    left: PAGE_PADDING,
    right: PAGE_PADDING,
    textAlign: 'center',
    fontSize: 8,
    color: '#000000',
    fontFamily: 'Helvetica',
  },
})

export interface DeliveryNotePdfProps {
  invoice: {
    id?: string
    type: string
    document_number: string
    issue_date: string
    issue_time?: string | null
    due_date?: string | null
    expiry_date?: string | null
    order_number?: string | null
    account_number?: string | null
    operator_name?: string
    your_reference?: string | null
    your_contact?: string | null
    notes?: string | null
    subtotal: number
    vat_total: number
    total: number
    amount_paid: number
    balance_due: number
    share_token?: string | null
    public_share_enabled?: boolean
    delivery_note_share_enabled?: boolean
    share_token_expires_at?: string | null
    delivery_method?: 'delivery' | 'collection' | null
    delivery_address_line_1?: string | null
    delivery_address_line_2?: string | null
    delivery_town?: string | null
    delivery_county?: string | null
    delivery_postcode?: string | null
    // New in 062 — optional advice-note band on line items
    advice_note_number?: string | null
    advice_note_date?: string | null
    load_number?: number | null
    clients:
      | {
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
      | {
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
        }[]
    invoice_items?: {
      product_name: string
      product_code: string | null
      unit: string | null
      quantity: number
      price: number
      vat_rate: number
      vat_amount: number
      line_total: number
    }[]
  }
  company?: {
    company_name?: string
    address_line_1?: string | null
    address_line_2?: string | null
    town?: string | null
    county?: string | null
    postcode?: string | null
    /** @deprecated Use `phones` with context filters. Kept for backwards compatibility. */
    phone?: string | null
    /** @deprecated Use `emails` with context filters. Kept for backwards compatibility. */
    email?: string | null
    phones?: CompanyContactChannel[]
    emails?: CompanyContactChannel[]
    vat_number?: string | null
    company_registration_number?: string | null
    logo_url?: string | null
    // New in 062
    fax?: string | null
    website?: string | null
  }
  bankDetails?: {
    bank_name?: string | null
    bank_account_name?: string | null
    sort_code?: string | null
    account_number?: string | null
  }
  logoSrc?: string | null
  operatorName?: string
}

function formatDateUK(date: string | null | undefined) {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function formatItemQuantity(quantity: number, unit?: string | null) {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return unit ? `0 ${unit}` : '0'
  let qty: string
  if (n % 1 === 0) qty = n.toFixed(0)
  else if (Math.abs(n) < 0.005) qty = '0'
  else qty = n.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${qty} ${unit}` : qty
}

function emDash(value: string | null | undefined): string {
  return value ? value : '\u2014'
}

// `paddedAddressLines` is imported from `@/lib/invoices/pdf-helpers` — the
// shared helper the invoice PDF + HTML preview also use, so all four
// document types format addresses identically.

export function DeliveryNotePdfPage({
  invoice,
  company,
  logoSrc,
  operatorName,
  // Multi-page chunk props. When rendering a multi-page delivery note,
  // the wrapper (DeliveryNoteDocument) pre-splits invoice_items into
  // chunks of DELIVERY_NOTE_ITEMS_PER_PAGE and tells each page which
  // chunk it owns plus whether it is the first / last page. Defaults
  // assume a single-page note so any legacy caller still works.
  pageChunk,
  isFirstPage = true,
  isLastPage = true,
  pageNumber = 1,
}: DeliveryNotePdfProps & {
  pageChunk?: DeliveryNotePdfProps['invoice']['invoice_items']
  isFirstPage?: boolean
  isLastPage?: boolean
  pageNumber?: number
}) {
  const displayOperator =
    invoice.operator_name && invoice.operator_name !== 'Unknown Operator'
      ? invoice.operator_name
      : operatorName || invoice.operator_name || 'Unknown Operator'
  const isCollection = invoice.delivery_method === 'collection'
  const baseDocTypeLabel = isCollection ? 'Picker Note' : 'Delivery Note'
  const docTypeLabel = invoice.load_number
    ? `${baseDocTypeLabel} — Load ${invoice.load_number}`
    : baseDocTypeLabel
  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const clientName =
    client?.company_name || [client?.first_name, client?.last_name].filter(Boolean).join(' ') || ''

  const invoiceToLines = paddedAddressLines(
    clientName,
    client?.address_line_1,
    client?.address_line_2,
    client?.town,
    client?.county,
    client?.postcode,
  )

  const fulfilmentLines = isCollection
    ? paddedAddressLines(
        company?.company_name || 'Head Office',
        company?.address_line_1,
        company?.address_line_2,
        company?.town,
        company?.county,
        company?.postcode,
      )
    : paddedAddressLines(
        clientName,
        invoice.delivery_address_line_1,
        invoice.delivery_address_line_2,
        invoice.delivery_town,
        invoice.delivery_county,
        invoice.delivery_postcode,
      )

  // ---- Header contact info (right-aligned block) ---------------------
  const invoicePhones = filterChannelsByContext(company?.phones ?? [], 'invoice')
  const invoiceEmails = filterChannelsByContext(company?.emails ?? [], 'invoice')
  // 2-column contact block: phones first (2 per row, up to 4 numbers),
  // then emails below (2 per row, up to 4 emails). This groups each
  // contact type in its own 2×2 block instead of alternating phone/email
  // on every row.
  const contactRows = buildHeaderContactBlocks(invoicePhones, invoiceEmails)
  const gridHasContent = contactRows.length > 0
  const telValue =
    invoicePhones.length > 0
      ? invoicePhones.map((p) => p.value).join(' / ')
      : company?.phone || ''
  // Primary email: prefer the channel flagged as primary; fall back to legacy single.
  const primaryEmail =
    invoiceEmails.find((e) => e.isPrimary)?.value ||
    invoiceEmails[0]?.value ||
    company?.email ||
    ''
  const extraEmails = invoiceEmails
    .filter((e) => e.value && e.value !== primaryEmail)
    .map((e) => e.value)
    .slice(0, 3)

  // Items for THIS page. Defaults to every item so single-page callers
  // (no chunk passed) behave exactly as before.
  const allItems = invoice.invoice_items ?? []
  const itemsForThisPage = pageChunk ?? allItems

  return (
    <>
      {/* ─── 1. Header ─────────────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.headerLogoWrap}>
            {logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoSrc} style={styles.headerLogo} />
            ) : (
              <View style={styles.headerLogoPlaceholder}>
                <Text style={styles.headerLogoPlaceholderText}>SH</Text>
              </View>
            )}
          </View>
          <View style={{ height: 44, width: 1, backgroundColor: '#D1D5DB', marginHorizontal: 12 }} />
          <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#0F172A', letterSpacing: 0.8, lineHeight: 1.2 }}>STAR HAWK</Text>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#475569', letterSpacing: 1.2, marginTop: 2, lineHeight: 1.2 }}>BUILDERS MERCHANT LTD.</Text>
          </View>
        </View>
        {(() => {
          const [addr1, addr2] = compactCompanyAddress(
            company?.address_line_1,
            company?.address_line_2,
            company?.town,
            company?.county,
            company?.postcode
          )
          const allEmails = [primaryEmail, ...extraEmails].filter(Boolean).join(', ')
          return (
            // Width: right edge at the page's right padding (matches
            // the "Document Number" column's right edge in the title
            // row below). `maxWidth: 70%` caps the left edge at the
            // centred document-title's left edge so the 2-column
            // contact grid never spills left into the logo.
            <View style={styles.headerRight}>
              <Text style={styles.headOfficeLabel}>Head Office</Text>
              {addr1 ? <Text style={styles.headerAddress}>{addr1}</Text> : null}
              {addr2 ? <Text style={styles.headerAddress}>{addr2}</Text> : null}

              <View style={styles.headerContactGap} />

              {gridHasContent ? (
                // 2-column contact block: all phones first, then all
                // emails. Each row contains up to 2 entries of the same
                // type so the layout forms a 2×2 phone block above a 2×2
                // email block. Empty cells are rendered as blank space to
                // keep the columns aligned.
                <View>
                  {contactRows.map((row, i) => (
                    <View key={`contact-row-${i}`} style={styles.headerContactGridRow}>
                      {row.map((cell, j) => (
                        <Text key={`contact-cell-${i}-${j}`} style={styles.headerContactGridCell}>
                          {cell.channel ? (
                            <>
                              <Text style={styles.headerContactLabel}>
                                {cell.type === 'phone' ? 'Tel: ' : 'Email: '}
                              </Text>
                              {cell.channel.value}
                            </>
                          ) : null}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <>
                  {telValue ? (
                    <Text style={styles.headerContactRow}>
                      <Text style={styles.headerContactLabel}>Tel: </Text>
                      {telValue}
                    </Text>
                  ) : null}
                  {allEmails ? (
                    <Text style={styles.headerContactRow}>
                      <Text style={styles.headerContactLabel}>Email: </Text>
                      {allEmails}
                    </Text>
                  ) : null}
                </>
              )}
              {company?.fax ? (
                <Text style={styles.headerContactRow}>
                  <Text style={styles.headerContactLabel}>Fax: </Text>
                  {company.fax}
                </Text>
              ) : null}
              {company?.website ? (
                <Text style={styles.headerContactRow}>{company.website}</Text>
              ) : null}
            </View>
          )
        })()}
      </View>

      {/* ─── 2. Title Row (Centered title + Right-aligned Number) ───── */}
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'flex-start', marginBottom: 26 }}>
        <View style={{ flex: 1 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.invoiceTitle}>{docTypeLabel}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.invoiceNumberLabel}>Document Number</Text>
          <Text style={styles.invoiceNumberValue}>{invoice.document_number}</Text>
        </View>
      </View>

      {/* ─── 3. Address blocks (2-column layout) ────────────────────── */}
      <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginBottom: 0 }}>
        {/* Left Column: Invoice to */}
        <View style={{ width: 180, paddingLeft: 48 }}>
          <Text style={styles.invoiceToLabel}>Invoice to:-</Text>
          {invoiceToLines.map((line, i) => (
            <Text key={`invoice-to-${i}`} style={styles.invoiceToLine}>
              {line || ' '}
            </Text>
          ))}
        </View>
        {/* Right Column: Deliver to / Pick up from */}
        <View style={{ width: 180 }}>
          <Text style={styles.invoiceToLabel}>{isCollection ? 'Pick up from:-' : 'Deliver to:-'}</Text>
          {fulfilmentLines.map((line, i) => (
            <Text key={`deliver-to-${i}`} style={styles.invoiceToLine}>
              {line || ' '}
            </Text>
          ))}
        </View>
      </View>

      {/* ─── 3. Account table ──────────────────────────────────────── */}
      <View style={styles.accountTable}>
        <View style={styles.accountRow}>
          <Text style={[styles.accountHeaderCellBase, styles.accountHeaderCellLeft]}>Account</Text>
          <Text style={[styles.accountHeaderCellBase, styles.accountHeaderCellWide]}>Our Operator</Text>
          <Text style={[styles.accountHeaderCellBase, styles.accountHeaderCellRight]}>Taxpoint Date Time</Text>
          <Text style={[styles.accountHeaderCellBase, styles.accountHeaderCellLast]}>Order Number</Text>
        </View>
        <View style={styles.accountRow}>
          <Text style={[styles.accountCellBase, styles.accountCellLeft]}>{emDash(invoice.account_number)}</Text>
          <Text style={[styles.accountCellBase, styles.accountCellWide]}>{displayOperator}</Text>
          <Text style={[styles.accountCellBase, styles.accountCellRight]}>
            {[formatDateUK(invoice.issue_date), formatTime(invoice.issue_time)].filter(Boolean).join(' ')}
          </Text>
          <Text style={[styles.accountCellBase, styles.accountCellLast]}>{emDash(invoice.order_number)}</Text>
        </View>
        <View style={styles.accountRow}>
          <Text style={[styles.accountLabelCellBase, styles.accountLabelCellLeft]}>Your Contact</Text>
          <Text style={[styles.accountLabelCellBase, styles.accountLabelCellWide]} />
          <Text style={[styles.accountLabelCellBase, styles.accountLabelCellRight]}>Your Reference</Text>
          <Text style={[styles.accountLabelCellBase, styles.accountLabelCellLast]}>Page</Text>
        </View>
        <View style={styles.accountRowLast}>
          <Text style={[styles.accountCellBase, styles.accountCellLeft]}>{emDash(invoice.your_contact)}</Text>
          <Text style={[styles.accountCellBase, styles.accountCellWide]} />
          <Text style={[styles.accountCellBase, styles.accountCellRight]}>{emDash(invoice.your_reference)}</Text>
          <Text style={[styles.accountCellBase, styles.accountCellLast]}>{pageNumber}</Text>
        </View>
      </View>

      {/* ─── 4 + 5. Joined outer section (items + date/signatures) ───── */}
      {/* ONE outer rectangle (drawn by joinedSection) containing:
          • items table (top section, 3 cols: Quantity / Product / V)
          • horizontal divider line
          • on the LAST page: Date printed + Driver signature + Customer signature
          • on every OTHER page: empty area with a small "Continued..." note
            in the bottom-right where the signature boxes would land. */}
      <View style={styles.joinedSection}>
        {/* Top block: items table — render exactly DELIVERY_NOTE_ITEMS_PER_PAGE
            slots per page so the table size stays consistent across pages.
            Each real item takes one slot; the remaining slots are blank
            lines (empty rows with the same fixed height). For multi-page
            notes the items keep going across pages; for single-page notes
            the empty rows just pad the table out to a fixed size. */}
        <View>
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.itemsHeaderCell, { width: '15%' }]}>Quantity</Text>
            <Text style={[styles.itemsHeaderCell, { width: '75%' }]}>Product</Text>
            <Text style={[styles.itemsHeaderCellLast, { width: '10%', textAlign: 'center' }]}>V</Text>
          </View>

          {Array.from({
            length: Math.max(itemsForThisPage.length, DELIVERY_NOTE_ITEMS_PER_PAGE),
          }).map((_, slotIdx) => {
            const item = itemsForThisPage[slotIdx]
            if (!item) {
              // Empty slot — same height as a real row, no content.
              return (
                <View key={`empty-slot-${slotIdx}`} style={styles.itemsRow} />
              )
            }
            return (
              <View key={`item-${slotIdx}`} style={styles.itemsRow}>
                <Text style={[styles.itemQtyCell, { width: '15%' }]}>
                  {formatItemQuantity(item.quantity, item.unit)}
                </Text>
                <Text style={[styles.itemProductCell, { width: '75%' }]}>
                  {item.product_name}
                  {item.product_code ? `\n${item.product_code}` : ''}
                </Text>
                <Text style={[styles.itemVatCell, { width: '10%' }]}>
                  {item.vat_rate > 0 ? 'S' : 'Z'}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Bottom block: divider + (sign section on last page | "Continued..."
            on every other page). The divider always renders so the visual
            separator is consistent across pages. */}
        <View>
          <View style={styles.joinedDivider} />

          {isLastPage ? (
            <View style={{ padding: 4 }}>
              <Text style={{ fontSize: 9, fontFamily: 'Courier-Bold', fontWeight: 'bold', marginBottom: 6 }}>
                Date printed: {formatDateUK(new Date().toISOString())}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ width: '35%', borderWidth: 0.75, borderColor: '#E5E5E5', minHeight: 40, padding: 4, justifyContent: 'flex-end' }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Courier-Bold', fontWeight: 'bold' }}>Driver signature</Text>
                </View>
                <View style={{ width: '55%', borderWidth: 0.75, borderColor: '#E5E5E5', minHeight: 60, padding: 4, justifyContent: 'flex-end' }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Courier-Bold', fontWeight: 'bold' }}>Customer signature</Text>
                </View>
              </View>
            </View>
          ) : (
            // Non-last page: empty area with a small "Continued..." text
            // in the bottom-right where the signature boxes would land on
            // the last page. Plain text — no border, no separate badge.
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
                padding: 8,
                minHeight: 70,
              }}
            >
              <Text style={{ fontSize: 9, fontFamily: 'Courier', color: '#000000' }}>
                Continued...
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── 7. Footer ─────────────────────────────────────────────── */}
      <Text style={styles.footer} fixed>
        {(company?.company_name || 'Demo Builder Merchant') +
          '   Company Registration Number ' +
          (company?.company_registration_number || '\u2014') +
          '   VAT Reg No. ' +
          (company?.vat_number || '\u2014')}
      </Text>
    </>
  )
}

export function DeliveryNoteDocument(props: DeliveryNotePdfProps) {
  const items = props.invoice.invoice_items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / DELIVERY_NOTE_ITEMS_PER_PAGE))
  // Returns the per-page Page elements WITHOUT a <Document> wrapper — the
  // caller (render-pdf.tsx) is responsible for wrapping the whole render
  // in a single <Document>. This mirrors the InvoicePdfPage pattern (it
  // also returns Page elements directly, not a Document).
  return Array.from({ length: totalPages }).map((_, pageIdx) => {
    const chunk = items.slice(pageIdx * DELIVERY_NOTE_ITEMS_PER_PAGE, (pageIdx + 1) * DELIVERY_NOTE_ITEMS_PER_PAGE)
    return (
      <Page key={`delivery-page-${pageIdx}`} size="A4" style={styles.page}>
        <DeliveryNotePdfPage
          {...props}
          pageChunk={chunk}
          isFirstPage={pageIdx === 0}
          isLastPage={pageIdx === totalPages - 1}
          pageNumber={pageIdx + 1}
        />
      </Page>
    )
  })
}