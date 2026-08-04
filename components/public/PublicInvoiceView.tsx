// components/public/PublicInvoiceView.tsx
// Server-rendered public invoice page. The actual invoice layout lives in
// components/invoices/InvoiceDocument.tsx so the same HTML view can be
// reused inside the dashboard (for image capture) and on the public page.

import { ScaledInvoiceDocument } from '@/components/invoices/ScaledInvoiceDocument'
import { ScaledDeliveryNoteDocument } from '@/components/invoices/ScaledDeliveryNoteDocument'
import { MobileInvoiceSummary } from './MobileInvoiceSummary'
import { PublicDownloadPdfButton } from './PublicDownloadPdfButton'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'

const LOGO_SRC = '/Logo.webp'

interface PublicInvoiceViewProps {
  invoice: InvoicePdfProps['invoice'] & { id?: string; share_token: string }
  company: InvoicePdfProps['company']
  bankDetails: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  mode?: 'invoice' | 'delivery-note'
  /** If the visitor unlocked this view with a password, pass it so the PDF download works too. */
  downloadPassword?: string
  /** Public URL token to use for the PDF download. Falls back to invoice.share_token. */
  downloadToken?: string
}

export async function PublicInvoiceView({
  invoice,
  company,
  bankDetails,
  logoSrc,
  mode = 'invoice',
  downloadPassword,
  downloadToken,
}: PublicInvoiceViewProps) {
  const resolvedLogoSrc = logoSrc ?? LOGO_SRC
  const companyName = company?.company_name || 'Demo Builder Merchant'
  const isDeliveryNote = mode === 'delivery-note'
  const docTypeLabel = isDeliveryNote
    ? invoice.delivery_method === 'collection'
      ? 'Picker Note'
      : 'Delivery Note'
    : invoice.type === 'quotation'
      ? 'Quotation'
      : 'Invoice'

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Top action bar — sticky on mobile so Download is always reachable */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 print:hidden">
        <div className="max-w-[820px] mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">{docTypeLabel}</p>
            <p className="text-sm font-semibold text-gray-900 truncate">{invoice.document_number}</p>
          </div>
          <PublicDownloadPdfButton
            documentNumber={invoice.document_number}
            shareToken={downloadToken || invoice.share_token}
            password={downloadPassword}
            mode={isDeliveryNote ? 'delivery-note' : 'invoice'}
          />
        </div>
      </div>

      <div className="max-w-[820px] mx-auto my-6 sm:my-10 print:my-0">
        {isDeliveryNote ? (
          <>
            <MobileInvoiceSummary
              invoice={invoice}
              company={company}
              bankDetails={bankDetails}
              logoSrc={resolvedLogoSrc}
              mode="delivery-note"
            />
            <div className="hidden md:block">
              <ScaledDeliveryNoteDocument
                invoice={invoice}
                company={company}
                logoSrc={resolvedLogoSrc}
              />
            </div>
          </>
        ) : (
          <>
            <MobileInvoiceSummary
              invoice={invoice}
              company={company}
              bankDetails={bankDetails}
              logoSrc={resolvedLogoSrc}
            />
            <div className="hidden md:block">
              <ScaledInvoiceDocument
                invoice={invoice}
                company={company}
                bankDetails={bankDetails}
                logoSrc={resolvedLogoSrc}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-center text-xs text-gray-400 pb-8 print:hidden">
        Shared by {companyName} • Powered by Demo Builder Merchant
      </p>
    </div>
  )
}
