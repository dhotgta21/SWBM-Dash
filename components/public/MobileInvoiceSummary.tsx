// components/public/MobileInvoiceSummary.tsx
// Mobile-first summary of an invoice/quotation for the public share link.
// Renders readable cards instead of the scaled A4 document so clients can
// view the document on a phone without pinching or horizontal scrolling.

import { formatCurrency } from '@/lib/utils'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { filterChannelsByContext, telHref, mailtoHref } from '@/lib/company'

const LOGO_SRC = '/Logo.webp'

interface MobileInvoiceSummaryProps {
  invoice: InvoicePdfProps['invoice'] & { share_token: string }
  company: InvoicePdfProps['company']
  bankDetails: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  mode?: 'invoice' | 'delivery-note'
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
    'Unknown client'
  const secondary =
    client?.company_name && client?.first_name
      ? [client.first_name, client.last_name].filter(Boolean).join(' ')
      : undefined
  return { primary, secondary, phone: client?.phone }
}

function buildDeliveryAddressLines(invoice: InvoicePdfProps['invoice']): string[] {
  return [
    invoice.delivery_address_line_1,
    invoice.delivery_address_line_2,
    invoice.delivery_town,
    invoice.delivery_county,
    invoice.delivery_postcode,
  ].filter(Boolean) as string[]
}

function buildCompanyAddress(company: InvoicePdfProps['company']): string[] {
  return [company?.address_line_1, company?.address_line_2, company?.town, company?.county, company?.postcode]
    .filter(Boolean)
    .map(String)
}

function formatDateUK(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
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

export function MobileInvoiceSummary({ invoice, company, bankDetails, logoSrc, mode = 'invoice' }: MobileInvoiceSummaryProps) {
  const isDeliveryNote = mode === 'delivery-note'
  const isQuote = !isDeliveryNote && invoice.type === 'quotation'
  const docTypeLabel = isDeliveryNote
    ? invoice.delivery_method === 'collection'
      ? 'Picker Note'
      : 'Delivery Note'
    : isQuote
      ? 'Quotation'
      : 'Invoice'
  const isPaid = !isQuote && Number(invoice.balance_due) <= 0 && Number(invoice.amount_paid) > 0

  const client = getClientDisplay(invoice)
  const isCollection = invoice.delivery_method === 'collection'
  const deliveryLines = isCollection
    ? buildCompanyAddress(company)
    : buildDeliveryAddressLines(invoice)
  const companyAddressLines = buildCompanyAddress(company)
  const companyName = company?.company_name || 'Star Hawk Builders Merchant'

  const items = (invoice.invoice_items || [])
    .slice()
    .sort((a, b) => ((a as { sort_order?: number }).sort_order ?? 0) - ((b as { sort_order?: number }).sort_order ?? 0))

  return (
    <div className="space-y-4 md:hidden">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{docTypeLabel}</p>
            <p className="text-lg font-semibold text-foreground">{invoice.document_number}</p>
          </div>
          {logoSrc || LOGO_SRC ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc || LOGO_SRC} alt={`${companyName} logo`} className="h-10 w-auto object-contain" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
              SH
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Issue date</p>
            <p className="font-medium text-foreground">{formatDateUK(invoice.issue_date) || '—'}</p>
          </div>
          {!isDeliveryNote && (
            <div>
              <p className="text-xs text-muted-foreground">{isQuote ? 'Quote expiry' : 'Due date'}</p>
              <p className="font-medium text-foreground">
                {formatDateUK(invoice.expiry_date || invoice.due_date) || '—'}
              </p>
            </div>
          )}
          {invoice.order_number && (
            <div>
              <p className="text-xs text-muted-foreground">Order number</p>
              <p className="font-medium text-foreground">{invoice.order_number}</p>
            </div>
          )}
          {invoice.your_reference && (
            <div>
              <p className="text-xs text-muted-foreground">Your reference</p>
              <p className="font-medium text-foreground">{invoice.your_reference}</p>
            </div>
          )}
        </div>
      </div>

      {/* From / To */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From</p>
          <p className="font-semibold text-foreground">{companyName}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {companyAddressLines.length > 0 ? companyAddressLines.join(', ') : 'Address not set'}
          </p>
          {(() => {
            const invoicePhones = filterChannelsByContext(company?.phones ?? [], 'invoice')
            const invoiceEmails = filterChannelsByContext(company?.emails ?? [], 'invoice')

            return (
              <>
                {invoicePhones.map((c, i) => (
                  <p key={`phone-${i}`} className="mt-1 text-sm text-muted-foreground">
                    {c.label ? `${c.label}: ` : ''}
                    <a href={telHref(c.value)} className="hover:underline">
                      {c.value}
                    </a>
                  </p>
                ))}
                {invoicePhones.length === 0 && company?.phone && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <a href={telHref(company.phone)} className="hover:underline">
                      {company.phone}
                    </a>
                  </p>
                )}
                {invoiceEmails.map((c, i) => (
                  <p key={`email-${i}`} className="text-sm text-muted-foreground">
                    {c.label ? `${c.label}: ` : ''}
                    <a href={mailtoHref(c.value)} className="hover:underline">
                      {c.value}
                    </a>
                  </p>
                ))}
                {invoiceEmails.length === 0 && company?.email && (
                  <p className="text-sm text-muted-foreground">
                    <a href={mailtoHref(company.email)} className="hover:underline">
                      {company.email}
                    </a>
                  </p>
                )}
              </>
            )
          })()}
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To</p>
          <p className="font-semibold text-foreground">{client.primary}</p>
          {client.secondary && <p className="text-sm text-muted-foreground">{client.secondary}</p>}
          {client.phone && <p className="mt-1 text-sm text-muted-foreground">{client.phone}</p>}
        </div>
      </div>

      {/* Delivery / Collection */}
      {deliveryLines.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {isCollection ? 'Pick up from' : 'Delivery address'}
          </p>
          <p className="mt-1 text-sm text-foreground">{deliveryLines.join(', ')}</p>
        </div>
      )}

      {/* Items */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Items
        </div>
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No items added</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item, idx) => (
              <li key={idx} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{item.product_name}</p>
                    {item.product_code && <p className="text-xs text-muted-foreground">{item.product_code}</p>}
                  </div>
                  {!isDeliveryNote && (
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {formatCurrency(item.line_total)}
                    </p>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>Qty: {formatQty(item.quantity, item.unit)}</span>
                  {!isDeliveryNote && <span>Price: {formatCurrency(item.price)}</span>}
                  {item.vat_rate !== undefined && item.vat_rate > 0 && <span>VAT: {item.vat_rate}%</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isDeliveryNote && (
        <>
          {/* Totals */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium text-foreground">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">VAT</span>
                <span className="font-medium text-foreground">{formatCurrency(invoice.vat_total)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{formatCurrency(invoice.total)}</span>
              </div>
              {!isQuote && Number(invoice.amount_paid) > 0 && (
                <>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-muted-foreground">Amount paid</span>
                    <span className="font-medium text-foreground">{formatCurrency(invoice.amount_paid)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Balance due</span>
                    <span className="font-semibold text-foreground">{formatCurrency(invoice.balance_due)}</span>
                  </div>
                </>
              )}
            </div>
            {isPaid && (
              <div className="mt-4 inline-flex w-full items-center justify-center rounded-lg border-2 border-green-600 py-2">
                <span className="font-bold tracking-wider text-green-600">PAID IN FULL</span>
              </div>
            )}
          </div>

          {/* Bank details */}
          {(bankDetails?.bank_name || bankDetails?.account_number || bankDetails?.sort_code) && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bank details</p>
              <div className="mt-2 space-y-1 text-sm text-foreground">
                {bankDetails?.bank_name && <p>{bankDetails.bank_name}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {bankDetails?.account_number && (
                    <span>
                      <span className="text-muted-foreground">Account:</span> {bankDetails.account_number}
                    </span>
                  )}
                  {bankDetails?.sort_code && (
                    <span>
                      <span className="text-muted-foreground">Sort code:</span> {bankDetails.sort_code}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{invoice.notes}</p>
        </div>
      )}

      {/* Terms */}
      {!isDeliveryNote && (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment terms</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Payment is due within 30 days of invoice date. Late payments may incur interest charges.
          </p>
        </div>
      )}
    </div>
  )
}
