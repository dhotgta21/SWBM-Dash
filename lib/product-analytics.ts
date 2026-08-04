// lib/product-analytics.ts
//
// Server-side loader for the "Product Dashboard" tab on the
// Products page. Computes four product-centric analytics from the
// invoice line-item history:
//
//   1. Product trends      — top N products × period buckets (line chart)
//   2. Product movement    — current vs previous period (winners/losers)
//   3. Product seasonality — month × top product grid (heatmap)
//   4. Top products        — best sellers by revenue (already produced by
//                             getDashboardMetrics; we mirror the shape here
//                             so the Product Dashboard tab doesn't need to call
//                             the money dashboard to render)
//
// Why a dedicated loader and not extending getDashboardMetrics:
//
//   - The product dashboard is reachable from the Products page which
//     is gated by `see_products`, not `invoices_see_money`. Staff who
//     can't see £ figures still need the analytics (trend / seasonality
//     / movement are useful even when revenue is hidden).
//   - The product dashboard only counts invoices that have actually been
//     sent (sent / partial / paid / overdue) and are not soft-deleted.
//     Drafts and bin invoices are excluded, so no payment/DSO data is
//     needed beyond the invoice status itself.
//   - Decoupling means the product dashboard keeps working if the
//     money dashboard changes shape.
//
// Range policy: 12 months of invoice history. This is long enough to
// surface seasonality and trend without blowing up the line-item payload.

import 'server-only'
import { createClient } from '@/lib/supabase/server'

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface ProductAnalyticsRange {
  /** YYYY-MM-DD inclusive lower bound. */
  start: string
  /** YYYY-MM-DD inclusive upper bound. */
  end: string
  /** Resolution for trend buckets. */
  bucket: 'week' | 'month'
}

export interface ProductTrendPoint {
  /** Bucket key (e.g. "2025-11" for a month, "2025-W46" for a week). */
  bucket: string
  /** Short label for the chart x-axis (e.g. "Nov", "Nov 17"). */
  label: string
  /** Full label for tooltips (e.g. "Nov 2025"). */
  fullLabel: string
  /** Per-product revenue for this bucket. Keyed by product name. */
  byProduct: Record<string, number>
}

export interface ProductTrendSeries {
  range: ProductAnalyticsRange
  /** Ordered list of bucket points (oldest first). */
  points: ProductTrendPoint[]
  /** Top products included in the trend (highest revenue first). */
  products: { name: string; code: string | null; revenue: number }[]
}

export interface ProductMovementRow {
  name: string
  code: string | null
  /** Revenue in the current period. */
  current: number
  /** Revenue in the previous period of equal length. */
  previous: number
  /** current − previous (signed). */
  change: number
  /** change / previous (signed). null when previous = 0 and current > 0. */
  percentage: number | null
  /** 'up' | 'down' | 'flat' | 'new' (current > 0, previous = 0). */
  direction: 'up' | 'down' | 'flat' | 'new' | 'gone'
}

export interface ProductMovementReport {
  range: ProductAnalyticsRange
  /** Previous-period window used for comparison. */
  previousRange: ProductAnalyticsRange
  /** Top movers — sorted by absolute % change desc. Capped at N. */
  winners: ProductMovementRow[]
  /** Bottom movers — sorted by absolute % change desc among decliners. */
  losers: ProductMovementRow[]
}

export interface ProductSeasonalityCell {
  /** "2025-01" */
  month: string
  /** "Jan" */
  monthLabel: string
  /** Revenue for this product in this month. 0 = no sales. */
  revenue: number
  /** Number of line items (orders) — useful for spotting volume spikes
   *  even when average order value dropped. */
  lineCount: number
}

export interface ProductSeasonalityRow {
  name: string
  code: string | null
  /** Cells ordered oldest → newest. */
  cells: ProductSeasonalityCell[]
  /** Sum of all cell revenue (for sorting + legend). */
  total: number
}

export interface ProductSeasonalityReport {
  /** Range used — 12 months ending at `end`. */
  range: ProductAnalyticsRange
  /** Rows (top products, highest revenue first). */
  rows: ProductSeasonalityRow[]
  /** Max revenue across the whole grid (used to scale the heatmap). */
  maxRevenue: number
  /** Total revenue across all products × months. */
  grandTotal: number
}

export interface ProductAnalyticsBundle {
  /** Resolved range used for trend + movement + seasonality. */
  range: ProductAnalyticsRange
  /** Top 5 best sellers (by revenue) over the resolved range. */
  topProducts: { name: string; code: string | null; revenue: number }[]
  trend: ProductTrendSeries
  movement: ProductMovementReport
  seasonality: ProductSeasonalityReport
}

// ─────────────────────────────────────────────────────────────────────
// Range helpers
// ─────────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  // Build from LOCAL components: toISOString() returns the UTC date,
  // which can be a day ahead/behind the operator's local day.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate())
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d.getTime())
  r.setDate(r.getDate() + days)
  return r
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-GB', { month: 'short' })
}

function monthFullLabel(d: Date): string {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric' })
}

/** ISO week key like "2025-W46". */
function weekKey(d: Date): string {
  // Copy date to avoid mutating
  const target = new Date(d.getTime())
  // Thursday in current week decides the year (ISO 8601)
  target.setDate(target.getDate() + 4 - (target.getDay() || 7))
  const yearStart = new Date(target.getFullYear(), 0, 1)
  const weekNo = Math.ceil(
    (((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  )
  return `${target.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function weekLabel(d: Date): string {
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short' })
}

function weekFullLabel(d: Date): string {
  return `w/c ${d.toLocaleString('en-GB', { day: 'numeric', month: 'short' })}`
}

function previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const prevEnd = addDays(start, -1)
  const prevStart = addDays(prevEnd, -(days - 1))
  return { start: prevStart, end: prevEnd }
}

// ─────────────────────────────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────────────────────────────

/**
 * Load the full product analytics bundle. Best-effort: returns an empty
 * bundle on failure so the dashboard can render its empty state rather
 * than crash the page.
 */
export async function loadProductAnalytics(): Promise<ProductAnalyticsBundle> {
  const empty = makeEmptyBundle()
  try {
    const supabase = await createClient()
    const today = new Date()
    // 12 calendar months ending at "today". Bucket = month for
    // seasonality; trend uses the same buckets so the line chart and
    // the heatmap agree on the axis.
    const end = today
    const start = addMonths(end, -11)
    start.setDate(1) // align to month boundary
    const range: ProductAnalyticsRange = {
      start: toISODate(start),
      end: toISODate(end),
      bucket: 'month',
    }

    const { start: prevStart, end: prevEnd } = previousPeriod(start, end)
    const previousRange: ProductAnalyticsRange = {
      start: toISODate(prevStart),
      end: toISODate(prevEnd),
      bucket: 'month',
    }

    // Pull all line items for invoices that have actually been sent
    // (sent / partial / paid / overdue) and are not soft-deleted.
    // Draft invoices are not real sales, and invoices in the bin
    // (deleted_at is set) must not count toward product revenue.
    const { data: items, error } = await supabase
      .from('invoice_items')
      .select(
        'product_name, product_code, line_total, invoice_id, invoices!inner(type, status, issue_date)'
      )
      .eq('invoices.type', 'invoice')
      .is('deleted_at', null)
      .is('invoices.deleted_at', null)
      .in('invoices.status', ['sent', 'partial', 'paid', 'overdue'])
      .gte('invoices.issue_date', range.start)
      .lte('invoices.issue_date', range.end)
      .limit(20000)

    if (error) {
      console.warn('loadProductAnalytics: query failed', error.message)
      return empty
    }
    if ((items ?? []).length === 20000) {
      console.warn('loadProductAnalytics: result truncated at 20000 rows')
    }

    // Separate fetch for the previous period — the movement widget
    // (winners/losers) compares current vs previous period revenue, and the
    // main query above is intentionally scoped to the current 12 months.
    const { data: prevItems, error: prevError } = await supabase
      .from('invoice_items')
      .select(
        'product_name, product_code, line_total, invoice_id, invoices!inner(type, status, issue_date)'
      )
      .eq('invoices.type', 'invoice')
      .is('deleted_at', null)
      .is('invoices.deleted_at', null)
      .in('invoices.status', ['sent', 'partial', 'paid', 'overdue'])
      .gte('invoices.issue_date', previousRange.start)
      .lte('invoices.issue_date', previousRange.end)
      .limit(20000)

    if (prevError) {
      console.warn('loadProductAnalytics: previous-period query failed', prevError.message)
    }
    if ((prevItems ?? []).length === 20000) {
      console.warn('loadProductAnalytics: result truncated at 20000 rows')
    }

    type RawItem = {
      product_name: string
      product_code: string | null
      line_total: number
      invoice_id: string
      invoices: { type: string; status: string; issue_date: string } | { type: string; status: string; issue_date: string }[] | null
    }
    const raw = (items ?? []) as RawItem[]
    const prevRaw = (prevItems ?? []) as RawItem[]

    // ── Build month buckets (oldest → newest) ─────────────────────────
    const monthBuckets: { key: string; label: string; fullLabel: string; start: Date; end: Date }[] = []
    for (let i = 0; i < 12; i++) {
      const bucketStart = addMonths(start, i)
      const bucketEndDate = addMonths(bucketStart, 1)
      const bucketEnd = addDays(bucketEndDate, -1)
      monthBuckets.push({
        key: monthKey(bucketStart),
        label: monthLabel(bucketStart),
        fullLabel: monthFullLabel(bucketStart),
        start: bucketStart,
        end: bucketEnd,
      })
    }

    const monthKeyOf = (issueDate: string): string => {
      const d = new Date(issueDate)
      return monthKey(d)
    }

    // ── Accumulate per-product totals + per-product-per-month ─────────
    interface ProductAgg {
      name: string
      code: string | null
      total: number
      byMonth: Map<string, { revenue: number; lines: number }>
    }
    const products = new Map<string, ProductAgg>()
    const getKey = (name: string, code: string | null) =>
      `${name.trim().toLowerCase()}|${(code ?? '').trim().toLowerCase()}`

    for (const item of raw) {
      const invoice = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices
      if (!invoice) continue
      const key = getKey(item.product_name, item.product_code)
      const existing = products.get(key)
      const bucketKey = monthKeyOf(invoice.issue_date)
      const lineTotal = Number(item.line_total) || 0
      if (existing) {
        existing.total += lineTotal
        const cell = existing.byMonth.get(bucketKey)
        if (cell) {
          cell.revenue += lineTotal
          cell.lines += 1
        } else {
          existing.byMonth.set(bucketKey, { revenue: lineTotal, lines: 1 })
        }
      } else {
        const byMonth = new Map<string, { revenue: number; lines: number }>()
        byMonth.set(bucketKey, { revenue: lineTotal, lines: 1 })
        products.set(key, {
          name: item.product_name,
          code: item.product_code,
          total: lineTotal,
          byMonth,
        })
      }
    }

    // ── Top products (sorted by revenue desc) ─────────────────────────
    const sorted = Array.from(products.values()).sort((a, b) => b.total - a.total)
    const topProducts = sorted.slice(0, 10).map((p) => ({
      name: p.name,
      code: p.code,
      revenue: p.total,
    }))

    // ── Trend series (top 5 by revenue) ───────────────────────────────
    const trendTop = sorted.slice(0, 5)
    const trendProducts = trendTop.map((p) => ({
      name: p.name,
      code: p.code,
      revenue: p.total,
    }))
    const trendPoints: ProductTrendPoint[] = monthBuckets.map((b) => {
      const byProduct: Record<string, number> = {}
      for (const p of trendTop) {
        const cell = p.byMonth.get(b.key)
        byProduct[p.name] = cell?.revenue ?? 0
      }
      return {
        bucket: b.key,
        label: b.label,
        fullLabel: b.fullLabel,
        byProduct,
      }
    })
    const trend: ProductTrendSeries = { range, points: trendPoints, products: trendProducts }

    // ── Movement (current vs previous period) ─────────────────────────
    const currentTotal = new Map<string, number>()
    const previousTotal = new Map<string, number>()
    for (const item of raw) {
      const invoice = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices
      if (!invoice) continue
      const key = getKey(item.product_name, item.product_code)
      currentTotal.set(key, (currentTotal.get(key) ?? 0) + (Number(item.line_total) || 0))
    }
    for (const item of prevRaw) {
      const invoice = Array.isArray(item.invoices) ? item.invoices[0] : item.invoices
      if (!invoice) continue
      const key = getKey(item.product_name, item.product_code)
      previousTotal.set(key, (previousTotal.get(key) ?? 0) + (Number(item.line_total) || 0))
    }

    const allKeys = new Set<string>([...currentTotal.keys(), ...previousTotal.keys()])
    const movementRows: ProductMovementRow[] = []
    for (const key of allKeys) {
      const agg = products.get(key)
      const name = agg?.name ?? key.split('|')[0]
      const code = agg?.code ?? null
      const current = currentTotal.get(key) ?? 0
      const previous = previousTotal.get(key) ?? 0
      const change = current - previous
      let percentage: number | null = null
      let direction: ProductMovementRow['direction']
      if (current > 0 && previous === 0) {
        direction = 'new'
        percentage = null
      } else if (current === 0 && previous > 0) {
        direction = 'gone'
        percentage = -1
      } else if (previous === 0) {
        direction = 'flat'
        percentage = 0
      } else {
        percentage = change / previous
        direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
      }
      movementRows.push({ name, code, current, previous, change, percentage, direction })
    }

    const isDecliner = (r: ProductMovementRow) => r.direction === 'down' || r.direction === 'gone'
    const isAdvancer = (r: ProductMovementRow) => r.direction === 'up' || r.direction === 'new'
    const winners = movementRows
      .filter(isAdvancer)
      .sort((a, b) => magnitudeDesc(a, b))
      .slice(0, 5)
    const losers = movementRows
      .filter(isDecliner)
      .sort((a, b) => magnitudeDesc(a, b))
      .slice(0, 5)

    const movement: ProductMovementReport = { range, previousRange, winners, losers }

    // ── Seasonality (top 10 × 12 months) ──────────────────────────────
    const seasonalityTop = sorted.slice(0, 10)
    let maxRevenue = 0
    let grandTotal = 0
    const rows: ProductSeasonalityRow[] = seasonalityTop.map((p) => {
      const cells: ProductSeasonalityCell[] = monthBuckets.map((b) => {
        const cell = p.byMonth.get(b.key)
        const revenue = cell?.revenue ?? 0
        const lineCount = cell?.lines ?? 0
        if (revenue > maxRevenue) maxRevenue = revenue
        grandTotal += revenue
        return {
          month: b.key,
          monthLabel: b.label,
          revenue,
          lineCount,
        }
      })
      return { name: p.name, code: p.code, cells, total: p.total }
    })

    const seasonality: ProductSeasonalityReport = {
      range,
      rows,
      maxRevenue,
      grandTotal,
    }

    return {
      range,
      topProducts,
      trend,
      movement,
      seasonality,
    }
  } catch (err) {
    console.warn('loadProductAnalytics: unexpected error', err)
    return empty
  }
}

function magnitudeDesc(a: ProductMovementRow, b: ProductMovementRow): number {
  // Sort by |percentage| desc, with revenue as tiebreaker so big-£ items
  // float to the top of the list.
  const ap = Math.abs(a.percentage ?? (a.direction === 'new' ? Infinity : 0))
  const bp = Math.abs(b.percentage ?? (b.direction === 'new' ? Infinity : 0))
  if (bp !== ap) return bp - ap
  return b.current - a.current
}

function makeEmptyBundle(): ProductAnalyticsBundle {
  const today = new Date()
  const start = addMonths(today, -11)
  start.setDate(1)
  const range: ProductAnalyticsRange = {
    start: toISODate(start),
    end: toISODate(today),
    bucket: 'month',
  }
  const { start: prevStart, end: prevEnd } = previousPeriod(start, today)
  const previousRange: ProductAnalyticsRange = {
    start: toISODate(prevStart),
    end: toISODate(prevEnd),
    bucket: 'month',
  }
  return {
    range,
    topProducts: [],
    trend: { range, points: [], products: [] },
    movement: { range, previousRange, winners: [], losers: [] },
    seasonality: { range, rows: [], maxRevenue: 0, grandTotal: 0 },
  }
}