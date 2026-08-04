export type DashboardRange = 'week' | 'month' | 'year'

/**
 * Money-collection table sort modes. The "Invoices to collect" table
 * is action-oriented: the operator wants to either work the oldest
 * debt first (default) or chase the biggest balance first. No
 * other sort axes are exposed — keeping the surface to two buttons
 * matches the operator's mental model of "what should I work next".
 */
export type DashboardDueSort = 'oldest' | 'balance'

export type InvoiceAgeFilter = 'all' | '1d' | '1w' | '2w' | '3w' | '1m' | 'older'

export interface InvoiceAgeBucket {
  key: InvoiceAgeFilter
  label: string
  minDays: number
  maxDays: number | null
}

export interface RangeConfig {
  windowDays: number
  label: string
  chartDescription: string
}

export const DASHBOARD_RANGES: Record<DashboardRange, RangeConfig> = {
  week: {
    windowDays: 7,
    label: '7 days',
    chartDescription: 'Daily invoiced vs collected over the last 7 days',
  },
  month: {
    windowDays: 30,
    label: '30 days',
    chartDescription: 'Weekly invoiced vs collected over the last 6 weeks',
  },
  year: {
    windowDays: 365,
    label: '12 months',
    chartDescription: 'Monthly invoiced vs collected over the last 12 months',
  },
}

export const DASHBOARD_RANGE_ORDER: DashboardRange[] = ['week', 'month', 'year']

export interface SortConfig {
  label: string
}

export const DASHBOARD_SORTS: Record<DashboardDueSort, SortConfig> = {
  oldest: { label: 'Oldest first' },
  balance: { label: 'Highest balance' },
}

export const DEFAULT_DASHBOARD_RANGE: DashboardRange = 'month'
export const DEFAULT_DASHBOARD_SORT: DashboardDueSort = 'oldest'

export const INVOICE_AGE_BUCKETS: InvoiceAgeBucket[] = [
  { key: 'all', label: 'All', minDays: 0, maxDays: null },
  { key: '1d', label: '1 day', minDays: 0, maxDays: 1 },
  { key: '1w', label: '1 week', minDays: 2, maxDays: 7 },
  { key: '2w', label: '2 weeks', minDays: 8, maxDays: 14 },
  { key: '3w', label: '3 weeks', minDays: 15, maxDays: 21 },
  { key: '1m', label: '1 month', minDays: 22, maxDays: 30 },
  // "> 1 month" is strictly older than 30 days — the "1 month" bucket
  // above already covers the month-old (22–30 day) range.
  { key: 'older', label: '> 1 month', minDays: 31, maxDays: null },
]

export const DEFAULT_INVOICE_AGE_FILTER: InvoiceAgeFilter = 'all'

export type CollectionTimeRange = 'week' | 'month' | 'quarter' | 'halfYear' | 'year'

export interface CollectionTimeRangeConfig {
  label: string
  windowDays: number
  bucket: 'day' | 'week' | 'month'
}

export const COLLECTION_TIME_RANGES: Record<CollectionTimeRange, CollectionTimeRangeConfig> = {
  week: { label: 'Week', windowDays: 7, bucket: 'day' },
  month: { label: 'Month', windowDays: 28, bucket: 'week' },
  quarter: { label: 'Quarter', windowDays: 90, bucket: 'month' },
  halfYear: { label: '6M', windowDays: 180, bucket: 'month' },
  year: { label: 'Year', windowDays: 365, bucket: 'month' },
}

export const COLLECTION_TIME_RANGE_ORDER: CollectionTimeRange[] = [
  'week',
  'month',
  'quarter',
  'halfYear',
  'year',
]

export const DEFAULT_COLLECTION_TIME_RANGE: CollectionTimeRange = 'month'

export function normalizeDashboardRange(value: string | undefined): DashboardRange {
  if (value === 'week' || value === 'month' || value === 'year') return value
  return DEFAULT_DASHBOARD_RANGE
}

export function normalizeDashboardSort(value: string | undefined): DashboardDueSort {
  if (value && value in DASHBOARD_SORTS) return value as DashboardDueSort
  return DEFAULT_DASHBOARD_SORT
}