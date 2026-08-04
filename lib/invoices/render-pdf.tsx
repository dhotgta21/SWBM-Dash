import type { ReactElement } from 'react'
import { renderToBuffer, Document, Page, StyleSheet } from '@react-pdf/renderer'
import { InvoicePdfPage, ITEMS_PER_PAGE, type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { DeliveryNoteDocument } from '@/components/invoices/DeliveryNotePdfTemplate'

export type InvoiceRenderMode = 'invoice' | 'delivery-note'

export interface RenderInvoicePdfOptions extends InvoicePdfProps {
  mode?: InvoiceRenderMode
  copies?: number
}

const pageStyles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#000000',
    lineHeight: 1.3,
  },
})

export async function renderInvoicePdf(options: RenderInvoicePdfOptions): Promise<Buffer> {
  const { mode = 'invoice', copies = 1, ...props } = options
  const count = Math.max(1, Math.min(50, Math.floor(Number(copies) || 1)))

  // Build the per-invoice page list. For invoice mode we split items into
  // chunks of ITEMS_PER_PAGE so a long invoice produces multiple PDF pages
  // with the header on page 1 and totals on the last page. Delivery
  // notes follow the same multi-page pattern (DeliveryNoteDocument returns
  // Page elements directly, one per chunk).
  const buildPages = (copyIdx: number): ReactElement[] => {
    if (mode === 'delivery-note') {
      // DeliveryNoteDocument is invoked as a function (not a JSX element)
      // so we can return its array result. flatMap at the bottom will
      // splice these pages into the parent <Document> alongside the
      // invoice pages (or by themselves when mode === 'delivery-note').
      return DeliveryNoteDocument(props)
    }
    const items = props.invoice?.invoice_items ?? []
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
    return Array.from({ length: totalPages }).map((_, pageIdx) => {
      const chunk = items.slice(pageIdx * ITEMS_PER_PAGE, (pageIdx + 1) * ITEMS_PER_PAGE)
      return (
        <Page key={`invoice-${copyIdx}-${pageIdx}`} size="A4" style={pageStyles.page}>
          <InvoicePdfPage
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

  const doc = (
    <Document>
      {Array.from({ length: count }).flatMap((_, i) => buildPages(i))}
    </Document>
  )

  return renderToBuffer(doc)
}

// Re-export for consumers that only need the default invoice render.
export async function renderInvoicePdfLegacy(props: InvoicePdfProps): Promise<Buffer> {
  return renderInvoicePdf({ ...props, mode: 'invoice', copies: 1 })
}
