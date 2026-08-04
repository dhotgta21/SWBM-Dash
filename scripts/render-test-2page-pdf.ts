// One-off script: render a 2-page invoice PDF to verify the page-number
// fix and the "Continued..." stamp on the first page. Run with:
//   npx tsx scripts/render-test-2page-pdf.ts
import { writeFileSync } from 'node:fs'
import { renderInvoicePdf } from '../lib/invoices/render-pdf'
import type { InvoicePdfProps } from '../components/invoices/InvoicePdfTemplate'

async function main() {

  // 20 items → 2 pages (12 + 8) with the current ITEMS_PER_PAGE=12.
  const itemsRaw = [
    { name: 'MOT Type 1', code: 'AGG-004', unit: 'TON', qty: 8, price: 58.0 },
    { name: 'Sharp Sand', code: 'AGG-002', unit: 'TON', qty: 10, price: 58.0 },
    { name: 'Cement 25kg', code: 'AGG-001', unit: 'BAG', qty: 60, price: 7.0 },
    { name: 'Luxury Porcelain Slabs Sqm', code: 'TEMP-380DEF7C', unit: 'TO', qty: 78, price: 19.0 },
    { name: 'Damp Proof Membrane (DPM)', code: 'ROO-007', unit: 'EA', qty: 1, price: 44.0 },
    { name: 'MORTAR MIX 5LITRE', code: 'CEM-001', unit: 'EA', qty: 1, price: 6.0 },
    { name: 'Pavemix', code: 'TEMP-C0337E11', unit: 'EA', qty: 6, price: 58.0 },
    { name: 'Reinforcement Mesh', code: 'FIX-002', unit: 'EA', qty: 12, price: 32.0 },
    { name: 'Concrete Block', code: 'BLO-002', unit: 'EA', qty: 30, price: 4.5 },
    { name: 'Tile Adhesive', code: 'FIX-005', unit: 'EA', qty: 5, price: 18.0 },
    { name: 'Grout', code: 'FIX-008', unit: 'EA', qty: 8, price: 12.0 },
    { name: 'Paving Slab', code: 'ROO-003', unit: 'EA', qty: 15, price: 22.0 },
    { name: 'DPC', code: 'FIX-001', unit: 'EA', qty: 4, price: 38.0 },
    { name: 'Insulation', code: 'ROO-010', unit: 'EA', qty: 10, price: 14.0 },
    { name: 'Plasterboard', code: 'TIM-001', unit: 'EA', qty: 6, price: 9.0 },
    { name: 'Timber Stud', code: 'ROO-002', unit: 'EA', qty: 20, price: 6.0 },
    { name: 'Roof Felt', code: 'AGG-003', unit: 'EA', qty: 25, price: 4.0 },
    { name: 'Sand Cement', code: 'BRI-002', unit: 'EA', qty: 12, price: 8.0 },
    { name: 'Brick Tile', code: 'FIX-003', unit: 'EA', qty: 18, price: 5.5 },
    { name: 'Cavity Closers', code: 'ROO-001', unit: 'EA', qty: 9, price: 11.0 },
  ]
  const invoice_items = itemsRaw.map((it) => ({
    product_name: it.name,
    product_code: it.code,
    unit: it.unit,
    quantity: it.qty,
    price: it.price,
    vat_rate: 20,
    vat_amount: 0,
    line_total: it.qty * it.price,
  }))
  // Compute subtotal/vat/total so the bottom section shows real numbers.
  const subtotal = invoice_items.reduce((sum, it) => sum + it.line_total, 0)
  const vat_total = Math.round(subtotal * 0.2 * 100) / 100
  const total = subtotal + vat_total

const invoice: InvoicePdfProps['invoice'] = {
  type: 'invoice',
  document_number: 'INV-2026-G14',
  issue_date: '2026-07-10',
  issue_time: '10:17:00',
  due_date: null,
  expiry_date: null,
  order_number: '100024',
  account_number: '6059709',
  operator_name: 'Prabh Singh',
  your_reference: '100024',
  your_contact: null,
  notes: null,
  show_payment_terms: true,
  show_watermark: true,
  subtotal,
  vat_total,
  total,
  amount_paid: 0,
  balance_due: total,
  delivery_method: 'delivery',
  delivery_address_line_1: '20 Greville Avenue',
  delivery_address_line_2: null,
  delivery_town: 'South Croydon',
  delivery_county: 'Surrey',
  delivery_postcode: 'CR2 8NL',
  clients: {
    first_name: 'Habib',
    last_name: '.',
    company_name: null,
    address_line_1: null,
    address_line_2: null,
    town: null,
    county: null,
    postcode: null,
  },
  invoice_items,
}


const company: InvoicePdfProps['company'] = {
  company_name: 'Star Hawk Builders Merchant Ltd.',
  address_line_1: 'Unit 1, Huntsmoor Park Farm, Ford Ln',
  address_line_2: 'Iver, Berkshire, SL0 9LL',
  town: 'Iver',
  county: 'Berkshire',
  postcode: 'SL0 9LL',
  phones: [
    { id: 'p1', value: '07496 185969', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: true, sortOrder: 0 },
    { id: 'p2', value: '07460060607', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 1 },
  ],
  emails: [
    { id: 'e1', value: 'admin@starhawkbm.com', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: true, sortOrder: 0 },
    { id: 'e2', value: 'starhawk.merchants@gmail.com', label: null, contexts: { header: false, homepage: false, contactPage: false, footer: false, invoice: true, email: false, auth: false }, isPrimary: false, sortOrder: 1 },
  ],
  vat_number: 'GB2675308 83',
  company_registration_number: '10665594',
}

const buffer = await renderInvoicePdf({
  invoice,
  company,
  bankDetails: {
    bank_name: 'HSBC',
    account_number: '32610876',
    sort_code: '40-45-08',
  },
  logoSrc: null,
})

const outPath = process.argv[2] || 'C:\\Users\\sarpa\\Downloads\\test-2page-invoice.pdf'
writeFileSync(outPath, buffer)
console.log(`Wrote ${buffer.length} bytes to ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
