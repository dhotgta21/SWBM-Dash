'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { daysBetween } from '@/lib/utils'

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export interface ClientMonthlyPoint {
  label: string
  fullLabel: string
  invoiced: number
  collected: number
  invoiceCount: number
}

export interface ClientStatusBreakdown {
  status: 'paid' | 'partial' | 'due' | 'overdue'
  amount: number
  count: number
}

export interface ClientTopProduct {
  name: string
  quantity: number
  revenue: number
}

export interface ClientAgeingBucket {
  label: string
  amount: number
  count: number
}

export interface ClientAnalytics {
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  accountBalance: number
  invoiceCount: number
  paidCount: number
  partialCount: number
  dueCount: number
  overdueCount: number
  averageDaysToPay: number | null
  lastPaymentAt: string | null
  buyingVolume: number
  monthlySeries: ClientMonthlyPoint[]
  statusBreakdown: ClientStatusBreakdown[]
  topProducts: ClientTopProduct[]
  ageingBuckets: ClientAgeingBucket[]
}

interface RawInvoice {
  id: string
  document_number: string
  issue_date: string
  due_date: string | null
  total: number
  amount_paid: number
  balance_due: number
  status: string
  type: 'invoice' | 'quotation'
}

interface RawPayment {
  id: string
  amount: number
  payment_date: string
  invoice_id: string
  invoices:
    | { issue_date: string; total: number; status: string }
    | { issue_date: string; total: number; status: string }[]
    | null
}

interface RawInvoiceItem {
  product_name: string
  quantity: number
  line_total: number
}

function classifyInvoice(invoice: RawInvoice, todayStr: string) {
  if (invoice.status === 'cancelled') return 'cancelled' as const
  if (invoice.status === 'draft') return 'draft' as const
  if (invoice.balance_due <= 0) return 'paid' as const
  if (invoice.amount_paid > 0) return 'partial' as const
  if (invoice.due_date && invoice.due_date < todayStr) return 'overdue' as const
  return 'due' as const
}

function normaliseOne<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null
  return Array.isArray(value) ? value[0] : value
}

function monthLabel(date: Date): string {
  return date.toLocaleString('en-GB', { month: 'short' })
}

function monthFullLabel(date: Date): string {
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' })
}

export async function getClientAnalytics(clientId: string): Promise<ClientAnalytics> {
  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.see_clients)) {
    throw new Error('Not authorised')
  }

  const admin = createAdminClient()
  const today = new Date()
  const todayStr = toISODate(today)



  const invoiceIdsResult = await admin
    .from('invoices')
    .select('id')
    .eq('client_id', clientId)
    .eq('type', 'invoice')
    .is('deleted_at', null)

  const invoiceIds = (invoiceIdsResult.data ?? []).map((row: { id: string }) => row.id)

  const [invoicesResult, paymentsResult, itemsResult, clientResult] = await Promise.all([
    admin
      .from('invoices')
      .select('id, document_number, issue_date, due_date, total, amount_paid, balance_due, status, type')
      .eq('client_id', clientId)
      .eq('type', 'invoice')
      .is('deleted_at', null)
      .order('issue_date', { ascending: false }),
    admin
      .from('payments')
      .select('id, amount, payment_date, invoice_id, invoices!inner(issue_date, total, status)')
      .eq('invoices.client_id', clientId)
      .eq('invoices.type', 'invoice')
      .is('deleted_at', null)
      .is('invoices.deleted_at', null)
      .order('payment_date', { ascending: false }),
    invoiceIds.length > 0
      ? admin.from('invoice_items').select('product_name, quantity, line_total').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('clients').select('account_balance').eq('id', clientId).single(),
  ])

  const rawInvoices = (invoicesResult.data ?? []) as RawInvoice[]
  const rawPayments = (paymentsResult.data ?? []) as RawPayment[]
  const rawItems = (itemsResult.data ?? []) as RawInvoiceItem[]

  const classified = rawInvoices.map((invoice) => ({
    ...invoice,
    status: classifyInvoice(invoice, todayStr),
  }))

  const activeInvoices = classified.filter((i) => i.status !== 'cancelled' && i.status !== 'draft')

  const totalInvoiced = activeInvoices.reduce((sum, i) => sum + i.total, 0)
  const totalPaid = activeInvoices.reduce((sum, i) => sum + i.amount_paid, 0)
  const totalOutstanding = activeInvoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + i.balance_due, 0)
  const accountBalance = clientResult.data?.account_balance ?? 0

  const paidCount = activeInvoices.filter((i) => i.status === 'paid').length
  const partialCount = activeInvoices.filter((i) => i.status === 'partial').length
  const dueCount = activeInvoices.filter((i) => i.status === 'due').length
  const overdueCount = activeInvoices.filter((i) => i.status === 'overdue').length

  // Payments on cancelled/draft invoices are excluded from every
  // payment-derived figure (avg days to pay, last payment, collected).
  const validPayments = rawPayments.filter((payment) => {
    const invoice = normaliseOne(payment.invoices)
    return invoice && invoice.status !== 'cancelled' && invoice.status !== 'draft'
  })

  // Average days to pay: one duration per paid invoice (issue date →
  // last payment on that invoice), not per payment row.
  const lastPaymentByInvoice = new Map<string, string>()
  for (const payment of validPayments) {
    if (payment.amount <= 0) continue
    const prev = lastPaymentByInvoice.get(payment.invoice_id)
    if (!prev || payment.payment_date > prev) {
      lastPaymentByInvoice.set(payment.invoice_id, payment.payment_date)
    }
  }
  const paidDurations: number[] = []
  for (const invoice of activeInvoices) {
    if (invoice.status !== 'paid') continue
    const lastPaid = lastPaymentByInvoice.get(invoice.id)
    if (!lastPaid) continue
    const duration = daysBetween(invoice.issue_date, lastPaid)
    if (duration >= 0) paidDurations.push(duration)
  }
  const averageDaysToPay =
    paidDurations.length > 0
      ? Math.round(paidDurations.reduce((sum, d) => sum + d, 0) / paidDurations.length)
      : null
  const lastPaymentAt = validPayments.length > 0 ? validPayments[0].payment_date : null

  // Monthly series (last 12 months)
  const monthlySeries: ClientMonthlyPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const label = monthLabel(d)
    const fullLabel = monthFullLabel(d)
    monthlySeries.push({ label, fullLabel, invoiced: 0, collected: 0, invoiceCount: 0 })
  }

  for (const invoice of activeInvoices) {
    const issueDate = new Date(invoice.issue_date)
    const point = monthlySeries.find((p) => monthFullLabel(issueDate) === p.fullLabel)
    if (point) {
      point.invoiced += invoice.total
      point.invoiceCount += 1
    }
  }

  for (const payment of validPayments) {
    const paymentDate = new Date(payment.payment_date)
    const point = monthlySeries.find((p) => monthFullLabel(paymentDate) === p.fullLabel)
    if (point) {
      point.collected += payment.amount
    }
  }

  // Status breakdown by outstanding amount
  const statusBreakdown: ClientStatusBreakdown[] = [
    { status: 'paid', amount: 0, count: 0 },
    { status: 'partial', amount: 0, count: 0 },
    { status: 'due', amount: 0, count: 0 },
    { status: 'overdue', amount: 0, count: 0 },
  ]
  for (const invoice of activeInvoices) {
    const bucket = statusBreakdown.find((b) => b.status === invoice.status)
    if (bucket) {
      bucket.amount += invoice.balance_due
      bucket.count += 1
    }
  }

  // Top products by revenue
  const productMap = new Map<string, { quantity: number; revenue: number }>()
  for (const item of rawItems) {
    const existing = productMap.get(item.product_name) ?? { quantity: 0, revenue: 0 }
    existing.quantity += item.quantity
    existing.revenue += item.line_total
    productMap.set(item.product_name, existing)
  }
  const topProducts = Array.from(productMap.entries())
    .map(([name, data]) => ({ name, quantity: data.quantity, revenue: data.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  // Ageing buckets
  const ageingBuckets: ClientAgeingBucket[] = [
    { label: 'Current', amount: 0, count: 0 },
    { label: '1–30 days', amount: 0, count: 0 },
    { label: '31–60 days', amount: 0, count: 0 },
    { label: '61–90 days', amount: 0, count: 0 },
    { label: '90+ days', amount: 0, count: 0 },
  ]
  for (const invoice of activeInvoices) {
    if (invoice.status === 'paid') continue
    const due = invoice.due_date ? invoice.due_date : invoice.issue_date
    const days = daysBetween(due, todayStr)
    let bucket: ClientAgeingBucket
    if (days <= 0) bucket = ageingBuckets[0]
    else if (days <= 30) bucket = ageingBuckets[1]
    else if (days <= 60) bucket = ageingBuckets[2]
    else if (days <= 90) bucket = ageingBuckets[3]
    else bucket = ageingBuckets[4]
    bucket.amount += invoice.balance_due
    bucket.count += 1
  }

  return {
    totalInvoiced,
    totalPaid,
    totalOutstanding,
    accountBalance,
    invoiceCount: activeInvoices.length,
    paidCount,
    partialCount,
    dueCount,
    overdueCount,
    averageDaysToPay,
    lastPaymentAt,
    buyingVolume: activeInvoices.reduce((sum, i) => sum + i.total, 0),
    monthlySeries,
    statusBreakdown,
    topProducts,
    ageingBuckets,
  }
}
