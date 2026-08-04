import type { DashboardRange } from './dashboard-config'

export type InvoiceStatusBucket = 'paid' | 'partial' | 'due' | 'overdue' | 'draft' | 'cancelled'

export interface StatusBreakdownItem {
  status: InvoiceStatusBucket
  count: number
  amount: number
  label: string
  color: string
}

export interface AgingBucket {
  label: string
  minDays: number
  maxDays: number | null
  amount: number
  count: number
  /** Optional legacy override — the chart now derives its tone from
   *  minDays / maxDays via the bucketTone() helper, so most callers
   *  don't need to provide this. Kept on the type for backwards
   *  compatibility with any caller still passing a pre-coloured
   *  bucket array. */
  color?: string
}

export interface PaymentDuration {
  paymentDate: string
  daysToPay: number
}

export interface CollectionTimePoint {
  label: string
  fullLabel: string
  /** null when the bucket has no payments (chart renders a gap). */
  averageDays: number | null
  paymentCount: number
}

export interface SalesSeriesPoint {
  label: string
  fullLabel: string
  invoiced: number
  collected: number
  invoiceCount: number
}

export interface ClientSalesItem {
  name: string
  total: number
}

export interface ProductSalesItem {
  name: string
  code: string | null
  total: number
}

export interface DueInvoice {
  id: string
  document_number: string
  clientName: string
  issue_date: string | null
  due_date: string | null
  /** When the invoice record was created in the system (ISO timestamp). */
  created_at: string | null
  total: number
  balance_due: number
  daysOverdue: number
  status: InvoiceStatusBucket
}

export interface Trend {
  current: number
  previous: number
  change: number
  /** change / previous. null when previous = 0 and current > 0 ("new"). */
  percentage: number | null
  direction: 'up' | 'down' | 'flat'
}

/**
 * Subset of analytics KPIs consumed by the KPI card strip. Kept separate
 * from DashboardMetrics so the invoices page can surface the same top-line
 * numbers on the Due Dashboard tab without pulling the full analytics payload.
 */
export interface InvoiceKpiMetrics {
  totalSales: number
  totalCollected: number
  totalOutstanding: number
  totalOverdue: number
  collectionRate: number
  invoiceCount: number

  salesTrend: Trend
  collectedTrend: Trend
  collectionRateTrend: Trend
  outstandingTrend: Trend
  overdueTrend: Trend

  /** Per-bucket invoiced totals, oldest first, for the sales sparkline. */
  salesSeries: number[]
  /** Per-bucket collected totals, oldest first, for the collected sparkline. */
  collectedSeries: number[]
}

/**
 * Top-line analytics payload for the dashboard. Only the fields
 * actually consumed by today's widgets (Money Collection Hero, Today
 * Snapshot, KPI cards, Sales chart) live here — anything not in
 * production has been pruned so the type stays tight.
 */
export interface DashboardMetrics {
  range: DashboardRange

  // Top-line KPIs (period-scoped)
  totalSales: number
  totalCollected: number
  totalOutstanding: number
  totalOverdue: number
  collectionRate: number
  invoiceCount: number

  // Period-over-period trends (also period-scoped)
  salesTrend: Trend
  collectedTrend: Trend
  collectionRateTrend: Trend
  outstandingTrend: Trend
  overdueTrend: Trend

  // Today's focus numbers (consumed by TodaySnapshot)
  collectedToday: number
  dueTodayTotal: number
  dueTodayInvoicesCount: number
  overdueTotal: number
  overdueInvoicesCount: number
  dueThisWeekTotal: number
  averageDaysOverdue: number

  // Primary sales chart
  salesSeries: SalesSeriesPoint[]

  // Metadata
  asOfDate: string
  currency: string
}