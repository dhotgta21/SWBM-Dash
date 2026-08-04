/**
 * Subset of invoice fields used by client detail dashboards and the account tab.
 */
export interface ClientInvoiceRow {
  id: string
  document_number: string
  type: 'invoice' | 'quotation'
  status: string
  issue_date: string
  due_date: string | null
  total: number
  amount_paid: number
  balance_due: number
}
