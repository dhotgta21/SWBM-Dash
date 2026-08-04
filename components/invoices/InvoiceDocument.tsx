'use client'

import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { Fragment } from 'react'
import { filterChannelsByContext, telHref, mailtoHref } from '@/lib/company'
import {
  compactCompanyAddress,
  buildHeaderContactBlocks,
  paddedAddressLines,
} from '@/lib/invoices/pdf-helpers'

const LOGO_SRC = '/Logo.webp'

/**
 * Max line items rendered per "page" when the invoice is split across
 * multiple articles for the on-screen preview. Each article mirrors one
 * PDF page: the FIRST article carries the full invoice header
 * (logo + address + account table), and the LAST article carries the
 * totals + payment block. Earlier articles leave the totals area blank
 * and the final article picks them up where the items end.
 *
 * Must stay in sync with ITEMS_PER_PAGE in InvoicePdfTemplate.tsx.
 */
const ITEMS_PER_PAGE = 12

interface InvoiceDocumentProps {
  invoice: InvoicePdfProps['invoice']
  company?: InvoicePdfProps['company']
  bankDetails?: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  className?: string
  operatorName?: string
}

function getClientDisplay(invoice: InvoicePdfProps['invoice']): {
  primary: string
  secondary?: string
  phone?: string | null
} {
  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
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

// `paddedAddressLines` is imported from `@/lib/invoices/pdf-helpers` — the
// shared helper the PDF template also uses (as of the "HTML is the master
// template" change). Keeping a single source of truth for address
// formatting stops the HTML preview and the PDF download from drifting
// apart when one of them gets tweaked.

function formatDateUK(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function formatTime12h(time: string | null | undefined): string {
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

function formatQty(quantity: number | string, unit?: string | null): string {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return unit ? `0 ${unit}` : '0'
  let fixed: string
  if (n % 1 === 0) fixed = n.toFixed(0)
  else if (Math.abs(n) < 0.005) fixed = '0'
  else fixed = n.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${fixed} ${unit}` : fixed
}

function formatInvoiceCurrency(amount: number | string | null | undefined): string {
  let value = typeof amount === 'string' ? parseFloat(amount) : amount ?? 0
  // Guard against NaN / Infinity from malformed data so the UI doesn't crash.
  if (!Number.isFinite(value)) value = 0
  return value.toFixed(2)
}

// Mirrors the same helpers on the PDF template — both render paths share
// the on-disk invoice shape so the helper logic must agree.
function computeOrderDiscountPounds(invoice: InvoicePdfProps['invoice']): number {
  if (invoice.discount_amount != null && invoice.discount_amount > 0) {
    return invoice.discount_amount
  }
  if (invoice.discount_percent != null && invoice.discount_percent > 0) {
    const subtotal = typeof invoice.subtotal === 'string' ? parseFloat(invoice.subtotal) : invoice.subtotal || 0
    const impliedPre = subtotal / (1 - invoice.discount_percent / 100)
    return impliedPre - subtotal
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

const EM_DASH = '\u2014'

export function InvoiceDocument({ invoice, company, bankDetails, logoSrc, className, operatorName }: InvoiceDocumentProps) {
  const displayOperator =
    invoice.operator_name && invoice.operator_name !== 'Unknown Operator'
      ? invoice.operator_name
      : operatorName || invoice.operator_name || 'Unknown Operator'
  const isQuote = invoice.type === 'quotation'
  const docTypeLabel = isQuote ? 'Quotation' : 'Invoice'
  // Document VAT rate for the breakdown row — taken from the standard-rate
  // items the VAT total is computed on (there is no document-level rate).
  const vatRate = invoice.invoice_items?.find((item) => item.vat_rate > 0)?.vat_rate ?? 0
  // (Replaced in 103 by the configurable status-stamp overlay — see the
// `stamp` computed below — which covers PAID / PARTIALLY PAID / OVERDUE.)

  const client = getClientDisplay(invoice)

  // ── Status stamp (PAID / PARTIALLY PAID / OVERDUE) ─────────────────
  // Same logic as the PDF: master switch first, then mode (auto uses
  // per-stamp toggles as opt-outs + 30-day cool-down for OVERDUE;
  // manual requires explicit toggles). Same descriptor on every page so
  // multi-page invoices stamp uniformly.
  const stamp = (() => {
    if (invoice.status_stamps_enabled === false) return null
    const mode = invoice.status_stamps_mode ?? 'auto'

    const formatStampDate = (iso?: string | null) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }
    const isOn = (flag: boolean | null | undefined) =>
      mode === 'manual' ? flag === true : flag !== false

    if (invoice.status === 'paid' && isOn(invoice.show_paid_watermark)) {
      return {
        label: 'PAID',
        color: '#15803D',
        operator: invoice.paid_by || invoice.operator_name || '',
        date: formatStampDate(invoice.paid_at) || formatStampDate(invoice.issue_date),
      }
    }
    if (invoice.status === 'partial' && isOn(invoice.show_partially_paid_watermark)) {
      return {
        label: 'PARTIALLY PAID',
        color: '#C2410C',
        operator: invoice.operator_name || '',
        date: formatStampDate(invoice.updated_at) || formatStampDate(invoice.issue_date),
      }
    }
    if (invoice.status === 'overdue' && isOn(invoice.show_overdue_watermark)) {
      return {
        label: 'OVERDUE',
        color: '#B91C1C',
        operator: invoice.operator_name || '',
        date: formatStampDate(invoice.overdue_at) || formatStampDate(invoice.issue_date),
      }
    }
    // Auto-mode cool-down: 30 days past the due date while still unpaid.
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
              color: '#B91C1C',
              operator: invoice.operator_name || '',
              date: formatStampDate(invoice.issue_date),
            }
          }
        }
      }
    }
    return null
  })()

  // Always pad to 6 lines so left/right address columns share the same height
  // even when one side is partially filled.
  const invoiceToLines = paddedAddressLines(
    client.primary,
    (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients)?.address_line_1,
    (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients)?.address_line_2,
    (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients)?.town,
    (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients)?.county,
    (Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients)?.postcode,
  )
  const deliverToLines = paddedAddressLines(
    client.primary,
    invoice.delivery_address_line_1,
    invoice.delivery_address_line_2,
    invoice.delivery_town,
    invoice.delivery_county,
    invoice.delivery_postcode,
  )

  const companyName = company?.company_name || 'Star Hawk Builders Merchant'

  // Header contact info
  const invoicePhones = filterChannelsByContext(company?.phones ?? [], 'invoice')
  const invoiceEmails = filterChannelsByContext(company?.emails ?? [], 'invoice')
  // 2-column contact block: phones first (2 per row, up to 4 numbers),
  // then emails below (2 per row, up to 4 emails). This groups each
  // contact type in its own 2×2 block instead of alternating phone/email
  // on every row.
  const contactRows = buildHeaderContactBlocks(invoicePhones, invoiceEmails)
  const telValue =
    invoicePhones.length > 0
      ? invoicePhones.map((p) => p.value).join(' / ')
      : company?.phone || ''
  const primaryEmail =
    invoiceEmails.find((e) => e.isPrimary)?.value ||
    invoiceEmails[0]?.value ||
    company?.email ||
    ''
  const extraEmails = invoiceEmails
    .filter((e) => e.value && e.value !== primaryEmail)
    .map((e) => e.value)
    .slice(0, 3)
  const primaryTelLink =
    invoicePhones[0]?.value
      ? telHref(invoicePhones[0].value)
      : company?.phone
        ? telHref(company.phone)
        : null
  // Whether anything in the contact block is actually worth showing
  // (skip the whole block when both arrays are empty — the head-office
  // block falls back to a single Tel: / Email: line via the legacy values).
  const gridHasContent = contactRows.length > 0

  // ── Multi-page chunking ─────────────────────────────────────────────
  // Items are split into ITEMS_PER_PAGE-sized chunks. The FIRST article
  // renders the full invoice header; the LAST renders the totals + payment
  // block; every article renders its slice of items. Earlier articles
  // get `page-break-after: always` so a printed run lands each on its own
  // sheet. Single-item invoices collapse to one article as before.
  const allItems = invoice.invoice_items ?? []
  const totalPages = Math.max(1, Math.ceil(allItems.length / ITEMS_PER_PAGE))
  const pageChunks = Array.from({ length: totalPages }, (_, i) =>
    allItems.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE)
  )

  return (
    <>
      {pageChunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === totalPages - 1
        // 1-based page index — used in the "Page" cell of the Account /
        // Your Reference / Page row. The header is otherwise identical
        // across pages, so this is the only thing that visibly changes.
        const pageNumber = pageIdx + 1
        return (
      <article
        key={`inv-page-${pageIdx}`}
        className={`bg-white text-gray-900 shadow-sm border border-gray-200 flex flex-col relative ${className ?? ''}`}
        style={{
          width: '794px',
          minHeight: '1123px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          // `position: relative` so the absolute-positioned watermark + the
          // "Continued..." stamp anchor to THIS article, not the viewport
          // (which would mis-position them when multiple articles stack
          // vertically for a multi-page preview).
          position: 'relative',
          // Force a hard page break between articles when printing so each
          // chunk lands on its own sheet. The last article omits the rule
          // so we don't insert a trailing blank page.
          pageBreakAfter: isLastPage ? 'auto' : 'always',
          breakAfter: isLastPage ? 'auto' : 'page',
        }}
      >
      {/* ─── 1. Header (repeats on EVERY page of a multi-page invoice) ─────
           The header (logo + head-office block + "Invoice" title + Invoice
           Number + Invoice/Deliver to addresses + Account/Operator table)
           is the only piece of structure that is identical across pages.
           The page number inside the Account table is the one value that
           changes; everything else stays the same. */}
      <Fragment>
      <header className="px-8 pt-8 pb-7 relative">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3 select-none">
            {logoSrc || LOGO_SRC ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc || LOGO_SRC} alt={`${companyName} logo`} className="h-20 w-auto object-contain" />
            ) : (
              <div
                className="h-20 w-[60px] bg-[#C8202C] text-white flex items-center justify-center font-bold text-sm"
                style={{ borderRadius: '3px' }}
              >
                SH
              </div>
            )}
            <div aria-hidden className="h-20 w-px bg-gray-300" />
            <div className="flex flex-col leading-none justify-center">
              <span
                className="text-[24px] font-bold text-[#0F172A] mb-1"
                style={{ letterSpacing: '0.8px', fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                STAR HAWK
              </span>
              <span
                className="text-[13px] font-bold text-[#475569]"
                style={{ letterSpacing: '1.2px', fontFamily: 'Arial, Helvetica, sans-serif' }}
              >
                BUILDERS MERCHANT LTD.
              </span>
            </div>
          </div>
          {(() => {
            const [addr1, addr2] = compactCompanyAddress(
              company?.address_line_1,
              company?.address_line_2,
              company?.town,
              company?.county,
              company?.postcode
            )
            return (
              // Head office sits in the header row's natural flow so a
              // tall block (extra phone / email / website lines) pushes
              // the title row and everything below it down instead of
              // overlapping the "Invoice Number" area.
              //
              // Width: capped at 400px so the left edge stays just clear
              // of the logo + brand name block while the right edge stays
              // close to the "Invoice Number" column.
              <div
                className="text-[11px] text-gray-900 text-left leading-[1.1] max-w-[400px]"
              >
                <p className="font-bold mb-0.5">Head Office</p>
                {addr1 ? <p>{addr1}</p> : null}
                {addr2 ? <p>{addr2}</p> : null}
                <div className="h-0.5" />
                {gridHasContent ? (
                  // 2-column contact block: all phones first, then all
                  // emails. Each row contains up to 2 entries of the same
                  // type so the layout forms a 2×2 phone block above a 2×2
                  // email block. `break-words` lets long values wrap inside
                  // their cell without pushing the other column wider.
                  <div className="grid grid-cols-2 gap-x-3">
                    {contactRows.map((row, i) => (
                      <Fragment key={`contact-row-${i}`}>
                        {row.map((cell, j) => (
                          <div key={`contact-cell-${i}-${j}`} className="min-w-0 break-words">
                            {cell.channel ? (
                              <p>
                                <span className="font-bold">
                                  {cell.type === 'phone' ? 'Tel: ' : 'Email: '}
                                </span>
                                {cell.type === 'phone' ? (
                                  <a
                                    href={telHref(cell.channel.value)}
                                    className="text-gray-900 hover:underline"
                                    title={cell.channel.label ?? undefined}
                                  >
                                    {cell.channel.value}
                                  </a>
                                ) : (
                                  <a
                                    href={mailtoHref(cell.channel.value)}
                                    className="text-gray-900 hover:underline"
                                    title={cell.channel.label ?? undefined}
                                  >
                                    {cell.channel.value}
                                  </a>
                                )}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <>
                    {telValue ? (
                      <p>
                        <span className="font-bold">Tel: </span>
                        {primaryTelLink ? (
                          <a href={primaryTelLink} className="text-gray-900 hover:underline">{telValue}</a>
                        ) : (
                          telValue
                        )}
                      </p>
                    ) : null}
                    {primaryEmail ? (
                      <p>
                        <span className="font-bold">Email: </span>
                        <a href={mailtoHref(primaryEmail)} className="text-gray-900 hover:underline">{primaryEmail}</a>
                        {extraEmails.length > 0 ? (
                          <>, {extraEmails.join(', ')}</>
                        ) : null}
                      </p>
                    ) : null}
                  </>
                )}
                {company?.fax ? (
                  <p>
                    <span className="font-bold">Fax: </span>
                    {company.fax}
                  </p>
                ) : null}
                {company?.website ? <p>{company.website}</p> : null}
              </div>
            )
          })()}
        </div>
      </header>

      {/* ─── 2. Title row (centered title + right-aligned number) ───── */}
      <section className="px-8 pb-2">
        <div className="grid grid-cols-3 items-start">
          <div />
          <div className="text-center">
            <h1
              className="font-bold"
              style={{ fontSize: '24px', fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              {docTypeLabel}
            </h1>
          </div>
          <div className="text-right">
            <p
              className="font-bold"
              style={{ fontSize: '16px', fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              Invoice Number
            </p>
            <p
              className="font-bold"
              style={{ fontSize: '16px', fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              {invoice.document_number}
            </p>
          </div>
        </div>
      </section>

      {/* ─── 3. Address blocks (2-column layout) ───────────────────── */}
      {/* pb-6 (24px) gives the "Invoice to / Deliver to" block enough
          breathing room above the Account / Our Operator table below.
          The previous pb-2 (8px) had the two sections feeling glued
          together — too tight for a polished invoice. */}
      <section className="px-8 pb-6">
        <div className="flex justify-between">
          <div className="w-[240px] pl-16">
            <p className="text-[12px] font-bold mb-1">Invoice to:-</p>
            {invoiceToLines.map((line, i) => (
              <p key={`invoice-to-${i}`} className="text-[12px] leading-tight min-h-[14px]">
                {line || '\u00a0'}
              </p>
            ))}
          </div>
          <div className="w-[240px]">
            <p className="text-[12px] font-bold mb-1">Deliver to:-</p>
            {deliverToLines.map((line, i) => (
              <p key={`deliver-to-${i}`} className="text-[12px] leading-tight min-h-[14px]">
                {line || '\u00a0'}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 4. Account table (2 rows × 4 cols) ────────────────────── */}
      <section className="px-8 pb-3">
        <div
          className="text-[12px]"
          style={{ border: '2px solid #E5E5E5', fontFamily: "'Courier New', Courier, monospace" }}
        >
          <div
            className="grid grid-cols-[15%_45%_25%_15%] font-bold"
            style={{ backgroundColor: '#E5E5E5', borderBottom: '0.75px solid #E5E5E5' }}
          >
            <div className="py-1 px-1 flex items-center">Account</div>
            <div className="py-1 px-1 flex items-center">Our Operator</div>
            <div className="py-1 px-1 flex items-center text-right">Taxpoint Date Time</div>
            <div className="py-1 px-1 flex items-center text-right">Order Number</div>
          </div>
          <div
            className="grid grid-cols-[15%_45%_25%_15%] font-medium"
            style={{ borderBottom: '0.75px solid #E5E5E5' }}
          >
            <div className="py-1 px-1">{invoice.account_number || EM_DASH}</div>
            <div className="py-1 px-1">{displayOperator}</div>
            <div className="py-1 px-1 text-right">
              {[formatDateUK(invoice.issue_date), formatTime12h(invoice.issue_time)].filter(Boolean).join(' ')}
            </div>
            <div className="py-1 px-1 text-right">{invoice.order_number || EM_DASH}</div>
          </div>
          <div
            className="grid grid-cols-[15%_45%_25%_15%] font-bold"
            style={{ backgroundColor: '#E5E5E5', borderBottom: '0.75px solid #E5E5E5' }}
          >
            <div className="py-1 px-1 flex items-center">Your Contact</div>
            <div className="py-1 px-1 flex items-center" />
            <div className="py-1 px-1 flex items-center text-right">Your Reference</div>
            <div className="py-1 px-1 flex items-center text-right">Page</div>
          </div>
          <div className="grid grid-cols-[15%_45%_25%_15%] font-medium">
            <div className="py-1 px-1">
              {(invoice as { your_contact?: string }).your_contact || client.phone || EM_DASH}
            </div>
            <div className="py-1 px-1" />
            <div className="py-1 px-1 text-right">{invoice.your_reference || EM_DASH}</div>
            <div className="py-1 px-1 text-right">{pageNumber}</div>
          </div>
        </div>
      </section>
      </Fragment>

      {/* ─── 5 + 6. Joined outer section (items + VAT/Totals + payment) ───── */}
      <section className="px-8 pb-3">
        <div
          className="text-[12px] flex flex-col"
          style={{
            border: '2px solid #E5E5E5',
            fontFamily: "'Courier New', Courier, monospace",
          }}
        >
          {/* Top block: items table — `position: relative` anchors the
              logo watermark to this items area (not the page). */}
          <div style={{ position: 'relative' }}>
            {/* Logo watermark inside the items section. Sits behind the
                items table (z-index:0) and centres on the items area
                regardless of how many items are on the page. ~12% opacity
                keeps it visible as a brand mark without being noisy. */}
            {invoice.show_watermark && (logoSrc || LOGO_SRC) ? (
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: '220px',
                  transform: 'translate(-50%, -50%)',
                  opacity: 0.12,
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoSrc || LOGO_SRC}
                  alt=""
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
            ) : null}
            <div className="grid grid-cols-[12%_45%_24%_14%_5%] font-bold" style={{ backgroundColor: '#E5E5E5' }}>
              <div className="py-0.5 px-1">Quantity</div>
              <div className="py-0.5 px-1">Product</div>
              <div className="py-0.5 px-1 text-right">Price</div>
              <div className="py-0.5 px-1 text-right">Total (incl. VAT)</div>
              <div className="py-0.5 px-1 text-center">V</div>
            </div>
            {/* Always render at least ITEMS_PER_PAGE slots per page so the
                products table has a FIXED height regardless of how many
                line items the invoice actually has. Unused slots are
                blank rows (same minHeight as a real row) so a 4-item
                invoice still shows a 14-slot table, just with 10 empty
                rows at the bottom. This gives the invoice a static,
                predictable items block — the operator gets a consistent
                layout whether they're sending a 1-line or a 30-line
                invoice.

                Previous behaviour only padded multi-page invoices (and
                only on the last page), which made single-page invoices
                with few items render a short table that pushed the
                totals block up. The header + 14 padded slots + totals +
                footer comfortably fit on one A4 page (see the article's
                minHeight: 1123px), so padding is safe. */}
            {Array.from({
              length: Math.max(chunk.length, ITEMS_PER_PAGE),
            }).map((_, slotIdx) => {
              const item = chunk[slotIdx]
              if (!item) {
                return (
                  <div
                    key={`empty-slot-${slotIdx}`}
                    className="grid grid-cols-[12%_45%_24%_14%_5%] min-h-[20px]"
                    aria-hidden
                  />
                )
              }
              // Per-row line total (quantity × unit price). Same value
              // the operator sees in the form when they add the row.
              const runningTotal = Number(item.line_total)
              const hasAmount = item.discount_amount != null && item.discount_amount > 0
              const hasPercent = item.discount_percent != null && item.discount_percent > 0
              const discountLabel = hasAmount
                ? `−£${item.discount_amount!.toFixed(2)}/item × ${formatQty(item.quantity, '')}`
                : hasPercent
                  ? `−${item.discount_percent!.toFixed(item.discount_percent! % 1 === 0 ? 0 : 2).replace(/\.?0+$/, '')}%`
                  : null
              return (
                <div key={`item-${slotIdx}`} className="grid grid-cols-[12%_45%_24%_14%_5%] min-h-[20px]">
                  <div className="p-1 text-right tabular-nums">
                    {formatQty(item.quantity, item.unit)}
                  </div>
                  {/* Product cell. Name on its own line; the next line
                      carries the code on the left and the discount
                      annotation on the right (right-aligned, sits
                      inside the product cell). */}
                  <div className="p-1">
                    <div>{item.product_name}</div>
                    {(item.product_code || discountLabel) && (
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="whitespace-pre-line">{item.product_code ?? ''}</span>
                        {discountLabel ? (
                          <span className="text-[11px] text-gray-500 italic">{discountLabel}</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="p-1 text-right tabular-nums">
                    {item.unit ? `${formatInvoiceCurrency(item.price)} ${item.unit}` : formatInvoiceCurrency(item.price)}
                  </div>
                  <div className="p-1 text-right tabular-nums">
                    {formatInvoiceCurrency(runningTotal)}
                  </div>
                  <div className="p-1 text-center">{item.vat_rate > 0 ? 'S' : 'Z'}</div>
                </div>
              )
            })}
          </div>

          {/* Bottom block: always rendered (it's the lower half of the
              joinedSection container — the outer rectangle that wraps
              items + totals stays consistent across pages). On the LAST
              page the VAT / Totals / Payment block is fully populated. On
              every OTHER page the inner content is empty, and a small
              "Continued..." text sits in the bottom-right where the
              totals would normally land — no border, no separate badge,
              just a plain text note inside the empty container. */}
          <div>
            {/* Horizontal divider between items and VAT/Totals (gray filled band).
                Always shown so the visual separator is consistent on every
                page; on non-last pages it just sits above the empty area. */}
            <div style={{ height: '8px', backgroundColor: '#E5E5E5' }} />

            {isLastPage ? (
              <>
                {/* Bottom section: VAT breakdown (left) + Totals (right) */}
                <div className="flex p-1">
              {/* Left: VAT breakdown */}
              <div style={{ width: '53%' }}>
                <div className="grid grid-cols-[19%_26%_30%_25%] mb-0.5">
                  <div />
                  <div className="py-0.5 px-1 text-left">Rate</div>
                  <div className="py-0.5 px-1 text-left">Goods</div>
                  <div className="py-0.5 px-1 text-left">VAT</div>
                </div>
                <div className="grid grid-cols-[19%_26%_30%_25%]">
                  <div className="p-1 text-left">S</div>
                  <div className="p-1 text-left">{vatRate.toFixed(2)}</div>
                  <div className="p-1 text-left tabular-nums">{formatInvoiceCurrency(invoice.subtotal)}</div>
                  <div className="p-1 text-left tabular-nums">{formatInvoiceCurrency(invoice.vat_total)}</div>
                </div>
              </div>

              {/* Right: Totals. Pre-discount Total Goods, optional Discount
                  row, then Net (post-discount), Total VAT, Invoice Total. */}
              <div style={{ width: '47%' }}>
                {invoice.discount_amount == null && invoice.discount_percent == null ? (
                  <div className="grid grid-cols-[65%_35%] mb-0.5">
                    <div className="p-1 text-right">Total Goods</div>
                    <div className="p-1 text-right tabular-nums">{formatInvoiceCurrency(invoice.subtotal)}</div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[65%_35%] mb-0.5">
                      <div className="p-1 text-right">Total Goods</div>
                      <div className="p-1 text-right tabular-nums">{formatInvoiceCurrency((invoice.subtotal || 0) + computeOrderDiscountPounds(invoice))}</div>
                    </div>
                    <div className="grid grid-cols-[65%_35%] mb-0.5">
                      <div className="p-1 text-right">Discount</div>
                      <div className="p-1 text-right tabular-nums">{formatOrderDiscountLabel(invoice)}</div>
                    </div>
                    <div className="grid grid-cols-[65%_35%] mb-0.5">
                      <div className="p-1 text-right">Net</div>
                      <div className="p-1 text-right tabular-nums">{formatInvoiceCurrency(invoice.subtotal)}</div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-[65%_35%] mb-0.5">
                  <div className="p-1 text-right">Total VAT</div>
                  <div className="p-1 text-right tabular-nums">{formatInvoiceCurrency(invoice.vat_total)}</div>
                </div>
                <div className="grid grid-cols-[65%_35%]">
                  <div className="p-1 text-right">Invoice Total</div>
                  <div className="p-1 text-right tabular-nums font-bold">{formatInvoiceCurrency(invoice.total)}</div>
                </div>
              </div>
            </div>

            {/* Payment info + All prices (still inside outer rect) */}
            <div className="flex items-end justify-between gap-4 p-1">
              <div className="flex-1">
                <p>Payment Due: 30 days from date of invoice</p>
                {bankDetails?.bank_name ? <p>Bank Details: {bankDetails.bank_name}</p> : null}
                <p>
                  Account Number: {bankDetails?.account_number || EM_DASH}
                  {'     '}
                  Sort Code: {bankDetails?.sort_code || EM_DASH}
                </p>
              </div>
              <p className="text-[11px]">All prices are in GB Pounds</p>
            </div>

            {Number(invoice.amount_paid) > 0 && !isQuote && (
              <div className="mx-auto mt-2 w-[28%] font-mono" style={{ border: '0.75px solid #E5E5E5' }}>
                <div
                  className="flex items-center justify-between p-1"
                  style={{ borderBottom: '0.75px solid #E5E5E5' }}
                >
                  <span className="flex-1">Amount Paid</span>
                  <span className="w-[45%] text-right tabular-nums">{formatInvoiceCurrency(invoice.amount_paid)}</span>
                </div>
                <div className="flex items-center justify-between p-1">
                  <span className="flex-1">Balance Due</span>
                  <span className="w-[45%] text-right tabular-nums font-bold">
                    {formatInvoiceCurrency(invoice.balance_due)}
                  </span>
                </div>
              </div>
            )}
              </>
            ) : (
              // Non-last page: empty bottom area with a single "Continued..."
              // text floating in the bottom-right corner (no border, no
              // separate badge). The text sits where the Invoice Total row
              // would land on the last page so the visual rhythm carries
              // through the pagination.
              <div
                className="flex justify-end items-end p-2"
                style={{ minHeight: '70px' }}
              >
                <span style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: '11px' }}>
                  Continued...
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Status stamp (PAID / PARTIALLY PAID / OVERDUE) ─────────── */}
      {/* Bottom-right rubber-stamp overlay. Renders on every page when
          the relevant toggle is on and the invoice status matches.
          Slightly rotated, thick coloured border, with operator + date
          + company signature sub-text. CSS `filter` gives the printed
          output a subtle "rubber stamp on paper" feel without an asset. */}
      {stamp ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: '28px',
            // Anchored to the bottom-right of the page so the stamp
            // lands in the totals/payment area — same spot a real
            // rubber stamp would be pressed onto the invoice after the
            // totals were written.
            bottom: '80px',
            padding: '10px 14px',
            border: `2.5px solid ${stamp.color}`,
            // No background — let the page show through so the stamp
            // reads as ink pressed onto paper, not a sticker pasted on
            // top.
            transform: 'rotate(-7deg)',
            color: stamp.color,
            textAlign: 'center',
            filter: 'contrast(1.05) saturate(0.95)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
            // Ink-imperfection overlay — a tiled radial-gradient of
            // tiny white dots on top of the stamp so it looks like the
            // ink didn't fully transfer (a real rubber stamp rarely
            // stamps a perfectly clean print). Multiple background
            // layers at different positions + sizes break up the grid
            // so it reads as a random speckle rather than a pattern.
            backgroundImage: [
              'radial-gradient(circle, rgba(255,255,255,0.75) 0.7px, transparent 1.2px)',
              'radial-gradient(circle, rgba(255,255,255,0.6) 0.5px, transparent 1px)',
              'radial-gradient(circle, rgba(255,255,255,0.5) 0.6px, transparent 1.1px)',
            ].join(', '),
            backgroundSize: '6px 6px, 9px 9px, 13px 13px',
            backgroundPosition: '0 0, 3px 4px, 7px 2px',
          }}
        >
          <div
            style={{
              fontSize: '20px',
              fontWeight: 700,
              letterSpacing: '1.2px',
              fontFamily: 'Arial, Helvetica, sans-serif',
              lineHeight: 1.1,
            }}
          >
            {stamp.label}
          </div>
          {stamp.operator ? (
            <div style={{ fontSize: '9px', marginTop: 7, fontFamily: 'Arial, Helvetica, sans-serif' }}>
              By {stamp.operator}{stamp.date ? ` · ${stamp.date}` : ''}
            </div>
          ) : null}
          <div
            style={{
              fontSize: '8px',
              marginTop: 7,
              fontStyle: 'italic',
              letterSpacing: '0.5px',
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            {companyName}
          </div>
        </div>
      ) : null}

      {/* ─── 7. Footer (centered, three lines) ─────────────────────────── */}
      {/* Line 1: brand statement + company reg + VAT (larger font).
          Line 2: legal risk warning + conditions-of-sale note.
          Line 3: registered office address (smaller font to keep it
          inside the bottom margin). Renders inside every multi-page
          article, so each printed page carries the footer. */}
      <footer className="px-8 pb-5 text-center text-gray-900">
        <p className="text-[11px] leading-tight">
          {companyName}
          {'   Company Registration Number '}
          {company?.company_registration_number || EM_DASH}
          {'   VAT Reg No. '}
          {company?.vat_number || EM_DASH}
        </p>
        <p className="text-[8px] leading-tight">
          Customers ordering vehicles off the public highway do so at their own risk.{'   '}
          Conditions of sale available on request.
        </p>
        <p className="text-[8px] leading-tight">
          Registered Office: {(() => {
            const [l1, l2] = compactCompanyAddress(
              company?.address_line_1,
              company?.address_line_2,
              company?.town,
              company?.county,
              company?.postcode
            )
            return [companyName, l1, l2].filter(Boolean).join(', ')
          })()}
        </p>
      </footer>
      </article>
        )
      })}
    </>
  )
}