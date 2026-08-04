// lib/email/invoice-template.ts
// Renders a professional, brand-coloured HTML email for an invoice or
// quotation. Uses inline styles only (no Tailwind, no external CSS) for
// maximum compatibility with email clients (Gmail, Outlook, Apple Mail,
// mobile).
//
// The output is one self-contained HTML string suitable for the Resend
// `html` field. A text-only fallback is generated alongside for clients
// that prefer plain text.
//
// Tone is friendly-but-professional — "Hi <first name>" for a builders
// merchant keeps it warm; "Dear" felt too stiff for the audience.

import {
  type CompanyContactChannel,
  filterChannelsByContext,
  telHref,
  mailtoHref,
} from '@/lib/company'

export interface InvoiceEmailItem {
  product_name: string
  product_code?: string | null
  unit?: string | null
  quantity: number
  price: number
  line_total: number
}

export interface InvoiceEmailData {
  invoice: {
    type: 'invoice' | 'quotation'
    document_number: string
    order_number?: string | null
    issue_date: string // ISO date
    issue_time?: string | null // 24h HH:MM[:SS] from the `time` column
    due_date?: string | null
    expiry_date?: string | null
    your_reference?: string | null
    notes?: string | null
    operator_name?: string | null
    delivery_method?: 'delivery' | 'collection' | null
    delivery_address_line_1?: string | null
    delivery_address_line_2?: string | null
    delivery_town?: string | null
    delivery_county?: string | null
    delivery_postcode?: string | null
    subtotal: number
    vat_total: number
    total: number
    amount_paid: number
    balance_due: number
  }
  client: {
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
  }
  items: InvoiceEmailItem[]
  company: {
    company_name: string
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
  }
  // Public view URL for the invoice (no-auth, token-based). Optional — when
  // missing, the "View online" button is omitted.
  viewUrl?: string | null
  // Absolute https URL to the brand logo (e.g. https://site/Logo.png).
  // Must be a hosted URL — email clients strip base64/data-URL images.
  // When missing, the footer renders text-only (graceful fallback).
  logoUrl?: string | null
}

const BRAND_RED = '#C8202C'
const TEXT_COLOR = '#111827'
const MUTED_COLOR = '#6b7280'
const BORDER_COLOR = '#e5e7eb'
const SOFT_BG = '#f9fafb'
const TABLE_HEADER_BG = '#f3f4f6'
const PAID_GREEN = '#16a34a'
const DARK_RED_BG = '#fef2f2'

function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount || 0)
}

// Derive the effective VAT rate from the goods/value split so the label is
// always correct (e.g. "VAT (20%)") instead of a hardcoded 20%. Falls back
// to 0 when there's no subtotal to divide by.
function vatRateLabel(invoice: InvoiceEmailData['invoice']): string {
  const rate = invoice.subtotal > 0 ? Math.round((invoice.vat_total / invoice.subtotal) * 100) : 0
  return `VAT (${rate}%)`
}

function formatDateUK(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

function clientFirstName(client: InvoiceEmailData['client']): string {
  if (client.first_name) return client.first_name
  if (client.company_name) return client.company_name
  return 'there'
}

function formatItemQuantity(quantity: number, unit?: string | null): string {
  const n = Number(quantity)
  if (!Number.isFinite(n)) return unit ? `0 ${unit}` : '0'
  let qty: string
  if (n % 1 === 0) qty = n.toFixed(0)
  else if (Math.abs(n) < 0.005) qty = '0'
  else qty = n.toFixed(2).replace(/\.?0+$/, '')
  return unit ? `${qty} ${unit}` : qty
}

function companyAddressLine(company: InvoiceEmailData['company']): string {
  return [
    company.address_line_1,
    company.address_line_2,
    company.town,
    company.county,
    company.postcode,
  ]
    .filter(Boolean)
    .join(', ')
}

function deliveryAddressLines(invoice: InvoiceEmailData['invoice']): string[] {
  return [
    invoice.delivery_address_line_1,
    invoice.delivery_address_line_2,
    invoice.delivery_town,
    invoice.delivery_county,
    invoice.delivery_postcode,
  ]
    .filter((p) => p && String(p).trim().length > 0)
    .map((p) => String(p).trim()) as string[]
}

function isOverdue(dueDate: string | null | undefined, balanceDue: number): boolean {
  if (!dueDate) return false
  if (balanceDue <= 0) return false
  const d = new Date(dueDate)
  if (isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

export function renderInvoiceEmailHtml(data: InvoiceEmailData): string {
  const { invoice, client, items, company, viewUrl, logoUrl } = data
  const isQuote = invoice.type === 'quotation'
  const docTypeLabel = isQuote ? 'Quotation' : 'Invoice'
  const docTypeLower = docTypeLabel.toLowerCase()

  const invoicePhones = filterChannelsByContext(company.phones ?? [], 'invoice')
  const invoiceEmails = filterChannelsByContext(company.emails ?? [], 'invoice')

  const contactBits: string[] = []
  for (const c of invoicePhones) {
    contactBits.push(
      `<a href="${escapeHtml(telHref(c.value))}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</a>`
    )
  }
  for (const c of invoiceEmails) {
    contactBits.push(
      `<a href="${escapeHtml(mailtoHref(c.value))}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</a>`
    )
  }
  if (contactBits.length === 0) {
    if (company.phone) {
      contactBits.push(
        `<a href="tel:${escapeHtml(company.phone)}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(company.phone)}</a>`
      )
    }
    if (company.email) {
      contactBits.push(
        `<a href="mailto:${escapeHtml(company.email)}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(company.email)}</a>`
      )
    }
  }
  const contactLine = contactBits.join(' &nbsp;·&nbsp; ')

  const dueDate = !isQuote ? invoice.due_date : invoice.expiry_date
  const dueDateFormatted = formatDateUK(dueDate)
  const issueDateFormatted = formatDateUK(invoice.issue_date)
  const paid = !isQuote && invoice.balance_due <= 0 && invoice.amount_paid > 0
  const partiallyPaid = !isQuote && invoice.amount_paid > 0 && invoice.balance_due > 0
  const overdue = !isQuote && isOverdue(invoice.due_date, invoice.balance_due)
  const showDueRow = !!dueDateFormatted && (isQuote || invoice.balance_due > 0)
  const dueRowLabel = isQuote ? 'Quote valid until' : overdue ? 'Overdue since' : 'Payment due by'
  const dueRowColor = overdue ? '#dc2626' : BRAND_RED
  const address = companyAddressLine(company) || 'United Kingdom'
  const isCollection = invoice.delivery_method === 'collection'
  const fulfilmentLines = isCollection
    ? companyAddressLine(company)
      ? [companyAddressLine(company)]
      : []
    : deliveryAddressLines(invoice)
  const operator = (invoice.operator_name || '').trim()

  // Intro copy — friendly for invoices, slightly more formal for quotes
  // (which often go to new customers evaluating a price).
  const introParagraph = isQuote
    ? `Thank you for the opportunity to quote. Please find your <strong>${docTypeLower} ${escapeHtml(invoice.document_number)}</strong> attached, totalling <strong>${escapeHtml(formatCurrency(invoice.total))}</strong>. This quote is valid until <strong>${escapeHtml(dueDateFormatted || 'further notice')}</strong> — let us know if you would like to go ahead or have any questions.`
    : `Thank you for your business with ${escapeHtml(company.company_name)}. Please find your <strong>${docTypeLower} ${escapeHtml(invoice.document_number)}</strong> attached, totalling <strong>${escapeHtml(formatCurrency(invoice.total))}</strong>.${paid ? '' : overdue ? ' <strong>This invoice is now overdue</strong> — please disregard if payment is already on its way.' : ''}`

  // Preheader / preview snippet — the 1-2 line summary most email clients
  // show next to the subject in the inbox. Rendered into a hidden div below
  // so it sets the preview text without appearing in the visible body.
  const preheaderParts = [`${docTypeLabel} ${invoice.document_number} — ${formatCurrency(invoice.total)}.`]
  if (paid) preheaderParts.push('Paid in full — thank you.')
  else if (isQuote) preheaderParts.push(`Valid until ${dueDateFormatted || 'further notice'}.`)
  else if (overdue) preheaderParts.push('Currently overdue.')
  else if (dueDateFormatted) preheaderParts.push(`Payment due by ${dueDateFormatted}.`)
  preheaderParts.push('A PDF copy is attached.')
  const preheader = preheaderParts.join(' ')

  const itemsRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};vertical-align:top">
            <div style="font-weight:500">${escapeHtml(item.product_name)}</div>
            ${item.product_code ? `<div style="font-size:12px;color:${MUTED_COLOR};margin-top:2px">${escapeHtml(item.product_code)}</div>` : ''}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};text-align:center;vertical-align:top;white-space:nowrap">
            ${escapeHtml(formatItemQuantity(item.quantity, item.unit))}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};text-align:right;vertical-align:top;white-space:nowrap">
            ${escapeHtml(formatCurrency(item.price))}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid ${BORDER_COLOR};font-size:14px;color:${TEXT_COLOR};text-align:right;vertical-align:top;white-space:nowrap">
            ${escapeHtml(formatCurrency(item.line_total))}
          </td>
        </tr>`
    )
    .join('')

  // Paid banner — celebratory, with check mark
  const paidBanner = paid
    ? `<div style="margin:0 0 24px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;text-align:center">
        <div style="font-size:22px;line-height:1;color:${PAID_GREEN};font-weight:700">✓ Paid in full</div>
        <div style="font-size:13px;color:${MUTED_COLOR};margin-top:6px">Thank you — this ${docTypeLower} has been settled.</div>
      </div>`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${docTypeLabel} ${escapeHtml(invoice.document_number)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${TEXT_COLOR}">
    <!-- Preheader (hidden inbox preview text) -->
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:#f4f4f5" aria-hidden="true">
      ${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <div style="max-width:600px;margin:0 auto;padding:24px 16px">

      <!-- Brand header -->
      <div style="background:${BRAND_RED};padding:24px;border-radius:8px 8px 0 0">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle;width:64px">
              ${
                logoUrl
                  ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.company_name)} logo" width="56" height="56" style="display:block;width:56px;height:auto;max-height:56px;object-fit:contain" />`
                  : `<div style="width:56px;height:56px;background:#ffffff;border-radius:6px;display:flex;align-items:center;justify-content:center;color:${BRAND_RED};font-weight:700;font-size:16px">SH</div>`
              }
            </td>
            <td style="vertical-align:middle;padding-left:16px">
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px">${escapeHtml(company.company_name)}</div>
            </td>
          </tr>
        </table>
      </div>

      <!-- Body card -->
      <div style="background:#ffffff;padding:32px 28px;border:1px solid ${BORDER_COLOR};border-top:none;border-radius:0 0 8px 8px">

        <p style="margin:0 0 16px;font-size:16px">Hi ${escapeHtml(clientFirstName(client))},</p>

        <p style="margin:0 0 24px;font-size:15px;line-height:1.6">
          ${introParagraph}
        </p>

        ${paidBanner}

        <!-- Document summary box -->
        <div style="background:${overdue && !paid ? DARK_RED_BG : SOFT_BG};border:1px solid ${overdue && !paid ? '#fecaca' : BORDER_COLOR};border-radius:6px;padding:16px 20px;margin:0 0 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">
            <tr>
              <td style="color:${MUTED_COLOR};padding:4px 0">${docTypeLabel} number</td>
              <td style="text-align:right;font-weight:600">${escapeHtml(invoice.document_number)}</td>
            </tr>
            ${invoice.order_number
              ? `<tr>
                  <td style="color:${MUTED_COLOR};padding:4px 0">Order number</td>
                  <td style="text-align:right">${escapeHtml(invoice.order_number)}</td>
                </tr>`
              : ''}
            <tr>
              <td style="color:${MUTED_COLOR};padding:4px 0">Issue date</td>
              <td style="text-align:right">${escapeHtml(issueDateFormatted)}</td>
            </tr>
            ${showDueRow
              ? `<tr>
                  <td style="color:${MUTED_COLOR};padding:4px 0">${dueRowLabel}</td>
                  <td style="text-align:right;font-weight:600;color:${dueRowColor}">${escapeHtml(dueDateFormatted)}</td>
                </tr>`
              : ''}
            <tr>
              <td style="color:${MUTED_COLOR};padding:4px 0;border-top:1px solid ${BORDER_COLOR};margin-top:4px">Total ${paid ? 'paid' : 'amount'}</td>
              <td style="text-align:right;font-weight:700;font-size:16px;border-top:1px solid ${BORDER_COLOR};padding-top:6px">${escapeHtml(formatCurrency(invoice.total))}</td>
            </tr>
            ${!isQuote && invoice.amount_paid > 0 && invoice.balance_due > 0
              ? `<tr>
                  <td style="color:${MUTED_COLOR};padding:4px 0">Amount paid</td>
                  <td style="text-align:right;color:${PAID_GREEN}">${escapeHtml(formatCurrency(invoice.amount_paid))}</td>
                </tr>
                <tr>
                  <td style="color:${MUTED_COLOR};padding:4px 0;font-weight:600">Balance due</td>
                  <td style="text-align:right;font-weight:600;color:${BRAND_RED}">${escapeHtml(formatCurrency(invoice.balance_due))}</td>
                </tr>`
              : ''}
          </table>
        </div>

        ${
          fulfilmentLines.length > 0
            ? `<div style="margin:0 0 28px">
                <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED_COLOR};margin:0 0 8px;font-weight:600">${isCollection ? 'Pick up from' : 'Delivery to'}</h2>
                <div style="font-size:14px;line-height:1.55;color:${TEXT_COLOR}">
                  ${fulfilmentLines.map((l) => escapeHtml(l)).join('<br />')}
                </div>
              </div>`
            : ''
        }

        <!-- Items table -->
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:0.6px;color:${MUTED_COLOR};margin:0 0 10px;font-weight:600">Order Summary</h2>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid ${BORDER_COLOR};border-radius:6px;overflow:hidden;margin:0 0 8px">
          <thead>
            <tr style="background:${TABLE_HEADER_BG}">
              <th align="left" style="padding:10px 12px;font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px">Item</th>
              <th align="center" style="padding:10px 12px;font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px">Qty</th>
              <th align="right" style="padding:10px 12px;font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px">Price</th>
              <th align="right" style="padding:10px 12px;font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows || `<tr><td colspan="4" style="padding:16px;text-align:center;color:${MUTED_COLOR};font-size:14px">No items</td></tr>`}
          </tbody>
        </table>

        <!-- Totals breakdown -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:60%;margin-left:auto;border-collapse:collapse;font-size:14px;margin-bottom:8px">
          <tr>
            <td style="color:${MUTED_COLOR};padding:4px 0">Subtotal</td>
            <td style="text-align:right;padding:4px 0">${escapeHtml(formatCurrency(invoice.subtotal))}</td>
          </tr>
          <tr>
            <td style="color:${MUTED_COLOR};padding:4px 0">${vatRateLabel(invoice)}</td>
            <td style="text-align:right;padding:4px 0">${escapeHtml(formatCurrency(invoice.vat_total))}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 4px;font-weight:700;font-size:16px;border-top:2px solid ${TEXT_COLOR}">Total</td>
            <td style="padding:10px 0 4px;text-align:right;font-weight:700;font-size:16px;border-top:2px solid ${TEXT_COLOR}">${escapeHtml(formatCurrency(invoice.total))}</td>
          </tr>
          ${partiallyPaid
            ? `<tr>
                <td style="color:${MUTED_COLOR};padding:4px 0">Amount paid</td>
                <td style="text-align:right;padding:4px 0;color:${PAID_GREEN}">${escapeHtml(formatCurrency(invoice.amount_paid))}</td>
              </tr>
              <tr>
                <td style="color:${MUTED_COLOR};padding:4px 0;font-weight:600">Balance due</td>
                <td style="text-align:right;padding:4px 0;font-weight:600;color:${BRAND_RED}">${escapeHtml(formatCurrency(invoice.balance_due))}</td>
              </tr>`
            : ''}
        </table>

        ${
          invoice.your_reference || invoice.order_number
            ? `<div style="margin:24px 0 0;padding:14px 16px;background:${SOFT_BG};border-left:3px solid ${BRAND_RED};border-radius:4px;font-size:14px;line-height:1.5">
                <div style="font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Reference</div>
                ${escapeHtml(invoice.your_reference || invoice.order_number || '')}
              </div>`
            : ''
        }

        ${
          invoice.notes
            ? `<div style="margin:16px 0 0;padding:14px 16px;background:${SOFT_BG};border-left:3px solid ${BRAND_RED};border-radius:4px;font-size:14px;line-height:1.5">
                <div style="font-size:12px;font-weight:600;color:${MUTED_COLOR};text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Notes</div>
                ${escapeHtml(invoice.notes)}
              </div>`
            : ''
        }

        ${
          viewUrl
            ? `<!-- View online CTA -->
        <div style="margin:32px 0 0;text-align:center">
          <a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:6px">View ${docTypeLabel} Online</a>
          <div style="font-size:12px;color:${MUTED_COLOR};margin-top:8px">No login required · Works on any device</div>
        </div>`
            : ''
        }

        <!-- Help / contact -->
        <div style="margin:32px 0 0;padding-top:24px;border-top:1px solid ${BORDER_COLOR}">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600">Need help?</p>
          <p style="margin:0;font-size:14px;line-height:1.6">
            If you have any questions about this ${docTypeLower} or your order, please get in touch${
              contactLine ? ` — call or email us on ${contactLine}` : ''
            } and we will be happy to help.
          </p>
        </div>

        <p style="margin:24px 0 0;font-size:14px;line-height:1.6">
          Kind regards,<br />
          <strong>${escapeHtml(company.company_name)}</strong>${
            operator ? `<br /><span style="color:${MUTED_COLOR};font-size:13px">${escapeHtml(operator)}</span>` : ''
          }
        </p>
      </div>

      <!-- Footer -->
      <div style="text-align:center;font-size:12px;color:${MUTED_COLOR};padding:20px 16px;line-height:1.6">
        ${
          logoUrl
            ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.company_name)} logo" width="150" height="103" style="display:block;margin:0 auto 14px;width:150px;max-width:100%;height:auto;-ms-interpolation-mode:bicubic" />`
            : ''
        }
        <div><strong>${escapeHtml(company.company_name)}</strong></div>
        <div>${escapeHtml(address)}</div>
        ${invoicePhones.length
          ? invoicePhones.map((c) => `<div>Tel: ${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</div>`).join('')
          : company.phone
            ? `<div>Tel: ${escapeHtml(company.phone)}</div>`
            : ''}
        ${invoiceEmails.length
          ? invoiceEmails.map((c) => `<div>${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</div>`).join('')
          : company.email
            ? `<div>${escapeHtml(company.email)}</div>`
            : ''}
        <div style="margin-top:8px">
          ${
            [
              company.company_registration_number ? `Company Reg No: ${escapeHtml(company.company_registration_number)}` : '',
              company.vat_number ? `VAT Reg No: ${escapeHtml(company.vat_number)}` : '',
            ].filter(Boolean).join(' &nbsp;·&nbsp; ')
          }
        </div>
        <div style="margin-top:8px;color:#9ca3af">
          A PDF copy of this ${docTypeLower} is attached for your records.
        </div>
      </div>

    </div>
  </body>
</html>`
}

export function renderInvoiceEmailSubject(data: InvoiceEmailData): string {
  const { invoice, company } = data
  const isQuote = invoice.type === 'quotation'
  const docType = isQuote ? 'Quotation' : 'Invoice'
  // Strip CR/LF from interpolated values so a crafted document number or
  // company name can't inject extra email headers via the subject line.
  const safeDocumentNumber = (invoice.document_number ?? '').replace(/[\r\n]/g, '')
  const safeOrderNumber = (invoice.order_number ?? '').replace(/[\r\n]/g, '')
  const safeCompanyName = (company.company_name ?? '').replace(/[\r\n]/g, '')
  const orderBit = safeOrderNumber ? ` (Order ${safeOrderNumber})` : ''
  return `${docType} ${safeDocumentNumber}${orderBit} from ${safeCompanyName}`
}

export function renderInvoiceEmailText(data: InvoiceEmailData): string {
  const { invoice, client, items, company, viewUrl } = data
  const isQuote = invoice.type === 'quotation'
  const docType = isQuote ? 'Quotation' : 'Invoice'
  const paid = !isQuote && invoice.balance_due <= 0 && invoice.amount_paid > 0
  const overdue = !isQuote && isOverdue(invoice.due_date, invoice.balance_due)
  const isCollection = invoice.delivery_method === 'collection'
  const fulfilmentLines = isCollection
    ? companyAddressLine(company)
      ? [companyAddressLine(company)]
      : []
    : deliveryAddressLines(invoice)
  const operator = (invoice.operator_name || '').trim()

  const invoicePhones = filterChannelsByContext(company.phones ?? [], 'invoice')
  const invoiceEmails = filterChannelsByContext(company.emails ?? [], 'invoice')

  const lines: string[] = []
  lines.push(`Hi ${clientFirstName(client)},`)
  lines.push('')
  if (isQuote) {
    lines.push(
      `Thank you for the opportunity to quote. Please find your ${docType.toLowerCase()} ${invoice.document_number} attached, totalling ${formatCurrency(invoice.total)}. This quote is valid until ${formatDateUK(invoice.expiry_date) || 'further notice'} — let us know if you would like to go ahead or have any questions.`
    )
  } else {
    lines.push(
      `Thank you for your business with ${company.company_name}. Please find your ${docType.toLowerCase()} ${invoice.document_number} attached, totalling ${formatCurrency(invoice.total)}.${paid ? '' : overdue ? ' This invoice is now overdue — please disregard if payment is already on its way.' : ''}`
    )
  }
  lines.push('')
  if (paid) lines.push('STATUS: PAID IN FULL — thank you.')
  lines.push(`${docType} number: ${invoice.document_number}`)
  if (invoice.order_number) lines.push(`Order number: ${invoice.order_number}`)
  lines.push(`Issue date: ${formatDateUK(invoice.issue_date)}`)
  const due = !isQuote ? invoice.due_date : invoice.expiry_date
  if (due) {
    lines.push(
      `${isQuote ? 'Valid until' : overdue ? 'OVERDUE since' : 'Payment due by'}: ${formatDateUK(due)}`
    )
  }
  if (fulfilmentLines.length > 0) {
    lines.push('')
    lines.push(`${isCollection ? 'Pick up from' : 'Delivery to'}:`)
    for (const l of fulfilmentLines) lines.push(`  ${l}`)
  }
  lines.push('')
  lines.push('Order summary:')
  if (items.length === 0) {
    lines.push('  (no items)')
  } else {
    for (const item of items) {
      lines.push(
        `  - ${item.product_name} (${formatItemQuantity(item.quantity, item.unit)}) — ${formatCurrency(item.line_total)}`
      )
    }
  }
  lines.push('')
  lines.push(`Subtotal: ${formatCurrency(invoice.subtotal)}`)
  lines.push(`${vatRateLabel(invoice)}: ${formatCurrency(invoice.vat_total)}`)
  lines.push(`Total: ${formatCurrency(invoice.total)}`)
  if (!isQuote && invoice.amount_paid > 0) {
    lines.push(`Amount paid: ${formatCurrency(invoice.amount_paid)}`)
    if (invoice.balance_due > 0) lines.push(`Balance due: ${formatCurrency(invoice.balance_due)}`)
  }
  if (invoice.your_reference || invoice.order_number) {
    lines.push('')
    lines.push(`Reference: ${invoice.your_reference || invoice.order_number}`)
  }
  if (invoice.notes) {
    lines.push('')
    lines.push('Notes:')
    lines.push(`  ${invoice.notes}`)
  }
  if (viewUrl) {
    lines.push('')
    lines.push(`View this ${docType.toLowerCase()} online: ${viewUrl}`)
  }
  lines.push('')
  lines.push('Need help? Reach out to us:')
  if (invoicePhones.length) {
    for (const c of invoicePhones) {
      lines.push(`  Phone${c.label ? ` (${c.label})` : ''}: ${c.value}`)
    }
  } else if (company.phone) {
    lines.push(`  Phone: ${company.phone}`)
  }
  if (invoiceEmails.length) {
    for (const c of invoiceEmails) {
      lines.push(`  Email${c.label ? ` (${c.label})` : ''}: ${c.value}`)
    }
  } else if (company.email) {
    lines.push(`  Email: ${company.email}`)
  }
  lines.push('  and we will be happy to help.')
  lines.push('')
  lines.push('Kind regards,')
  lines.push(company.company_name)
  if (operator) lines.push(operator)
  lines.push('')
  lines.push('---')
  lines.push(company.company_name)
  lines.push(companyAddressLine(company) || 'United Kingdom')
  if (invoicePhones.length) {
    for (const c of invoicePhones) {
      lines.push(`Tel: ${c.value}${c.label ? ` (${c.label})` : ''}`)
    }
  } else if (company.phone) {
    lines.push(`Tel: ${company.phone}`)
  }
  if (invoiceEmails.length) {
    for (const c of invoiceEmails) {
      lines.push(c.value)
    }
  } else if (company.email) {
    lines.push(company.email)
  }
  lines.push(
    [
      company.company_registration_number ? `Company Reg No: ${company.company_registration_number}` : '',
      company.vat_number ? `VAT Reg No: ${company.vat_number}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
  )
  lines.push('A PDF copy of this ' + docType.toLowerCase() + ' is attached for your records.')

  return lines.join('\n')
}
