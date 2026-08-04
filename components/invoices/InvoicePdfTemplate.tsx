import { Fragment } from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Svg,
  Circle,
} from '@react-pdf/renderer'
import { formatTime } from '@/lib/utils'
import {
  type CompanyContactChannel,
  filterChannelsByContext,
} from '@/lib/company'
import {
  compactCompanyAddress,
  buildHeaderContactBlocks,
  paddedAddressLines,
} from '@/lib/invoices/pdf-helpers'

/**
 * Star Hawk invoice — Gill Aggregates-style layout (K8 system source).
 *
 * Layout (top to bottom):
 *   1. Header        Logo (left) + Head Office / address / Tel / Fax /
 *                    Email(s) / Website (right, right-aligned)
 *   2. Title row     3-column layout:
 *                      left:  "Invoice to:-" + client address (padded to 6 lines)
 *                      mid:   "Invoice Number" (above) + "Invoice" (centred vertically)
 *                      right: "Deliver to:-" + delivery address (padded to 6 lines)
 *                    Unfilled address lines render as blank space, NOT collapsed.
 *   3. Account table 2-row x 4-col with light-gray (#E5E5E5) header band.
 *                    Em-dash (—) for blank fields (your_contact, your_reference).
 *   4. Line items    5-col table: Quantity | Product | Price | Total | V
 *                    Single continuous box (top + bottom borders only,
 *                    NO internal row dividers).
 *                    Optional Advice Note header band on top.
 *                    Quantity / Price / Total / V use monospace (Consolas).
 *   5. Totals        ONE joined table inside the outer rectangle:
 *                      left:  VAT breakdown (Rate | Goods | VAT)
 *                      right: Totals (Total Goods / Total VAT / Invoice Total)
 *   6. Payment       Inline text: Payment Due + Bank Details + Account Number +
 *                    Sort Code (left). "All prices are in GB Pounds" right-aligned.
 *   7. Footer        Three centred lines anchored to the bottom of every
 *                    page:
 *                      line 1: company name + Company Reg + VAT Reg
 *                      line 2: risk warning + conditions-of-sale note
 *                      line 3: registered office address
 *                    Plus a "Continued..." stamp (bottom-right) on every
 *                    page that has a following page.
 */

const PAGE_PADDING = 28

/**
 * Max line items that fit comfortably on a single A4 page once the header
 * (logo + address + account table, ~200pt) — repeated on every page —
 * and the totals/payment block (~150pt) are accounted for. Items are
 * roughly 22pt each, so 10 leaves enough headroom for the totals table
 * to sit directly under the items block on the LAST page of a multi-page
 * invoice without overflowing onto a third sheet.
 *
 * Invoices with more than this many line items are rendered across
 * multiple PDF pages: every page shows the full header AND the items
 * table (header band + the page's chunk), and ONLY the LAST page
 * carries the totals + payment block. Multi-page invoices also keep
 * the watermark, status stamp and footer on every page.
 */
export const ITEMS_PER_PAGE = 12

/**
 * Fixed slot height (in points) for each item row. The items block is
 * static — every page renders exactly ITEMS_PER_PAGE rows of this height,
 * with unused slots left as blank lines. Keeps the table size consistent
 * across invoices with different item counts.
 */
const ITEM_SLOT_HEIGHT = 22

/**
 * Pseudo-random scatter of tiny white dots that sit on top of the
 * status stamp, simulating the ink-transfer imperfections of a real
 * rubber stamp pressed onto paper. The pattern is generated once
 * with a fixed seed so the same dots render on every page / every
 * export — never a different pattern between the email PDF, the
 * dashboard preview, and the public share.
 *
 * Coordinates are in a 100×50 viewBox; the overlay SVG stretches to
 * the stamp's actual size via `preserveAspectRatio="none"`. Dot
 * radii are 0.4–1.1pt to mimic the natural speckle of a worn stamp.
 */
const STAMP_INK_DOTS: { x: number; y: number; r: number }[] = (() => {
  const dots: { x: number; y: number; r: number }[] = []
  let seed = 0x6d2b79f5
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }
  for (let i = 0; i < 38; i++) {
    dots.push({
      x: rand() * 100,
      y: rand() * 50,
      r: 0.4 + rand() * 0.7,
    })
  }
  return dots
})()

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
    marginBottom: 22,
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
    lineHeight: 1.1,
  },
  headerContactGap: {
    height: 3,
  },
  headerContactRow: {
    fontSize: 9,
    marginBottom: 1,
    textAlign: 'left',
    fontFamily: 'Helvetica',
    lineHeight: 1.1,
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
  // marginTop: 18 (≈24px at 72dpi) matches the gap between the
  // "Invoice to / Deliver to" address block and this table in the HTML
  // preview (Tailwind `pb-6` = 24px on the address section). The previous
  // value of 8 was ~13px tighter, which made the address and the
  // Account/Operator table feel glued together on the PDF.
  accountTable: {
    borderWidth: 2.0,
    borderColor: '#E5E5E5',
    marginTop: 18,
    marginBottom: 4,
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
    paddingVertical: 4,
    paddingHorizontal: 2,
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'Courier-Bold',
    lineHeight: 1,
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
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 9,
    fontWeight: 'bold',
    fontFamily: 'Courier-Bold',
    lineHeight: 1,
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
    lineHeight: 1,
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
  // Sub-row that sits under an item row when there's a per-line discount.
  // Spans the same 5 columns but only the product column carries content,
  // showing "−£0.50/item × 10" or "−10%". Smaller font + lighter color so
  // the discount annotation reads as supplementary to the line, not a new
  // line item.
  itemsDiscountAnnotationRow: {
    flexDirection: 'row',
  },
  itemsDiscountAnnotationText: {
    width: '45%',
    paddingLeft: 4,
    paddingRight: 4,
    paddingBottom: 4,
    fontSize: 8,
    fontFamily: 'Helvetica-Oblique',
    color: '#6B7280',
    textAlign: 'left',
  },

  // Sub-row that carries the product code on the left + the per-line
  // discount annotation on the right. Two text children laid out via
  // flex so the discount right-aligns inside the 45% product cell.
  itemProductCodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemProductCode: {
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'left',
  },
  itemProductDiscountInline: {
    fontSize: 8,
    fontFamily: 'Helvetica-Oblique',
    color: '#6B7280',
    textAlign: 'right',
    paddingLeft: 8,
  },
  itemProductName: {
    fontSize: 9,
    fontFamily: 'Courier',
    textAlign: 'left',
    fontWeight: '500',
  },

  // ── Joined outer container (items + VAT/Totals + payment) ───────────
  // Sizing: container grows to fit its content (no fixed height). The items
  // block above the divider has natural height (header + rows with their own
  // padding), so when an invoice has few items the outer rectangle is short;
  // when it has many items the rectangle grows and the totals stay glued to
  // the bottom of the divider — no fixed-height gap, no overflow crop.
  joinedSection: {
    borderWidth: 2.0,
    borderColor: '#E5E5E5',
    marginBottom: 8,
    flexDirection: 'column',
  },
// Items block sits at the top of the joinedSection, naturally above the
  // divider. `position: relative` so the absolute-positioned logo watermark
  // anchors to THIS block (and not the page) on every page of a multi-page
  // invoice.
  joinedItemsBlock: {
    position: 'relative',
  },
  joinedDivider: {
    height: 8,
    backgroundColor: '#E5E5E5',
  },

  // ── Watermark (logo inside the items section, centred) ────────────────
  // Lives inside `joinedItemsBlock` (which is `position: relative`) so the
  // logo sits centred in the items area on every page. Opacity ~12% keeps
  // it visible but never noisy — it's a brand mark, not a stamp. Sized
  // to ~220pt so it reads as a background mark, not a header icon.
  watermarkWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 220,
    marginTop: -70, // half the watermark image height — visually centres it
    marginLeft: -110, // half the watermark image width — visually centres it
    opacity: 0.12,
  },
  watermarkImage: {
    width: '100%',
    objectFit: 'contain',
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
  // Three lines stacked top-to-bottom, anchored to the page bottom via
  // `position: absolute, bottom: 14`. Line 1 carries the company name +
  // company registration number + VAT reg number; line 2 is the legal
  // risk warning + conditions-of-sale note; line 3 is the registered
  // office address. Lines 2 and 3 use a smaller font so they fit cleanly
  // inside the bottom margin. `fixed` makes the footer repeat on every
  // page of a multi-page invoice.
  footer: {
    position: 'absolute',
    bottom: 14,
    left: PAGE_PADDING,
    right: PAGE_PADDING,
    textAlign: 'center',
    fontFamily: 'Helvetica',
    color: '#000000',
  },
  footerLineMain: {
    fontSize: 8,
    lineHeight: 1.1,
  },
  footerLineSmall: {
    fontSize: 6.5,
    marginTop: 0,
    lineHeight: 1.1,
  },

  // ── "Continued..." indicator (bottom-right, on pages that have a next page) ─
  // Renders only on pages that aren't the last page of a multi-page invoice.
  // Positioned just above the footer so it sits inside the items section's
  // bottom-right corner. The thin black border + white background form a
  // small rectangular badge that reads as a printed stamp.
  continuedIndicator: {
    position: 'absolute',
    bottom: 78,
    right: 36,
    border: '0.75pt solid #000000',
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
  },
  continuedText: {
    fontSize: 9,
    fontFamily: 'Courier',
    color: '#000000',
  },

  // ── Status stamp (PAID / PARTIALLY PAID / OVERDUE) ────────────────
  // Realistic rubber-stamp look: heavy coloured border, big bold label,
  // slight rotation (transform: rotate), operator + date line, and a
  // company-signature line at the bottom. Positioned bottom-right inside
  // the items area, mirroring the "Continued..." stamp location. Renders
  // on EVERY page via `fixed` so multi-page invoices stamp uniformly.
  stampWrap: {
    position: 'absolute',
    // Anchored to the bottom-right of the page so the stamp lands in
    // the totals/payment area — same spot a real rubber stamp would
    // be pressed onto the invoice after the totals were written.
    bottom: 80,
    right: 28,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 2.5,
    borderStyle: 'solid',
    transform: 'rotate(-7deg)',
    // No background — let the page show through so the stamp reads as
    // ink pressed onto paper, not a sticker pasted on top.
  },
  stampLabel: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  stampMeta: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    textAlign: 'center',
    marginTop: 6,
  },
  stampSignature: {
    fontSize: 7,
    fontFamily: 'Helvetica-Oblique',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  // Ink-imperfection overlay — covers the full stamp area so the SVG
  // scatter can paint on top of the text. Pointer-events disabled so
  // it never intercepts clicks if the stamp is ever wrapped in a link.
  stampInkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
})

export interface InvoicePdfProps {
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
    show_payment_terms?: boolean
    // New in 102 — render the company logo as a centred, low-opacity watermark
    // behind every other element on the page.
    show_watermark?: boolean | null
    // New in 103 — three independent status-stamp toggles (PAID /
    // PARTIALLY PAID / OVERDUE). The corresponding stamp is only drawn
    // when the flag is true AND the invoice status matches.
    show_paid_watermark?: boolean | null
    show_partially_paid_watermark?: boolean | null
    show_overdue_watermark?: boolean | null
    // Operator + timestamp that feed the PAID / OVERDUE stamp sub-text.
    paid_by?: string | null
    paid_at?: string | null
    overdue_at?: string | null
    // New in 104 — master on/off + Auto/Manual mode. status_stamps_enabled
    // defaults to true and gates the entire feature; when false, no stamp
    // renders regardless of the per-stamp toggles. status_stamps_mode is
    // 'auto' (default) or 'manual' — auto uses status + 30-day cool-down
    // for OVERDUE; manual requires each per-stamp toggle to be explicitly
    // flipped on.
    status_stamps_enabled?: boolean | null
    status_stamps_mode?: 'auto' | 'manual' | null
    // Status + updated_at drive the rubber-stamp overlay on PDF/preview pages.
    status?: string | null
    updated_at?: string | null
    subtotal: number
    vat_total: number
    total: number
    amount_paid: number
    balance_due: number
    share_token?: string | null
    public_share_key?: string | null
    public_share_enabled?: boolean
    public_share_requires_password?: boolean
    delivery_note_share_enabled?: boolean
    delivery_note_share_requires_password?: boolean
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
    // New in 101 — order-level discount. Either discount_amount or
    // discount_percent is set (DB CHECK enforces one-of). The PDF reads
    // these to render a "Discount −£X" row between Subtotal and VAT.
    discount_amount?: number | null
    discount_percent?: number | null
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
      // New in 101 — per-line discount values used to render the
      // "−£0.50 × 10" / "−10%" annotation under the line.
      discount_amount?: number | null
      discount_percent?: number | null
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

function formatInvoiceCurrency(amount: number | string | null | undefined): string {
  let value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0
  // Guard against NaN / Infinity from malformed data so the UI doesn't crash.
  if (!Number.isFinite(value)) value = 0
  return value.toFixed(2)
}

/**
 * Compute the order-level discount in pounds (negative for display). The
 * PDF sometimes has only the discounted subtotal + total, not the
 * subtotal_pre_discount — but discount_amount is on the payload, so we
 * can recompute the gap. When only discount_percent is set, the value
 * depends on what the subtotal_pre_discount was (which we don't have on
 * the snapshot), so we approximate: subtotal − subtotal × (1 − percent).
 */
function computeOrderDiscountPence(invoice: InvoicePdfProps['invoice']): number {
  if (invoice.discount_amount != null && invoice.discount_amount > 0) {
    return Math.round(invoice.discount_amount * 100)
  }
  if (invoice.discount_percent != null && invoice.discount_percent > 0) {
    // Best-effort recompute when only percent is stored. Same formula the
    // server uses: subtract the post-discount subtotal from what the
    // subtotal would have been.
    const subtotal = typeof invoice.subtotal === 'string' ? parseFloat(invoice.subtotal) : invoice.subtotal || 0
    const impliedPre = subtotal / (1 - invoice.discount_percent / 100)
    return Math.round((impliedPre - subtotal) * 100)
  }
  return 0
}

function formatOrderDiscountLabel(invoice: InvoicePdfProps['invoice']): string {
  if (invoice.discount_amount != null && invoice.discount_amount > 0) {
    return `−£${invoice.discount_amount.toFixed(2)}`
  }
  if (invoice.discount_percent != null && invoice.discount_percent > 0) {
    const v = invoice.discount_percent
    const pretty = Number.isInteger(v) ? v.toString() : v.toFixed(2).replace(/\.?0+$/, '')
    return `−${pretty}%`
  }
  return '—'
}

function formatItemPrice(price: number, unit?: string | null) {
  const p = formatInvoiceCurrency(price)
  return unit ? `${p} ${unit}` : p
}

function emDash(value: string | null | undefined): string {
  return value ? value : '\u2014'
}

// `paddedAddressLines` is imported from `@/lib/invoices/pdf-helpers` — the
// shared helper that InvoiceDocument (the HTML preview) also uses. The PDF
// used to carry its own copy that put every field on its own line, which
// produced a much taller, less-polished "Deliver to" block than the HTML
// preview. Sharing the helper keeps the two render paths in sync.

export function InvoicePdfPage({
  invoice,
  company,
  bankDetails,
  logoSrc,
  operatorName,
  // ── Multi-page chunk props ─────────────────────────────────────────
  // When rendering a multi-page invoice, the caller (InvoiceDocument or
  // render-pdf.tsx) pre-splits `invoice.invoice_items` into chunks and
  // tells each page which chunk it owns plus whether it is the first
  // (header) and/or last (totals + payment) page. Defaults assume a
  // single-page invoice so any legacy caller still renders correctly.
  pageChunk,
  isFirstPage = true,
  isLastPage = true,
  // 1-based page index and total page count, used to render the
  // "Page N" cell in the Account / Your Reference / Page row. The
  // header is identical on every page, so this is the ONLY thing that
  // visibly changes between pages of a multi-page invoice.
  pageNumber = 1,
}: InvoicePdfProps & {
  pageChunk?: InvoicePdfProps['invoice']['invoice_items']
  isFirstPage?: boolean
  isLastPage?: boolean
  pageNumber?: number
}) {
  const displayOperator =
    invoice.operator_name && invoice.operator_name !== 'Unknown Operator'
      ? invoice.operator_name
      : operatorName || invoice.operator_name || 'Unknown Operator'
  const isQuote = invoice.type === 'quotation'
  const docTypeLabel = isQuote ? 'Quotation' : 'Invoice'
  // Document VAT rate for the breakdown row — taken from the standard-rate
  // items the VAT total is computed on (there is no document-level rate).
  const vatRate = invoice.invoice_items?.find((item) => item.vat_rate > 0)?.vat_rate ?? 0
  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const clientName =
    client?.company_name || [client?.first_name, client?.last_name].filter(Boolean).join(' ') || ''
  const isCollection = invoice.delivery_method === 'collection'

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

  // The items to render on THIS page. Defaults to every item so single-page
  // callers (no chunk passed) behave exactly as before.
  const allItems = invoice.invoice_items ?? []
  const itemsForThisPage = pageChunk ?? allItems

  // ── Status stamp (PAID / PARTIALLY PAID / OVERDUE) ─────────────────
  // Returns the stamp descriptor to render (or null when no stamp
  // applies). The same descriptor is used on every page so a multi-page
  // invoice stamps uniformly.
  //
  // Logic, in order:
  //   1. Master switch (`status_stamps_enabled`): if false, no stamp ever.
  //   2. Mode:
  //        - 'auto'  → use the per-stamp toggles as opt-outs; the PAID +
  //          PARTIALLY PAID defaults are TRUE, and OVERDUE auto-activates
  //          30 days past the due date when the invoice is still unpaid
  //          (the "cool-down" period).
  //        - 'manual'→ stamp shows ONLY when the operator has flipped the
  //          corresponding per-stamp toggle to TRUE.
  //   3. Per-stamp toggle + status (or 30-day rule for OVERDUE in auto).
  const stamp = (() => {
    if (invoice.status_stamps_enabled === false) return null
    const mode = invoice.status_stamps_mode ?? 'auto'

    const formatStampDate = (iso?: string | null) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }
    // Auto mode: per-stamp toggles act as opt-outs (default true). Manual
    // mode: per-stamp toggles must be explicitly true.
    const isOn = (flag: boolean | null | undefined) =>
      mode === 'manual' ? flag === true : flag !== false

    if (invoice.status === 'paid' && isOn(invoice.show_paid_watermark)) {
      return {
        label: 'PAID',
        color: '#15803D', // green-700
        operator: invoice.paid_by || invoice.operator_name || '',
        date: formatStampDate(invoice.paid_at) || formatStampDate(invoice.issue_date),
      }
    }
    if (invoice.status === 'partial' && isOn(invoice.show_partially_paid_watermark)) {
      return {
        label: 'PARTIALLY PAID',
        color: '#C2410C', // orange-700
        operator: invoice.operator_name || '',
        date: formatStampDate(invoice.updated_at) || formatStampDate(invoice.issue_date),
      }
    }
    if (invoice.status === 'overdue' && isOn(invoice.show_overdue_watermark)) {
      return {
        label: 'OVERDUE',
        color: '#B91C1C', // red-700
        operator: invoice.operator_name || '',
        date: formatStampDate(invoice.overdue_at) || formatStampDate(invoice.issue_date),
      }
    }
    // Auto-mode cool-down: 30 days past the due date while still unpaid.
    // Only applies in auto mode (manual mode is operator-driven only).
    if (mode === 'auto' && isOn(invoice.show_overdue_watermark)) {
      const due = invoice.due_date
      if (due) {
        const dueDate = new Date(due)
        if (!isNaN(dueDate.getTime())) {
          const today = new Date()
          const msPerDay = 1000 * 60 * 60 * 24
          const daysPast = Math.floor((today.getTime() - dueDate.getTime()) / msPerDay)
          const balance = Number(invoice.balance_due ?? 0)
          if (daysPast >= 30 && balance > 0) {
            return {
              label: 'OVERDUE',
              color: '#B91C1C', // red-700
              operator: invoice.operator_name || '',
              date: formatStampDate(invoice.issue_date),
            }
          }
        }
      }
    }
    return null
  })()

  return (
    <>
      {/* ─── 1. Header (repeats on EVERY page of a multi-page invoice) ──
           The header (logo + head-office block + "Invoice" title + Invoice
           Number + Invoice/Deliver to addresses + Account/Operator table)
           is the only piece of structure that is identical across pages.
           The page number inside the Account table is the one value that
           changes; everything else stays the same. */}
      <Fragment>
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
            // Head office sits in the header row's natural flow. This lets
            // a tall block (extra phone / email / website lines) push the
            // title row and everything below it down instead of overlapping
            // the "Invoice Number" area.
            //
            // Width: right edge is flush with the page's right padding; the
            // block is capped at 50% of the header row so it never collides
            // with the logo + brand name on the left.
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
      <View style={{ flexDirection: 'row', width: '100%', alignItems: 'flex-start', marginBottom: 14 }}>
        <View style={{ flex: 1 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.invoiceTitle}>{docTypeLabel}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={styles.invoiceNumberLabel}>Invoice Number</Text>
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
          <Text style={[styles.accountCellBase, styles.accountCellLeft]}>
            {invoice.your_contact || client?.phone || '\u2014'}
          </Text>
          <Text style={[styles.accountCellBase, styles.accountCellWide]} />
          <Text style={[styles.accountCellBase, styles.accountCellRight]}>{emDash(invoice.your_reference)}</Text>
          <Text style={[styles.accountCellBase, styles.accountCellLast]}>{pageNumber}</Text>
        </View>
      </View>
      </Fragment>

      {/* ─── 4 + 5. Joined outer section (items + VAT/Totals + payment) ───── */}
      {/* ONE outer rectangle containing:
          • items table (top section, 5 cols, all Consolas)
          • horizontal divider line
          • VAT breakdown + Totals (bottom-left + bottom-right, joined)
          • payment info + All prices (still inside the outer rectangle) */}
      <View style={styles.joinedSection}>
        {/* Top block: items table — natural height, minHeight 30 for breathing
            room when the invoice has 0–1 items. */}
        <View style={styles.joinedItemsBlock}>
          {/* Logo watermark inside the items section. Positioned absolute
              (parent joinedItemsBlock is relative) so it centres on the
              items area, not the page. Hidden when the operator toggled
              show_watermark off, or when no logo source is available. */}
          {invoice.show_watermark && logoSrc ? (
            <View style={styles.watermarkWrap}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={logoSrc} style={styles.watermarkImage} />
            </View>
          ) : null}
          <View style={styles.itemsHeaderRow}>
            <Text style={[styles.itemsHeaderCell, { width: '12%' }]}>Quantity</Text>
            <Text style={[styles.itemsHeaderCell, { width: '45%' }]}>Product</Text>
            <Text style={[styles.itemsHeaderCell, { width: '24%', textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.itemsHeaderCell, { width: '14%', textAlign: 'right' }]}>Total (incl. VAT)</Text>
            <Text style={[styles.itemsHeaderCellLast, { width: '5%', textAlign: 'center' }]}>V</Text>
          </View>

          {/* Render exactly ITEMS_PER_PAGE slots per page so the table
              size stays consistent across invoices with different item
              counts. Each real item takes one slot; the remaining slots
              are blank lines (empty rows with the same fixed height).
              This gives the invoice a static, predictable items block.

              The slot count is tuned so the table fills more of the A4
              page while still leaving room for header, totals and footer
              on a single page. */}
          {Array.from({ length: ITEMS_PER_PAGE }).map((_, slotIdx) => {
            const item = itemsForThisPage[slotIdx]
            if (!item) {
              // Empty slot — same height as a real row, no content.
              return (
                <View
                  key={`empty-slot-${slotIdx}`}
                  style={[styles.itemsRow, { minHeight: ITEM_SLOT_HEIGHT }]}
                />
              )
            }
            // Per-row line total (quantity × unit price). Same value
            // the operator sees in the form when they add the row.
            const runningTotal = Number(item.line_total)
            // Per-line discount annotation: "−£0.50 × 10" for an amount,
            // "−10%" for a percent. Rendered inside the product cell so
            // it right-aligns next to the code.
            const hasAmount = item.discount_amount != null && item.discount_amount > 0
            const hasPercent = item.discount_percent != null && item.discount_percent > 0
            const discountLabel = hasAmount
              ? `−£${item.discount_amount!.toFixed(2)}/item × ${formatItemQuantity(item.quantity, '')}`
              : hasPercent
                ? `−${item.discount_percent!.toFixed(item.discount_percent! % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '')}%`
                : null
            return (
              <View key={`item-${slotIdx}`} style={[styles.itemsRow, { minHeight: ITEM_SLOT_HEIGHT }]}>
                <Text style={styles.itemQtyCell}>
                  {formatItemQuantity(item.quantity, item.unit)}
                </Text>
                {/* Product cell. We render the name on its own line and
                    the product code + discount annotation on a second
                    line so the discount can right-align inside the same
                    product cell, sitting next to the code (e.g. on the
                    right of "BLO-001"). */}
                <View style={styles.itemProductCell}>
                  <Text style={styles.itemProductName}>{item.product_name}</Text>
                  {item.product_code || discountLabel ? (
                    <View style={styles.itemProductCodeRow}>
                      <Text style={styles.itemProductCode}>{item.product_code ?? ''}</Text>
                      {discountLabel ? (
                        <Text style={styles.itemProductDiscountInline}>{discountLabel}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
                <Text style={styles.itemPriceCell}>
                  {formatItemPrice(item.price, item.unit)}
                </Text>
                <Text style={styles.itemTotalCell}>{formatInvoiceCurrency(runningTotal)}</Text>
                <Text style={styles.itemVatCell}>
                  {item.vat_rate > 0 ? 'S' : 'Z'}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Bottom block: always rendered (it's the lower half of the
            joinedSection container — the outer rectangle that wraps items
            + totals stays consistent across pages). On the LAST page the
            VAT / Totals / Payment block is fully populated. On every
            OTHER page the inner content is empty, and a small "Continued..."
            text sits in the bottom-right where the totals would normally
            land — no border, no separate badge, just a plain text note
            inside the empty container. */}
        <View>
          {/* Horizontal divider between items and bottom area (gray filled).
              Always shown so the visual separator is consistent on every
              page; on non-last pages it just sits above the empty area. */}
          <View style={styles.joinedDivider} />

          {isLastPage ? (
            <>
              {/* VAT breakdown (left) + Totals (right) — plain text, no borders */}
              <View style={{ flexDirection: 'row', padding: 4 }}>
            {/* Left: VAT breakdown. "Goods" shows the post-discount net
                because that's the figure VAT is actually computed on
                (per the INVOICE_DISCOUNTS_PLAN §3 rule: "VAT tracks the
                net"). To keep the math intuitive, the right side's
                "Total Goods" row shows the pre-discount goods (the bill
                before the discount), with a dedicated "Discount" row
                explaining the difference. */}
            <View style={{ width: '53%' }}>
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ width: '19%', fontSize: 9, fontFamily: 'Courier', textAlign: 'left', paddingVertical: 1, paddingHorizontal: 2 }} />
                <Text style={{ width: '26%', fontSize: 9, fontFamily: 'Courier', fontWeight: '500', textAlign: 'left', paddingVertical: 1, paddingHorizontal: 2 }}>Rate</Text>
                <Text style={{ width: '30%', fontSize: 9, fontFamily: 'Courier', fontWeight: '500', textAlign: 'left', paddingVertical: 1, paddingHorizontal: 2 }}>Goods</Text>
                <Text style={{ width: '25%', fontSize: 9, fontFamily: 'Courier', fontWeight: '500', textAlign: 'left', paddingVertical: 1, paddingHorizontal: 2 }}>VAT</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ width: '19%', fontSize: 9, fontFamily: 'Courier', textAlign: 'left', padding: 2 }}>S</Text>
                <Text style={{ width: '26%', fontSize: 9, fontFamily: 'Courier', textAlign: 'left', padding: 2 }}>{vatRate.toFixed(2)}</Text>
                <Text style={{ width: '30%', fontSize: 9, fontFamily: 'Courier', textAlign: 'left', padding: 2 }}>{formatInvoiceCurrency(invoice.subtotal)}</Text>
                <Text style={{ width: '25%', fontSize: 9, fontFamily: 'Courier', textAlign: 'left', padding: 2 }}>{formatInvoiceCurrency(invoice.vat_total)}</Text>
              </View>
            </View>

            {/* Right: Totals. Shows pre-discount Total Goods, optional
                Discount row (rendered only when an order-level discount
                is set), then Total VAT, then Invoice Total. */}
            <View style={{ width: '47%' }}>
              {invoice.discount_amount == null && invoice.discount_percent == null ? (
                <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                  <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Total Goods</Text>
                  <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>{formatInvoiceCurrency(invoice.subtotal)}</Text>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                    <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Total Goods</Text>
                    <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>{formatInvoiceCurrency((invoice.subtotal || 0) + computeOrderDiscountPence(invoice) / 100)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                    <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Discount</Text>
                    <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>{formatOrderDiscountLabel(invoice)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                    <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Net</Text>
                    <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>{formatInvoiceCurrency(invoice.subtotal)}</Text>
                  </View>
                </>
              )}
              <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Total VAT</Text>
                <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>{formatInvoiceCurrency(invoice.vat_total)}</Text>
              </View>
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ width: '65%', fontSize: 9, fontFamily: 'Courier', textAlign: 'right', padding: 2 }}>Invoice Total</Text>
                <Text style={{ width: '35%', fontSize: 9, fontFamily: 'Courier', fontWeight: '500', textAlign: 'right', padding: 2 }}>{formatInvoiceCurrency(invoice.total)}</Text>
              </View>
            </View>
          </View>

          {/* Payment info + All prices (inside the same outer rectangle) */}
          <View style={styles.paymentRow}>
            <View style={styles.paymentLeft}>
              {invoice.show_payment_terms ? (
                <Text style={styles.paymentLine}>Payment Due: 30 days from date of invoice</Text>
              ) : null}
              {bankDetails?.bank_name ? (
                <Text style={styles.paymentLine}>Bank Details: {bankDetails.bank_name}</Text>
              ) : null}
              <Text style={styles.paymentLine}>
                Account Number: {bankDetails?.account_number || '\u2014'}
                {'     '}
                Sort Code: {bankDetails?.sort_code || '\u2014'}
              </Text>
            </View>
            <Text style={styles.paymentLineRight}>All prices are in GB Pounds</Text>
          </View>
            </>
          ) : (
            // Non-last page: empty bottom area with a single "Continued..."
            // text floating in the bottom-right corner (no border, no
            // separate badge). The text sits where the Invoice Total row
            // would land on the last page so the visual rhythm carries
            // through the pagination.
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                alignItems: 'flex-end',
                padding: 8,
                minHeight: 70,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontFamily: 'Courier',
                  color: '#000000',
                }}
              >
                Continued...
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ─── Status stamp (PAID / PARTIALLY PAID / OVERDUE) ─────────── */}
      {/* Bottom-right rubber stamp. Renders on every page (fixed) when
          the relevant toggle is on and the invoice status matches.
          Slightly rotated, thick coloured border, with operator + date
          + signature sub-text so each stamp is auditable. */}
      {stamp ? (
        <View
          style={[styles.stampWrap, { borderColor: stamp.color }]}
          fixed
        >
          <Text style={[styles.stampLabel, { color: stamp.color }]}>
            {stamp.label}
          </Text>
          {stamp.operator ? (
            <Text style={[styles.stampMeta, { color: stamp.color }]}>
              By {stamp.operator}{stamp.date ? ` · ${stamp.date}` : ''}
            </Text>
          ) : null}
          <Text style={[styles.stampSignature, { color: stamp.color }]}>
            {company?.company_name || 'Star Hawk Builders Merchant Ltd.'}
          </Text>
          {/* Ink-imperfection overlay. ~30 small white dots scattered
              across the stamp at deterministic pseudo-random positions
              (seeded so the pattern is consistent across renders).
              Sits ABOVE the text so the dots look like the stamp ink
              didn't fully transfer — same visual as a real rubber
              stamp pressed onto textured paper. */}
          <Svg
            style={styles.stampInkOverlay}
            viewBox="0 0 100 50"
            preserveAspectRatio="none"
          >
            {STAMP_INK_DOTS.map((dot, i) => (
              <Circle key={`dot-${i}`} cx={dot.x} cy={dot.y} r={dot.r} fill="#ffffff" />
            ))}
          </Svg>
        </View>
      ) : null}

      {/* ─── 7. Footer (appears on every page when multi-page) ─────── */}
      {/* Three stacked lines: company + reg + VAT (top, larger font),
          legal risk warning + conditions of sale (middle), and the
          registered office address (bottom). All three are anchored to
          the page bottom via `position: absolute` and `fixed` so they
          appear on every page of a multi-page invoice. */}
      <View style={styles.footer} fixed>
        <Text style={styles.footerLineMain}>
          {(company?.company_name || 'Star Hawk Builders Merchant Ltd.') +
            '   Company Registration Number ' +
            (company?.company_registration_number || '\u2014') +
            '   VAT Reg No. ' +
            (company?.vat_number || '\u2014')}
        </Text>
        <Text style={styles.footerLineSmall}>
          Customers ordering vehicles off the public highway do so at their own risk.{'   '}
          Conditions of sale available on request.
        </Text>
        <Text style={styles.footerLineSmall}>
          Registered Office: {(() => {
            const [l1, l2] = compactCompanyAddress(
              company?.address_line_1,
              company?.address_line_2,
              company?.town,
              company?.county,
              company?.postcode
            )
            const parts = [
              company?.company_name || 'Star Hawk Builders Merchant Ltd.',
              l1,
              l2,
            ].filter(Boolean)
            return parts.join(', ')
          })()}
        </Text>
      </View>
    </>
  )
}

export function InvoiceDocument(props: InvoicePdfProps) {
  const items = props.invoice.invoice_items ?? []
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
  return (
    <Document>
      {Array.from({ length: totalPages }).map((_, pageIdx) => {
        const chunk = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE)
        return (
          <Page key={`inv-page-${pageIdx}`} size="A4" style={styles.page}>
            <InvoicePdfPage
              {...props}
              pageChunk={chunk}
              isFirstPage={pageIdx === 0}
              isLastPage={pageIdx === totalPages - 1}
              pageNumber={pageIdx + 1}
            />
          </Page>
        )
      })}
    </Document>
  )
}