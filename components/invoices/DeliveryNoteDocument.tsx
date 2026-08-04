'use client'

import { Fragment } from 'react'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { filterChannelsByContext, telHref, mailtoHref } from '@/lib/company'
import {
  compactCompanyAddress,
  buildHeaderContactBlocks,
  paddedAddressLines,
} from '@/lib/invoices/pdf-helpers'

const LOGO_SRC = '/Logo.webp'

/**
 * Max line items per page for delivery / picker notes. Mirrors the
 * PDF template's DELIVERY_NOTE_ITEMS_PER_PAGE so the HTML preview and
 * the generated PDF stay in sync. 12 items fit comfortably above the
 * date-printed / signature block on the last page.
 */
const ITEMS_PER_PAGE = 12

interface DeliveryNoteDocumentProps {
  invoice: InvoicePdfProps['invoice']
  company?: InvoicePdfProps['company']
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
// shared helper the invoice templates also use, so the delivery note PDF
// and the delivery note HTML preview format addresses identically.

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

const EM_DASH = '\u2014'

export function DeliveryNoteDocument({ invoice, company, logoSrc, className, operatorName }: DeliveryNoteDocumentProps) {
  const displayOperator =
    invoice.operator_name && invoice.operator_name !== 'Unknown Operator'
      ? invoice.operator_name
      : operatorName || invoice.operator_name || 'Unknown Operator'
  const isCollection = invoice.delivery_method === 'collection'
  const docTypeLabel = isCollection ? 'Picker Note' : 'Delivery Note'

  const client = getClientDisplay(invoice)

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

  const items = (invoice.invoice_items || []).slice().sort((a, b) => {
    const ao = (a as { sort_order?: number }).sort_order ?? 0
    const bo = (b as { sort_order?: number }).sort_order ?? 0
    return ao - bo
  })

  // Multi-page chunking: items are split into ITEMS_PER_PAGE-sized chunks.
  // Each chunk renders its own <article>. The FIRST article carries the
  // full header (logo + addresses + account table); every article
  // carries the items block for its chunk; the LAST article carries the
  // date-printed / signature block. Earlier articles show "Continued..."
  // in the bottom area where the signature boxes would otherwise land.
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
  const pageChunks = Array.from({ length: totalPages }, (_, i) =>
    items.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE)
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
  const gridHasContent = contactRows.length > 0
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

  return (
    <>
      {pageChunks.map((chunk, pageIdx) => {
        const isLastPage = pageIdx === totalPages - 1
        const pageNumber = pageIdx + 1
        return (
    <article
      key={`delivery-page-${pageIdx}`}
      className={`bg-white text-gray-900 shadow-sm border border-gray-200 flex flex-col ${className ?? ''}`}
      style={{
        width: '794px',
        minHeight: '1123px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        // Hard page break between articles when printing so each
        // multi-page delivery note lands on its own sheet.
        pageBreakAfter: isLastPage ? 'auto' : 'always',
        breakAfter: isLastPage ? 'auto' : 'page',
        // `position: relative` so the absolute-positioned "Continued..."
        // text anchors to THIS article, not the viewport.
        position: 'relative',
      }}
    >
      {/* ─── 1. Header (logo left, company info right) ─────────────── */}
      <header className="px-8 pt-8 pb-6 relative">
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
              // tall contact block pushes the title row and everything
              // below it down instead of overlapping the document number.
              // Width is capped at 400px so the left edge stays clear of
              // the logo + brand name block.
              <div
                className="text-[12px] text-gray-900 text-left leading-snug max-w-[400px]"
              >
                <p className="font-bold mb-0.5">Head Office</p>
                {addr1 ? <p>{addr1}</p> : null}
                {addr2 ? <p>{addr2}</p> : null}
                <div className="h-1" />
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

      <div className="flex-1">
      {/* ─── 2. Title row (centered title + right-aligned number) ───── */}
      <section className="px-8 pb-8">
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
              Document Number
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
      <section className="px-8 pb-4">
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
            <p className="text-[12px] font-bold mb-1">{isCollection ? 'Pick up from:-' : 'Deliver to:-'}</p>
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
            <div className="py-0.5 px-1">Account</div>
            <div className="py-0.5 px-1">Our Operator</div>
            <div className="py-0.5 px-1 text-right">Taxpoint Date Time</div>
            <div className="py-0.5 px-1 text-right">Order Number</div>
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
            <div className="py-0.5 px-1">Your Contact</div>
            <div className="py-0.5 px-1" />
            <div className="py-0.5 px-1 text-right">Your Reference</div>
            <div className="py-0.5 px-1 text-right">Page</div>
          </div>
          <div className="grid grid-cols-[15%_45%_25%_15%] font-medium">
            <div className="py-1 px-1">
              {(invoice as { your_contact?: string }).your_contact || EM_DASH}
            </div>
            <div className="py-1 px-1" />
            <div className="py-1 px-1 text-right">{invoice.your_reference || EM_DASH}</div>
            <div className="py-1 px-1 text-right">{pageNumber}</div>
          </div>
        </div>
      </section>

      {/* ─── 5 + 6. Joined outer section (items + date/signatures) ───── */}
      <section className="px-8 pb-3">
        <div
          className="text-[12px] flex flex-col justify-between"
          style={{
            border: '2px solid #E5E5E5',
            minHeight: '587px',
            fontFamily: "'Courier New', Courier, monospace",
          }}
        >
          {/* Top block: items table */}
          <div>
            <div className="grid grid-cols-[15%_75%_10%] font-bold" style={{ backgroundColor: '#E5E5E5' }}>
              <div className="py-0.5 px-1">Quantity</div>
              <div className="py-0.5 px-1">Product</div>
              <div className="py-0.5 px-1 text-center">V</div>
            </div>
            {Array.from({
              length: Math.max(chunk.length, ITEMS_PER_PAGE),
            }).map((_, slotIdx) => {
              const item = chunk[slotIdx]
              if (!item) {
                // Empty slot — same height as a real row, no content.
                return (
                  <div
                    key={`empty-slot-${slotIdx}`}
                    className="grid grid-cols-[15%_75%_10%] min-h-[20px]"
                    aria-hidden
                  />
                )
              }
              return (
                <div key={`item-${slotIdx}`} className="grid grid-cols-[15%_75%_10%]">
                  <div className="p-1 text-right tabular-nums">
                    {formatQty(item.quantity, item.unit)}
                  </div>
                  <div className="p-1 whitespace-pre-line">
                    {item.product_name}
                    {item.product_code ? `\n${item.product_code}` : ''}
                  </div>
                  <div className="p-1 text-center">{item.vat_rate > 0 ? 'S' : 'Z'}</div>
                </div>
              )
            })}
          </div>

          {/* Bottom block: divider + (date + signatures on last page |
              "Continued..." on every other page). The divider always
              renders so the visual separator is consistent across pages. */}
          <div>
            {/* Horizontal divider between items and date/signatures (gray filled band) */}
            <div style={{ height: '8px', backgroundColor: '#E5E5E5' }} />

            {isLastPage ? (
              <div className="p-1">
                <p className="font-bold mb-1.5">Date printed: {formatDateUK(new Date().toISOString())}</p>
                <div className="flex justify-between gap-4">
                  <div
                    className="w-[35%] p-1 flex flex-col justify-end"
                    style={{ border: '0.75px solid #E5E5E5', minHeight: '53px' }}
                  >
                    <p className="font-bold">Driver signature</p>
                  </div>
                  <div
                    className="w-[55%] p-1 flex flex-col justify-end"
                    style={{ border: '0.75px solid #E5E5E5', minHeight: '80px' }}
                  >
                    <p className="font-bold">Customer signature</p>
                  </div>
                </div>
              </div>
            ) : (
              // Non-last page: empty area with a small "Continued..." text
              // in the bottom-right where the signature boxes would land on
              // the last page. Plain text — no border, no separate badge.
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

      </div>

      {/* ─── 7. Footer (centered company info) ─────────────────────── */}
      <footer className="px-8 pb-5 text-center text-[11px] text-gray-900">
        <p>
          {companyName}
          {'   Company Registration Number '}
          {company?.company_registration_number || EM_DASH}
          {'   VAT Reg No. '}
          {company?.vat_number || EM_DASH}
        </p>
      </footer>
    </article>
        )
      })}
    </>
  )
}