// lib/quote-request-dashboard.ts
// Server-side metrics for the Quote & order requests overview dashboard.
//
// Mirrors the shape of lib/invoice-dashboard.ts but for the quote_requests
// domain: volume over time, order-vs-quote mix, status pipeline, conversion
// rate and an estimated pipeline value derived from line items.
//
// Everything here is count/value maths over rows the operator can already
// open individually, so the only gate we need is `see_quote_requests`.
//
// Note: this is a plain server-only module (not a `'use server'` action file)
// because it also exports the STATUS_ORDER / STATUS_STYLE constants consumed
// by the nested-tabs UI. It is only ever executed from server components /
// routes; client components import its types only (`import type`), which are
// erased at build time, so the server-only Supabase client never enters the
// client bundle.

import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import type { Trend } from '@/lib/dashboard-types'
import {
  STATUS_ORDER,
  STATUS_STYLE,
  type QuoteRequestStatus,
} from './quote-request-status'

// Re-exported so existing type-only importers keep working. Type-only
// re-exports are erased and are allowed in a 'use server' module.
export type { QuoteRequestStatus } from './quote-request-status'

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
export type QuoteRequestKind = 'quote' | 'order'

export interface QuoteKpiMetrics {
  /** Requests created in the active window. */
  totalCount: number
  /** Pending requests created in the active window. */
  pendingCreated: number
  /** Requests converted to an invoice (status = invoiced) in the window. */
  invoicedCount: number
  /** Point-in-time snapshot of requests still needing action
   *  (pending + reviewed) across the fetched horizon. */
  openNow: number
  /** invoiced / (invoiced + rejected) within the window. 0 when undecided. */
  conversionRate: number
  /** Σ(quantity × suggested_price) for requests created in the window. */
  pipelineValue: number

  totalTrend: Trend
  pendingTrend: Trend
  convertedTrend: Trend
  conversionRateTrend: Trend
  pipelineTrend: Trend

  /** Per-bucket series (oldest first) driving the card sparklines. */
  totalSeries: number[]
  pendingSeries: number[]
  convertedSeries: number[]
  pipelineSeries: number[]
}

export interface QuoteStatusBreakdownItem {
  status: QuoteRequestStatus
  label: string
  color: string
  count: number
  value: number
}

export interface QuoteDailyPoint {
  /** YYYY-MM-DD (UTC) bucket key. */
  date: string
  orders: number
  quotes: number
  total: number
}

export interface QuoteRequestDashboardMetrics {
  kpis: QuoteKpiMetrics
  statusBreakdown: QuoteStatusBreakdownItem[]
  /** Per-day counts for the fetched horizon, oldest first. The over-time
   *  chart re-buckets these client-side by range. */
  dailySeries: QuoteDailyPoint[]
  asOfDate: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WINDOW_DAYS = 30
/** How far back we fetch rows. Covers the chart's 12-month range. */
const HORIZON_DAYS = 365
const SPARKLINE_BUCKETS = 12
const ROW_LIMIT = 5000

// STATUS_ORDER and STATUS_STYLE now live in lib/quote-request-status.ts
// (imported above) so this 'use server' module exports only async functions.

// ─────────────────────────────────────────────────────────────────────────────
// Raw row shape (cast — generated types lag behind the `kind` column)
// ─────────────────────────────────────────────────────────────────────────────

interface RawItem {
  quantity: number | null
  suggested_price: number | null
}

interface RawRequest {
  id: string
  kind: string
  status: string
  created_at: string
  quote_request_items: RawItem[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (local, dependency-free)
// ─────────────────────────────────────────────────────────────────────────────

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/** UTC date key for a timestamptz — consistent with how we bucket. */
function dateKey(iso: string): string {
  return iso.slice(0, 10)
}

function requestValue(row: RawRequest): number {
  if (!row.quote_request_items) return 0
  return row.quote_request_items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const price = Number(item.suggested_price) || 0
    return sum + qty * price
  }, 0)
}

function computeTrend(current: number, previous: number): Trend {
  const change = current - previous
  // "New" activity (nothing in the previous window, something now) has
  // no meaningful percentage — signal it with null so the UI renders
  // "new" instead of a fake +100.0%. Mirrors lib/dashboard.ts.
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

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function getQuoteRequestDashboardMetrics(): Promise<QuoteRequestDashboardMetrics> {
  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.see_quote_requests)) {
    throw new Error('Not authorised')
  }

  const supabase = createAdminClient()
  const today = new Date()
  const todayStr = toISODate(today)
  const horizonStart = toISODate(addDays(today, -(HORIZON_DAYS - 1)))

  const { data, error } = await supabase
    .from('quote_requests')
    .select('id, kind, status, created_at, quote_request_items(quantity, suggested_price)')
    .gte('created_at', `${horizonStart}T00:00:00.000Z`)
    .order('created_at', { ascending: true })
    .limit(ROW_LIMIT)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as RawRequest[]

  // ── Window boundaries ────────────────────────────────────────────────────
  const currentStart = toISODate(addDays(today, -(WINDOW_DAYS - 1)))
  const previousStart = toISODate(addDays(today, -(WINDOW_DAYS * 2 - 1)))
  const previousEnd = toISODate(addDays(today, -WINDOW_DAYS))

  const inRange = (key: string, start: string, end: string) => key >= start && key <= end

  // Attach precomputed value + date key once.
  const enriched = rows.map((r) => ({
    ...r,
    _key: dateKey(r.created_at),
    _value: requestValue(r),
    _kind: r.kind === 'order' ? 'order' : 'quote',
  }))

  const current = enriched.filter((r) => inRange(r._key, currentStart, todayStr))
  const previous = enriched.filter((r) => inRange(r._key, previousStart, previousEnd))

  const sumValue = (list: typeof enriched) => list.reduce((s, r) => s + r._value, 0)
  const countStatus = (list: typeof enriched, s: QuoteRequestStatus) =>
    list.filter((r) => r.status === s).length

  const totalCount = current.length
  const pendingCreated = countStatus(current, 'pending')
  const invoicedCount = countStatus(current, 'invoiced')
  const decided = invoicedCount + countStatus(current, 'rejected')
  const conversionRate = decided > 0 ? invoicedCount / decided : 0
  const pipelineValue = sumValue(current)
  const openNow = enriched.filter((r) => r.status === 'pending' || r.status === 'reviewed').length

  const prevInvoiced = countStatus(previous, 'invoiced')
  const prevDecided = prevInvoiced + countStatus(previous, 'rejected')
  const prevConversionRate = prevDecided > 0 ? prevInvoiced / prevDecided : 0

  // ── Sparkline buckets (WINDOW_DAYS split into SPARKLINE_BUCKETS) ─────────
  const bucketSpan = WINDOW_DAYS / SPARKLINE_BUCKETS
  const buckets = Array.from({ length: SPARKLINE_BUCKETS }, (_, i) => {
    const start = addDays(today, -(WINDOW_DAYS - 1) + Math.floor(i * bucketSpan))
    const end = addDays(today, -(WINDOW_DAYS - 1) + Math.floor((i + 1) * bucketSpan) - 1)
    return { start: toISODate(start), end: toISODate(end) }
  })
  // Ensure the final bucket closes on today (rounding can leave a gap).
  buckets[buckets.length - 1].end = todayStr

  const bucketRows = buckets.map((b) =>
    enriched.filter((r) => inRange(r._key, b.start, b.end))
  )

  const totalSeries = bucketRows.map((l) => l.length)
  const pendingSeries = bucketRows.map((l) => countStatus(l, 'pending'))
  const convertedSeries = bucketRows.map((l) => countStatus(l, 'invoiced'))
  const pipelineSeries = bucketRows.map((l) => sumValue(l))

  const kpis: QuoteKpiMetrics = {
    totalCount,
    pendingCreated,
    invoicedCount,
    openNow,
    conversionRate,
    pipelineValue,
    totalTrend: computeTrend(totalCount, previous.length),
    pendingTrend: computeTrend(pendingCreated, countStatus(previous, 'pending')),
    convertedTrend: computeTrend(invoicedCount, prevInvoiced),
    conversionRateTrend: computeTrend(conversionRate, prevConversionRate),
    pipelineTrend: computeTrend(pipelineValue, sumValue(previous)),
    totalSeries,
    pendingSeries,
    convertedSeries,
    pipelineSeries,
  }

  // ── Status breakdown (across the full fetched horizon) ───────────────────
  const statusBreakdown: QuoteStatusBreakdownItem[] = STATUS_ORDER.map((status) => {
    const items = enriched.filter((r) => r.status === status)
    return {
      status,
      label: STATUS_STYLE[status].label,
      color: STATUS_STYLE[status].color,
      count: items.length,
      value: sumValue(items),
    }
  })

  // ── Daily series for the over-time chart ─────────────────────────────────
  const byDay = new Map<string, QuoteDailyPoint>()
  for (let i = HORIZON_DAYS - 1; i >= 0; i--) {
    const key = toISODate(addDays(today, -i))
    byDay.set(key, { date: key, orders: 0, quotes: 0, total: 0 })
  }
  for (const r of enriched) {
    const point = byDay.get(r._key)
    if (!point) continue
    if (r._kind === 'order') point.orders += 1
    else point.quotes += 1
    point.total += 1
  }
  const dailySeries = Array.from(byDay.values())

  return {
    kpis,
    statusBreakdown,
    dailySeries,
    asOfDate: todayStr,
  }
}
