'use server'

import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { daysBetween } from '@/lib/utils'
import { DASHBOARD_RANGES, type DashboardRange } from '@/lib/dashboard-config'
import type {
  SalesSeriesPoint,
  Trend,
  DashboardMetrics,
} from '@/lib/dashboard-types'

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  // Build from LOCAL components: toISOString() returns the UTC date,
  // which can be a day ahead/behind the operator's local day.
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

// ─────────────────────────────────────────────────────────────────────────────
// Classification algorithm
// ─────────────────────────────────────────────────────────────────────────────

function classifyInvoice(invoice: RawInvoice, todayStr: string) {
  if (invoice.status === 'cancelled') return 'cancelled' as const
  if (invoice.status === 'draft') return 'draft' as const
  if (invoice.balance_due <= 0) return 'paid' as const
  // Overdue takes precedence over partial: a partially-paid invoice that is
  // past its due date is still overdue debt (matches money-collection.ts,
  // which derives overdue purely from due date + outstanding balance).
  if (invoice.due_date && invoice.due_date < todayStr) return 'overdue' as const
  if (invoice.amount_paid > 0) return 'partial' as const
  return 'due' as const
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

export async function getDashboardMetrics(
  range: DashboardRange = 'month'
): Promise<DashboardMetrics> {
  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.see_dashboard)) {
    throw new Error('Not authorised')
  }

  // The dashboard is revenue-focused. Only admins or staff explicitly granted
  // money visibility may load the full KPI set.
  if (!operator.isAdmin && !operator.permissions.invoices_see_money) {
    throw new Error('Not authorised')
  }

  const supabase = await createClient()
  const today = new Date()
  const todayStr = toISODate(today)

  const rangeConfig = DASHBOARD_RANGES[range]
  const windowDays = rangeConfig.windowDays

  // KPI / trend windows for the active range. We compare the current window
  // to the immediately preceding window of equal length.
  const currentPeriodStart = toISODate(addDays(today, -(windowDays - 1)))
  const previousPeriodStart = toISODate(addDays(today, -(windowDays * 2 - 1)))
  const previousPeriodEnd = toISODate(addDays(today, -windowDays))

  // Fetch enough history to cover the largest range (year) plus its prior
  // comparison window: ~24 months. We pull 25 months of invoices/payments.
  const windowStart = addMonths(today, -25)
  const windowStartStr = toISODate(windowStart)

  // Paginated explicitly: PostgREST silently caps unpaginated queries at
  // 1000 rows, which would understate every KPI at scale. Both queries
  // still run in parallel (mirrors loadMoneyCollectionSnapshot).
  const PAGE_SIZE = 1000
  const MAX_PAGES = 50

  // Partial demo schemas may lack soft-delete columns (migration 093).
  // Prefer filtering deleted rows when the column exists; otherwise load
  // without the filter so Analytics still renders.
  let filterInvoiceDeletedAt = true
  let filterPaymentDeletedAt = true

  function isMissingDeletedAtError(message: string | undefined): boolean {
    const msg = (message ?? '').toLowerCase()
    return msg.includes('deleted_at') && msg.includes('does not exist')
  }

  const [rawInvoices, rawPayments] = await Promise.all([
    (async () => {
      const rows: RawInvoice[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE
        let query = supabase
          .from('invoices')
          .select(
            'id, document_number, issue_date, due_date, total, amount_paid, balance_due, status, type, client_id, clients(first_name, last_name, company_name)'
          )
          .eq('type', 'invoice')
        if (filterInvoiceDeletedAt) {
          query = query.is('deleted_at', null)
        }
        // Always include every outstanding invoice, however old —
        // unpaid debt older than the window must still feed the
        // dueToday / overdue / dueThisWeek KPIs. Paid history stays
        // windowed for performance.
        const { data, error } = await query
          .or(`balance_due.gt.0,issue_date.gte.${windowStartStr}`)
          .order('issue_date', { ascending: false })
          // Unique tiebreaker: offset pagination over a non-unique order
          // can double-count or skip rows at page boundaries.
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error && filterInvoiceDeletedAt && isMissingDeletedAtError(error.message)) {
          console.warn(
            'getDashboardMetrics: invoices.deleted_at missing; retrying without soft-delete filter'
          )
          filterInvoiceDeletedAt = false
          page -= 1
          continue
        }
        if (error) {
          console.warn('getDashboardMetrics: invoice query failed', error.message)
          throw new Error('Dashboard data load failed')
        }
        const pageRows = (data ?? []) as RawInvoice[]
        rows.push(...pageRows)
        if (pageRows.length < PAGE_SIZE) break
        if (page === MAX_PAGES - 1) {
          console.warn('getDashboardMetrics: invoice result truncated at safety cap')
        }
      }
      return rows
    })(),
    (async () => {
      const rows: RawPayment[] = []
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE
        let query = supabase
          .from('payments')
          .select('id, amount, payment_date, invoice_id, invoices!inner(type, status, issue_date)')
          .eq('invoices.type', 'invoice')
          .gte('payment_date', windowStartStr)
        if (filterPaymentDeletedAt) {
          query = query.is('deleted_at', null).is('invoices.deleted_at', null)
        }
        const { data, error } = await query
          .order('payment_date', { ascending: false })
          // Unique tiebreaker for offset pagination (see above).
          .order('id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1)

        if (error && filterPaymentDeletedAt && isMissingDeletedAtError(error.message)) {
          console.warn(
            'getDashboardMetrics: payments/invoices.deleted_at missing; retrying without soft-delete filter'
          )
          filterPaymentDeletedAt = false
          page -= 1
          continue
        }
        if (error) {
          console.warn('getDashboardMetrics: payments query failed', error.message)
          throw new Error('Dashboard data load failed')
        }
        const pageRows = (data ?? []) as RawPayment[]
        rows.push(...pageRows)
        if (pageRows.length < PAGE_SIZE) break
        if (page === MAX_PAGES - 1) {
          console.warn('getDashboardMetrics: payments result truncated at safety cap')
        }
      }
      return rows
    })(),
  ])

  // ── Classification ───────────────────────────────────────────────────────
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

  // ── Core KPIs (scoped to the active range window) ───────────────────────
  const activeInvoices = classifiedInvoices.filter((i) => i.isActive)
  const rangeInvoices = activeInvoices.filter(
    (i) => i.issue_date >= currentPeriodStart && i.issue_date <= todayStr
  )

  const totalSales = rangeInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  // Cash collected in the range window (payments received, by payment_date)
  // — the same definition used by the charts and money-collection snapshot.
  const totalCollected = collectedInWindow(currentPeriodStart, todayStr)
  const totalOutstanding = rangeInvoices
    .filter((i) => i.balance_due > 0)
    .reduce((sum, i) => sum + i.balance_due, 0)
  const totalOverdue = rangeInvoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + i.balance_due, 0)
  const collectionRate = totalSales > 0 ? totalCollected / totalSales : 0
  const invoiceCount = rangeInvoices.length

  // ── Trends (current range window vs previous range window) ───────────────
  function computeTrend(
    currentFilter: (i: (typeof classifiedInvoices)[number]) => boolean,
    previousFilter: (i: (typeof classifiedInvoices)[number]) => boolean,
    valueExtractor: (i: (typeof classifiedInvoices)[number]) => number
  ): Trend {
    const current = classifiedInvoices.filter(currentFilter).reduce((sum, i) => sum + valueExtractor(i), 0)
    const previous = classifiedInvoices.filter(previousFilter).reduce((sum, i) => sum + valueExtractor(i), 0)
    return buildTrend(current, previous)
  }

  function buildTrend(current: number, previous: number): Trend {
    const change = current - previous
    // "New" activity (nothing in the previous window, something now) has
    // no meaningful percentage — signal it with null so the UI renders
    // "new" instead of a misleading 0.0% flat.
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

  // Cash received within a window (by payment_date). This is the single
  // definition of "collected" used everywhere on the dashboard — SalesChart,
  // MoneyCollectionHero and TodaySnapshot all derive collected from payments
  // received in the period (lib/money-collection.ts), so the KPI figures now
  // reconcile with the charts and with bank receipts.
  function collectedInWindow(start: string, end: string): number {
    return rawPayments
      .filter((p) => {
        const invoice = normaliseOne(p.invoices)
        return (
          p.payment_date >= start &&
          p.payment_date <= end &&
          invoice?.type === 'invoice' &&
          invoice?.status !== 'cancelled' &&
          invoice?.status !== 'draft'
        )
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0)
  }

  const activeInPeriod = (i: (typeof classifiedInvoices)[number], start: string, end: string) =>
    i.isActive && i.issue_date >= start && i.issue_date <= end

  const salesTrend = computeTrend(
    (i) => activeInPeriod(i, currentPeriodStart, todayStr),
    (i) => activeInPeriod(i, previousPeriodStart, previousPeriodEnd),
    (i) => i.total
  )

  const collectedTrend = buildTrend(
    collectedInWindow(currentPeriodStart, todayStr),
    collectedInWindow(previousPeriodStart, previousPeriodEnd)
  )

  const currentPeriodInvoices = classifiedInvoices.filter((i) => activeInPeriod(i, currentPeriodStart, todayStr))
  const previousPeriodInvoices = classifiedInvoices.filter((i) => activeInPeriod(i, previousPeriodStart, previousPeriodEnd))
  const currentPeriodSales = currentPeriodInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  const currentPeriodCollected = collectedInWindow(currentPeriodStart, todayStr)
  const previousPeriodSales = previousPeriodInvoices.reduce((sum, i) => sum + (i.total || 0), 0)
  const previousPeriodCollected = collectedInWindow(previousPeriodStart, previousPeriodEnd)
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

  // ── Collections focus (counts/totals consumed by TodaySnapshot) ─────────
  const collectedToday = rawPayments
    .filter((p) => {
      const invoice = normaliseOne(p.invoices)
      return (
        p.payment_date === todayStr &&
        invoice?.type === 'invoice' &&
        invoice?.status !== 'cancelled' &&
        invoice?.status !== 'draft'
      )
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0)

  const dueTodayInvoices = classifiedInvoices.filter(
    (i) => i.due_date === todayStr && i.balance_due > 0 && i.isActive
  )
  const dueTodayTotal = dueTodayInvoices.reduce((sum, i) => sum + i.balance_due, 0)
  const dueTodayInvoicesCount = dueTodayInvoices.length

  const overdueInvoices = classifiedInvoices.filter(
    (i) => i.status === 'overdue' && i.balance_due > 0
  )
  const overdueTotal = overdueInvoices.reduce((sum, i) => sum + i.balance_due, 0)
  const overdueInvoicesCount = overdueInvoices.length
  const averageDaysOverdue =
    overdueInvoices.length > 0
      ? overdueInvoices.reduce((sum, i) => {
          if (!i.due_date) return sum
          return sum + Math.max(0, daysBetween(i.due_date, todayStr))
        }, 0) / overdueInvoices.length
      : 0

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

  // ── Sales time series (resolution driven by the active range) ────────────
  interface SeriesBucket {
    label: string
    fullLabel: string
    start: string
    end: string
  }

  function formatMonthLabel(date: Date): string {
    return date.toLocaleString('en-GB', { month: 'short' })
  }

  function formatFullMonth(date: Date): string {
    return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' })
  }

  function formatDayLabel(date: Date): string {
    return date.toLocaleString('en-GB', { day: 'numeric', month: 'short' })
  }

  function formatWeekdayLabel(date: Date): string {
    return date.toLocaleString('en-GB', { weekday: 'short' })
  }

  function formatDateRangeLabel(start: Date, end: Date): string {
    return `${formatDayLabel(start)} – ${formatDayLabel(end)}`
  }

  const seriesBuckets: SeriesBucket[] = []
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i)
      const iso = toISODate(d)
      seriesBuckets.push({
        label: formatWeekdayLabel(d),
        fullLabel: formatDayLabel(d),
        start: iso,
        end: iso,
      })
    }
  } else if (range === 'month') {
    // Six 5-day buckets covering exactly the same 30-day window as the
    // KPIs (previously 7-day buckets produced a 42-day chart window).
    for (let i = 5; i >= 0; i--) {
      const end = addDays(today, -i * 5)
      const start = addDays(end, -4)
      seriesBuckets.push({
        label: formatDayLabel(start),
        fullLabel: formatDateRangeLabel(start, end),
        start: toISODate(start),
        end: toISODate(end),
      })
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = addMonths(today, -i)
      const start = toISODate(startOfMonth(d))
      const end = toISODate(addDays(addMonths(d, 1), -1))
      seriesBuckets.push({
        label: formatMonthLabel(d),
        fullLabel: formatFullMonth(d),
        start,
        end,
      })
    }
  }

  const salesSeries: SalesSeriesPoint[] = seriesBuckets.map((b) => {
    const bucketInvoices = activeInvoices.filter(
      (i) => i.issue_date >= b.start && i.issue_date <= b.end
    )
    const bucketPayments = rawPayments.filter((p) => {
      const invoice = normaliseOne(p.invoices)
      return (
        p.payment_date >= b.start &&
        p.payment_date <= b.end &&
        invoice?.type === 'invoice' &&
        invoice?.status !== 'cancelled' &&
        invoice?.status !== 'draft'
      )
    })
    return {
      label: b.label,
      fullLabel: b.fullLabel,
      invoiced: bucketInvoices.reduce((sum, i) => sum + i.total, 0),
      collected: bucketPayments.reduce((sum, p) => sum + p.amount, 0),
      invoiceCount: bucketInvoices.length,
    }
  })

  return {
    range,
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
    collectedToday,
    dueTodayTotal,
    dueTodayInvoicesCount,
    overdueTotal,
    overdueInvoicesCount,
    dueThisWeekTotal,
    averageDaysOverdue,
    salesSeries,
    asOfDate: todayStr,
    currency: 'GBP',
  }
}