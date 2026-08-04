'use server'

import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { daysBetween } from '@/lib/utils'
import { DASHBOARD_RANGES, type DashboardRange } from '@/lib/dashboard-config'
import type {
  InvoiceStatusBucket,
  StatusBreakdownItem,
  AgingBucket,
  DueInvoice,
  PaymentDuration,
  InvoiceKpiMetrics,
  Trend,
} from '@/lib/dashboard-types'

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  // Build from LOCAL components: toISOString() returns the UTC date,
  // which can be a day ahead/behind the operator's local day. Must stay
  // in lockstep with the copy in lib/dashboard.ts or the two dashboards
  // disagree at the day boundary.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw data types
// ─────────────────────────────────────────────────────────────────────────────

interface RawClient {
  first_name: string | null
  last_name: string | null
  company_name: string | null
}

interface RawInvoice {
  id: string
  document_number: string
  issue_date: string
  due_date: string | null
  created_at: string | null
  total: number
  amount_paid: number
  balance_due: number
  status: string
  type: 'invoice' | 'quotation'
  client_id: string
  clients: RawClient | RawClient[] | null
}

interface RawPayment {
  id: string
  amount: number
  payment_date: string
  invoice_id: string
  invoices: { type: 'invoice' | 'quotation'; status: string } | { type: 'invoice' | 'quotation'; status: string }[] | null
}

interface RawCollectionPayment {
  id: string
  payment_date: string
  invoice_id: string
  invoices:
    | { type: 'invoice' | 'quotation'; status: string; issue_date: string }
    | { type: 'invoice' | 'quotation'; status: string; issue_date: string }[]
    | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification algorithm
// ─────────────────────────────────────────────────────────────────────────────

function classifyInvoice(invoice: RawInvoice, todayStr: string): InvoiceStatusBucket {
  if (invoice.status === 'cancelled') return 'cancelled'
  if (invoice.status === 'draft') return 'draft'
  if (invoice.balance_due <= 0) return 'paid'
  // Overdue takes precedence over partial: a partially-paid invoice that is
  // past its due date is still overdue debt (matches money-collection.ts,
  // which derives overdue purely from due date + outstanding balance).
  if (invoice.due_date && invoice.due_date < todayStr) return 'overdue'
  if (invoice.amount_paid > 0) return 'partial'
  return 'due'
}

function getClientName(client: RawClient | null): string {
  if (!client) return 'Unknown'
  return client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Unknown'
}

function normaliseOne<T>(value: T | T[] | null): T | null {
  if (value === null || value === undefined) return null
  return Array.isArray(value) ? value[0] : value
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceDashboardMetrics {
  statusBreakdown: StatusBreakdownItem[]
  collectedToday: number
  dueTodayTotal: number
  dueTodayInvoices: DueInvoice[]
  upcomingDueTotal: number
  upcomingDueInvoices: DueInvoice[]
  overdueTotal: number
  overdueInvoices: DueInvoice[]
  dueThisWeekTotal: number
  averageDaysOverdue: number
  agingBuckets: AgingBucket[]
  totalOutstanding: number
  /** Outstanding invoices only — anything not paid/cancelled with a
   *  remaining balance. Drives the "Invoices to collect" table on
   *  the Invoices dashboard. */
  allInvoices: DueInvoice[]
  paymentDurations: PaymentDuration[]
  asOfDate: string

  /** Top-line KPI strip for the Due Dashboard tab. Mirrors the analytics
   *  page KPI cards so both surfaces show the same headline numbers.
   *  Null when the operator is not allowed to see invoice money. */
  kpiMetrics: InvoiceKpiMetrics | null
}

/**
 * Compute the same top-line KPIs used by the analytics page KPI strip, but
 * from a pre-loaded set of classified invoices. This lets the invoices page
 * surface the KPI strip on the Due Dashboard tab without an extra round-trip
 * to Supabase and without requiring the separate `see_dashboard` permission.
 */
function computeInvoiceKpiMetrics(
  classifiedInvoices: Array<{
    issue_date: string
    total: number
    amount_paid: number
    balance_due: number
    status: InvoiceStatusBucket
    isActive: boolean
  }>,
  range: DashboardRange,
  today: Date,
  todayStr: string
): InvoiceKpiMetrics {
  const windowDays = DASHBOARD_RANGES[range].windowDays
  const currentPeriodStart = toISODate(addDays(today, -(windowDays - 1)))
  const previousPeriodStart = toISODate(addDays(today, -(windowDays * 2 - 1)))
  const previousPeriodEnd = toISODate(addDays(today, -windowDays))

  const activeInvoices = classifiedInvoices.filter((i) => i.isActive)
  const rangeInvoices = activeInvoices.filter(
    (i) => i.issue_date >= currentPeriodStart && i.issue_date <= todayStr
  )

  const totalSales = rangeInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  const totalCollected = rangeInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
  const totalOutstanding = rangeInvoices
    .filter((i) => i.balance_due > 0)
    .reduce((sum, i) => sum + i.balance_due, 0)
  const totalOverdue = rangeInvoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + i.balance_due, 0)
  const collectionRate = totalSales > 0 ? totalCollected / totalSales : 0
  const invoiceCount = rangeInvoices.length

  function computeTrend(
    currentFilter: (i: (typeof classifiedInvoices)[number]) => boolean,
    previousFilter: (i: (typeof classifiedInvoices)[number]) => boolean,
    valueExtractor: (i: (typeof classifiedInvoices)[number]) => number
  ): Trend {
    const current = classifiedInvoices.filter(currentFilter).reduce((sum, i) => sum + valueExtractor(i), 0)
    const previous = classifiedInvoices.filter(previousFilter).reduce((sum, i) => sum + valueExtractor(i), 0)
    const change = current - previous
    // "New" activity (nothing in the previous window, something now) has
    // no meaningful percentage — signal it with null so the UI renders
    // "new" instead of a misleading 0.0% flat. Mirrors lib/dashboard.ts.
    if (previous === 0 && current > 0) {
      return { current, previous, change, percentage: null, direction: 'up' }
    }
    const percentage = previous !== 0 ? change / previous : 0
    return {
      current,
      previous,
      change,
      percentage,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    }
  }

  const activeInPeriod = (i: (typeof classifiedInvoices)[number], start: string, end: string) =>
    i.isActive && i.issue_date >= start && i.issue_date <= end

  const salesTrend = computeTrend(
    (i) => activeInPeriod(i, currentPeriodStart, todayStr),
    (i) => activeInPeriod(i, previousPeriodStart, previousPeriodEnd),
    (i) => i.total
  )

  const collectedTrend = computeTrend(
    (i) => activeInPeriod(i, currentPeriodStart, todayStr),
    (i) => activeInPeriod(i, previousPeriodStart, previousPeriodEnd),
    (i) => i.amount_paid
  )

  const currentPeriodInvoices = classifiedInvoices.filter((i) => activeInPeriod(i, currentPeriodStart, todayStr))
  const previousPeriodInvoices = classifiedInvoices.filter((i) => activeInPeriod(i, previousPeriodStart, previousPeriodEnd))
  const currentPeriodSales = currentPeriodInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  const currentPeriodCollected = currentPeriodInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
  const previousPeriodSales = previousPeriodInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  const previousPeriodCollected = previousPeriodInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
  const currentCollectionRate = currentPeriodSales > 0 ? currentPeriodCollected / currentPeriodSales : 0
  const previousCollectionRate = previousPeriodSales > 0 ? previousPeriodCollected / previousPeriodSales : 0
  const collectionRateTrend: Trend = {
    current: currentCollectionRate,
    previous: previousCollectionRate,
    change: currentCollectionRate - previousCollectionRate,
    percentage: previousCollectionRate !== 0 ? (currentCollectionRate - previousCollectionRate) / previousCollectionRate : 0,
    direction:
      currentCollectionRate > previousCollectionRate
        ? 'up'
        : currentCollectionRate < previousCollectionRate
          ? 'down'
          : 'flat',
  }

  const outstandingTrend = computeTrend(
    (i) =>
      i.isActive &&
      i.balance_due > 0 &&
      i.issue_date >= currentPeriodStart &&
      i.issue_date <= todayStr,
    (i) =>
      i.isActive &&
      i.balance_due > 0 &&
      i.issue_date >= previousPeriodStart &&
      i.issue_date <= previousPeriodEnd,
    (i) => i.balance_due
  )

  const overdueTrend = computeTrend(
    (i) =>
      !!(
        i.isActive &&
        i.status === 'overdue' &&
        i.issue_date >= currentPeriodStart &&
        i.issue_date <= todayStr
      ),
    (i) =>
      !!(
        i.isActive &&
        i.status === 'overdue' &&
        i.issue_date >= previousPeriodStart &&
        i.issue_date <= previousPeriodEnd
      ),
    (i) => i.balance_due
  )

  interface SeriesBucket {
    start: string
    end: string
  }

  const seriesBuckets: SeriesBucket[] = []
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i)
      const iso = toISODate(d)
      seriesBuckets.push({ start: iso, end: iso })
    }
  } else if (range === 'month') {
    // Six 5-day buckets covering exactly the same 30-day window as the
    // KPIs (previously 7-day buckets produced a 42-day chart window).
    // Mirrors lib/dashboard.ts.
    for (let i = 5; i >= 0; i--) {
      const end = addDays(today, -i * 5)
      const start = addDays(end, -4)
      seriesBuckets.push({ start: toISODate(start), end: toISODate(end) })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = addMonths(today, -i)
      const start = toISODate(startOfMonth(d))
      const end = toISODate(addDays(addMonths(d, 1), -1))
      seriesBuckets.push({ start, end })
    }
  }

  const salesSeries: number[] = seriesBuckets.map((b) =>
    activeInvoices
      .filter((i) => i.issue_date >= b.start && i.issue_date <= b.end)
      .reduce((sum, i) => sum + (i.total || 0), 0)
  )

  const collectedSeries: number[] = seriesBuckets.map((b) =>
    activeInvoices
      .filter((i) => i.issue_date >= b.start && i.issue_date <= b.end)
      .reduce((sum, i) => sum + (i.amount_paid || 0), 0)
  )

  return {
    totalSales,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    collectionRate,
    invoiceCount,
    salesTrend,
    collectedTrend,
    collectionRateTrend,
    outstandingTrend,
    overdueTrend,
    salesSeries,
    collectedSeries,
  }
}

/**
 * Invoice-focused dashboard metrics.
 *
 * Unlike the main sales dashboard, this is not scoped to a date range. It
 * surfaces every outstanding invoice and every payment-status bucket so the
 * invoices page can act as the central place for collections/due management.
 */
export async function getInvoiceDashboardMetrics(): Promise<InvoiceDashboardMetrics> {
  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.see_invoices)) {
    throw new Error('Not authorised')
  }

  const canSeeMoney = operator.isAdmin || operator.permissions.invoices_see_money

  const supabase = await createClient()
  const today = new Date()
  const todayStr = toISODate(today)
  const collectionWindowStart = toISODate(addDays(today, -365))

  const [invoicesResult, paymentsResult, collectionPaymentsResult] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, document_number, issue_date, due_date, created_at, total, amount_paid, balance_due, status, type, client_id, clients(first_name, last_name, company_name)'
      )
      .eq('type', 'invoice')
      .is('deleted_at', null)
      .order('issue_date', { ascending: false })
      .limit(5000),
    supabase
      .from('payments')
      .select('id, amount, payment_date, invoice_id, invoices!inner(type, status)')
      .is('deleted_at', null)
      .is('invoices.deleted_at', null)
      .eq('invoices.type', 'invoice')
      .eq('payment_date', todayStr)
      .limit(5000),
    supabase
      .from('payments')
      .select('id, payment_date, invoice_id, invoices!inner(type, status, issue_date)')
      .gte('payment_date', collectionWindowStart)
      .is('deleted_at', null)
      .is('invoices.deleted_at', null)
      .eq('invoices.type', 'invoice')
      .order('payment_date', { ascending: false })
      .limit(5000),
  ])

  // PostgREST silently truncates at the .limit() cap — surface that in the
  // logs so understated dashboard figures are diagnosable.
  if ((invoicesResult.data?.length ?? 0) === 5000) {
    console.warn('invoice-dashboard: result truncated at 5000 rows')
  }
  if ((paymentsResult.data?.length ?? 0) === 5000) {
    console.warn('invoice-dashboard: result truncated at 5000 rows')
  }
  if ((collectionPaymentsResult.data?.length ?? 0) === 5000) {
    console.warn('invoice-dashboard: result truncated at 5000 rows')
  }

  // If the caller cannot see money, redact all financial values before any
  // further computation. This keeps the dashboard shell (status counts, due
  // lists) available to staff with only see_invoices, while hiding £ amounts.
  if (!canSeeMoney) {
    return {
      statusBreakdown: [],
      collectedToday: 0,
      dueTodayTotal: 0,
      dueTodayInvoices: [],
      upcomingDueTotal: 0,
      upcomingDueInvoices: [],
      overdueTotal: 0,
      overdueInvoices: [],
      dueThisWeekTotal: 0,
      averageDaysOverdue: 0,
      agingBuckets: [
        { label: 'Current', minDays: Number.MIN_SAFE_INTEGER, maxDays: 0, amount: 0, count: 0, color: '#16a34a' },
        { label: '1 – 30 days', minDays: 1, maxDays: 30, amount: 0, count: 0, color: '#f59e0b' },
        { label: '31 – 60 days', minDays: 31, maxDays: 60, amount: 0, count: 0, color: '#f97316' },
        { label: '61 – 90 days', minDays: 61, maxDays: 90, amount: 0, count: 0, color: '#ef4444' },
        { label: '90+ days', minDays: 91, maxDays: Number.MAX_SAFE_INTEGER, amount: 0, count: 0, color: '#b91c1c' },
      ],
      totalOutstanding: 0,
      allInvoices: [],
      paymentDurations: [],
      asOfDate: todayStr,
      kpiMetrics: null,
    }
  }

  const rawInvoices = (invoicesResult.data ?? []) as RawInvoice[]
  const rawPayments = (paymentsResult.data ?? []) as RawPayment[]
  const rawCollectionPayments = (collectionPaymentsResult.data ?? []) as RawCollectionPayment[]

  const classifiedInvoices = rawInvoices.map((invoice) => {
    const client = normaliseOne(invoice.clients)
    const status = classifyInvoice(invoice, todayStr)
    return {
      ...invoice,
      clientName: getClientName(client),
      status,
      isActive: status !== 'cancelled' && status !== 'draft',
      isOutstanding: status === 'due' || status === 'overdue' || status === 'partial',
    }
  })

  // ── Status breakdown ─────────────────────────────────────────────────────
  const statusConfig: Record<
    Exclude<InvoiceStatusBucket, 'draft' | 'cancelled'>,
    { label: string; color: string; amountFrom: 'total' | 'balance' }
  > = {
    paid: { label: 'Paid', color: '#16a34a', amountFrom: 'total' },
    partial: { label: 'Partial', color: '#2563eb', amountFrom: 'total' },
    due: { label: 'Due', color: '#f59e0b', amountFrom: 'balance' },
    overdue: { label: 'Overdue', color: '#dc2626', amountFrom: 'balance' },
  }

  const statusBreakdown: StatusBreakdownItem[] = (
    ['paid', 'partial', 'due', 'overdue'] as const
  ).map((status) => {
    const items = classifiedInvoices.filter((i) => i.status === status)
    const config = statusConfig[status]
    const amount = items.reduce(
      (sum, i) => sum + (config.amountFrom === 'balance' ? i.balance_due : i.total),
      0
    )
    return {
      status,
      count: items.length,
      amount,
      label: config.label,
      color: config.color,
    }
  })

  // ── Collections focus ────────────────────────────────────────────────────
  const collectedToday = rawPayments
    .filter((p) => {
      const invoice = normaliseOne(p.invoices)
      return (
        invoice?.type === 'invoice' &&
        invoice?.status !== 'cancelled' &&
        invoice?.status !== 'draft'
      )
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const buildDueInvoice = (invoice: (typeof classifiedInvoices)[number]): DueInvoice => {
    const daysOverdue = invoice.due_date
      ? Math.max(0, daysBetween(invoice.due_date, todayStr))
      : 0
    return {
      id: invoice.id,
      document_number: invoice.document_number,
      clientName: invoice.clientName,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      created_at: invoice.created_at,
      total: invoice.total,
      balance_due: invoice.balance_due,
      daysOverdue,
      status: invoice.status,
    }
  }

  const dueTodayInvoices = classifiedInvoices
    .filter((i) => i.due_date === todayStr && i.balance_due > 0 && i.isActive)
    .map(buildDueInvoice)
    .sort((a, b) => b.balance_due - a.balance_due)

  const dueTodayTotal = dueTodayInvoices.reduce((sum, i) => sum + i.balance_due, 0)

  const upcomingDueWindowStr = toISODate(addDays(today, 14))
  const upcomingDueInvoices = classifiedInvoices
    .filter(
      (i) =>
        i.due_date &&
        i.due_date > todayStr &&
        i.due_date <= upcomingDueWindowStr &&
        i.balance_due > 0 &&
        i.isActive
    )
    .map(buildDueInvoice)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  const upcomingDueTotal = upcomingDueInvoices.reduce((sum, i) => sum + i.balance_due, 0)

  const overdueInvoices = classifiedInvoices
    .filter((i) => i.status === 'overdue' && i.balance_due > 0)
    .map(buildDueInvoice)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.balance_due, 0)

  const nextWeekStr = toISODate(addDays(today, 7))
  const dueThisWeekTotal = classifiedInvoices
    .filter(
      (i) =>
        i.due_date &&
        i.due_date > todayStr &&
        i.due_date <= nextWeekStr &&
        i.balance_due > 0 &&
        i.isActive
    )
    .reduce((sum, i) => sum + i.balance_due, 0)

  const averageDaysOverdue =
    overdueInvoices.length > 0
      ? overdueInvoices.reduce((sum, i) => sum + i.daysOverdue, 0) / overdueInvoices.length
      : 0

  // ── Aging buckets ────────────────────────────────────────────────────────
  const agingBuckets: AgingBucket[] = [
    { label: 'Current', minDays: Number.MIN_SAFE_INTEGER, maxDays: 0, amount: 0, count: 0, color: '#16a34a' },
    { label: '1 – 30 days', minDays: 1, maxDays: 30, amount: 0, count: 0, color: '#f59e0b' },
    { label: '31 – 60 days', minDays: 31, maxDays: 60, amount: 0, count: 0, color: '#f97316' },
    { label: '61 – 90 days', minDays: 61, maxDays: 90, amount: 0, count: 0, color: '#ef4444' },
    { label: '90+ days', minDays: 91, maxDays: Number.MAX_SAFE_INTEGER, amount: 0, count: 0, color: '#b91c1c' },
  ]

  classifiedInvoices
    .filter((i) => i.isActive && i.balance_due > 0 && i.due_date)
    .forEach((i) => {
      const dueDate = i.due_date!
      const daysOverdue = daysBetween(dueDate, todayStr)
      const bucket = agingBuckets.find(
        (b) => daysOverdue >= b.minDays && (b.maxDays === null || daysOverdue <= b.maxDays)
      )
      if (bucket) {
        bucket.amount += i.balance_due
        bucket.count += 1
      }
    })

  const totalOutstanding = classifiedInvoices
    .filter((i) => i.isActive && i.balance_due > 0)
    .reduce((sum, i) => sum + i.balance_due, 0)

  // Outstanding-only list. The "Invoices to collect" table on the
  // Invoices dashboard is the depth-of-collection queue — the
  // operator works it to chase money that is actually owed. We
  // therefore drop:
  //   • paid invoices (zero balance, nothing to collect)
  //   • cancelled invoices (won't be paid, don't belong in the queue)
  //   • drafts (haven't been sent yet — there's no debtor to
  //     chase; sending the invoice is a separate action tracked
  //     elsewhere on the page)
  // The classification step above already separates these into
  // their own buckets, so a simple NOT IN filter does the job. The
  // balance_due > 0 guard is belt-and-braces — paid invoices should
  // have zero balance by construction, but if a future migration
  // leaves a row in a weird state, we still hide it.
  const allInvoices = classifiedInvoices
    .filter(
      (i) =>
        i.type === 'invoice' &&
        i.status !== 'paid' &&
        i.status !== 'cancelled' &&
        i.status !== 'draft' &&
        i.balance_due > 0
    )
    .map(buildDueInvoice)
    .sort((a, b) =>
      (a.created_at ?? a.issue_date ?? '').localeCompare(b.created_at ?? b.issue_date ?? '')
    )

  const invoiceIssueDateById = new Map(rawInvoices.map((i) => [i.id, i.issue_date]))
  const paymentDurations: PaymentDuration[] = rawCollectionPayments
    .map((p) => {
      const invoice = normaliseOne(p.invoices)
      if (
        !invoice ||
        invoice.type !== 'invoice' ||
        invoice.status === 'draft' ||
        invoice.status === 'cancelled'
      ) {
        return null
      }
      const issueDate = invoice.issue_date ?? invoiceIssueDateById.get(p.invoice_id)
      if (!issueDate || !p.payment_date) return null
      const daysToPay = daysBetween(issueDate, p.payment_date)
      if (daysToPay < 0 || daysToPay > 365) return null
      return { paymentDate: p.payment_date, daysToPay }
    })
    .filter((d): d is PaymentDuration => d !== null)

  // Top-line KPI strip for the Due Dashboard tab. Defaults to the same
  // 30-day window as the Analytics page so both surfaces stay comparable.
  const kpiMetrics = computeInvoiceKpiMetrics(classifiedInvoices, 'month', today, todayStr)

  return {
    statusBreakdown,
    collectedToday,
    dueTodayTotal,
    dueTodayInvoices,
    upcomingDueTotal,
    upcomingDueInvoices,
    overdueTotal,
    overdueInvoices,
    dueThisWeekTotal,
    averageDaysOverdue,
    agingBuckets,
    totalOutstanding,
    allInvoices,
    paymentDurations,
    asOfDate: todayStr,
    kpiMetrics,
  }
}
