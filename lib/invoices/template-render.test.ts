// Temporary smoke test for invoice PDF rendering after header layout changes.
import { describe, it, expect } from 'vitest'
import { renderInvoicePdf } from './render-pdf'
import type { InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'

function makeInvoice(): InvoicePdfProps['invoice'] {
  return {
    type: 'invoice',
    document_number: 'INV-2026-G12',
    issue_date: '2026-07-09',
    issue_time: '14:17:00',
    due_date: null,
    expiry_date: null,
    order_number: '100022',
    account_number: '8486483',
    operator_name: 'Prabh Singh',
    your_reference: null,
    your_contact: '07904568282',
    notes: null,
    show_payment_terms: true,
    show_watermark: false,
    subtotal: 4150.0,
    vat_total: 830.0,
    total: 4980.0,
    amount_paid: 0,
    balance_due: 4980.0,
    delivery_method: 'delivery',
    delivery_address_line_1: '16 Shepherds Way',
    delivery_address_line_2: null,
    delivery_town: 'Farnham',
    delivery_county: 'Surrey',
    delivery_postcode: 'GU10 2AB',
    clients: {
      first_name: null,
      last_name: null,
      company_name: 'SSS & Ak Constructions',
      address_line_1: '16 Shepherds Way',
      address_line_2: null,
      town: 'Farnham',
      county: 'Surrey',
      postcode: 'GU10 2AB',
    },
    invoice_items: Array.from({ length: 12 }, (_, i) => ({
      product_name: `New Guilt Stock Brick ${i + 1}`,
      product_code: `BRI-${String(i + 1).padStart(3, '0')}`,
      unit: 'EA',
      quantity: 100,
      price: 0.83,
      vat_rate: 20,
      vat_amount: 16.6,
      line_total: 99.6,
    })),
  }
}

const company: InvoicePdfProps['company'] = {
  company_name: 'Star Hawk Builders Merchant Ltd.',
  address_line_1: 'Unit 4, Redhill Distribution Centre',
  address_line_2: 'Holmethorpe Avenue',
  town: 'Redhill',
  county: 'Surrey',
  postcode: 'RH1 2NL',
  phones: [
    { id: 'p1', value: '01737 123 111', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: true, sortOrder: 0 },
    { id: 'p2', value: '01737 123 222', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 1 },
    { id: 'p3', value: '01737 123 333', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 2 },
    { id: 'p4', value: '01737 123 444', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 3 },
  ],
  emails: [
    { id: 'e1', value: 'sales@starhawkbm.co.uk', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: true, sortOrder: 0 },
    { id: 'e2', value: 'accounts@starhawkbm.co.uk', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 1 },
    { id: 'e3', value: 'orders@starhawkbm.co.uk', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 2 },
    { id: 'e4', value: 'info@starhawkbm.co.uk', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 3 },
  ],
  vat_number: 'GB123456789',
  company_registration_number: '12345678',
  website: 'www.starhawkbm.co.uk',
}

describe('invoice PDF render smoke test', () => {
  it('renders a single-page invoice with 4 phones + 4 emails and 12 items', async () => {
    const buffer = await renderInvoicePdf({
      invoice: makeInvoice(),
      company,
      bankDetails: {
        bank_name: 'Star Bank',
        account_number: '12345678',
        sort_code: '12-34-56',
      },
      logoSrc: null,
    })
    expect(buffer.length).toBeGreaterThan(0)
    // Basic PDF magic number check.
    expect(buffer.toString('ascii', 0, 5)).toBe('%PDF-')
  })
})
