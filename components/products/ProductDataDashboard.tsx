// components/products/ProductDataDashboard.tsx
//
// Server component that orchestrates the "Product Dashboard" tab on the
// Products page. Loads:
//
//   - product analytics (trends, movement, seasonality, top sellers)
//   - seasonal sales products (for the Product Discounts hero)
//
// Renders them in a single, scannable dashboard:
//
//   ┌────────────────────────────────────────────────────────┐
//   │  KPI strip (window / products sold / total revenue)   │
//   ├──────────────────────────────┬─────────────────────────┤
//   │  Product discounts (hero)   │  Top products           │
//   ├──────────────────────────────┴─────────────────────────┤
//   │  Top product trends (multi-line chart)                │
//   ├──────────────────────────────┬─────────────────────────┤
//   │  Movement (winners/losers)   │  Seasonality heatmap    │
//   └──────────────────────────────┴─────────────────────────┘
//
// Why a server component: the underlying data fetches are RSC-safe and
// we want the first paint to include real numbers (no client-side
// loading flash). The inner chart/movement/heatmap components are
// themselves client components only because Recharts requires it.

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary'
import { TopProductsChart } from '@/components/dashboard/TopProductsChart'
import { SeasonalSalesWidget, type SeasonalSalesProduct } from '@/components/dashboard/SeasonalSalesWidget'
import { ProductTrendsChart } from '@/components/dashboard/ProductTrendsChart'
import { ProductMovement } from '@/components/dashboard/ProductMovement'
import { ProductSeasonalityHeatmap } from '@/components/dashboard/ProductSeasonalityHeatmap'
import { loadProductAnalytics } from '@/lib/product-analytics'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Package, CalendarRange, TrendingUp } from 'lucide-react'

export async function ProductDataDashboard() {
  try {
    const [analytics, seasonalProducts] = await Promise.all([
      loadProductAnalytics(),
      loadSeasonalSalesProducts(),
    ])

    const rangeLabel = `${formatDate(analytics.range.start)} – ${formatDate(analytics.range.end)}`

    // Adapt the analytics topProducts shape to the TopProductsChart
    // shape (ProductSalesItem) so we can reuse the existing ranked-list
    // component without forking it.
    const topForChart = analytics.topProducts.slice(0, 5).map((p) => ({
      name: p.name,
      code: p.code,
      total: p.revenue,
    }))

    return (
      <div className="space-y-6">
        {/* KPI strip — headline numbers for the 12-month window */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            icon={<CalendarRange className="h-4 w-4" />}
            label="Window"
            value="Last 12 months"
            hint={rangeLabel}
          />
          <KpiCard
            icon={<Package className="h-4 w-4" />}
            label="Products sold"
            value={`${analytics.topProducts.length}+`}
            hint="Top 10 tracked in detail"
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total revenue"
            value={formatCurrency(analytics.seasonality.grandTotal)}
            hint="All top products combined"
          />
        </div>

        {/* Discounts + top sellers row */}
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionErrorBoundary fallbackTitle="Could not load product discounts">
              <SeasonalSalesWidget products={seasonalProducts} />
            </SectionErrorBoundary>
          </div>
          <div className="lg:col-span-5">
            {topForChart.length > 0 ? (
              <SectionErrorBoundary fallbackTitle="Could not load top products">
                <TopProductsChart data={topForChart} />
              </SectionErrorBoundary>
            ) : (
              <Card className="h-full border-border/70 p-6 shadow-none">
                <CardHeader className="p-0">
                  <CardTitle className="text-base font-semibold text-foreground">
                    Top products
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 pt-3">
                  <p className="text-sm text-muted-foreground">
                    No product sales in this window yet.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Trend chart */}
        <SectionErrorBoundary fallbackTitle="Could not load product trends">
          <ProductTrendsChart data={analytics.trend} />
        </SectionErrorBoundary>

        {/* Movement + Seasonality stacked */}
        <div className="grid gap-5">
          <SectionErrorBoundary fallbackTitle="Could not load product movement">
            <ProductMovement data={analytics.movement} />
          </SectionErrorBoundary>
          <SectionErrorBoundary fallbackTitle="Could not load seasonality heatmap">
            <ProductSeasonalityHeatmap data={analytics.seasonality} />
          </SectionErrorBoundary>
        </div>
      </div>
    )
  } catch (error) {
    console.error('ProductDataDashboard render error:', error)
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Could not load product data</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The analytics dashboard failed to load. Please try again.
        </p>
      </div>
    )
  }
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary-muted text-primary">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/**
 * Loads every product with a `sale_price` set so the Product Discounts
 * hero can render its summary + featured rows in a single round trip.
 * Best-effort — returns [] on failure so the dashboard can render its
 * empty state rather than crash the page.
 */
async function loadSeasonalSalesProducts(
  limit: number = 30
): Promise<SeasonalSalesProduct[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('products')
      .select(
        'id, code, name, is_active, default_price, sale_price, sale_starts_at, sale_ends_at, sale_label'
      )
      .is('deleted_at', null)
      .gt('default_price', 0)
      .is('price_from', null)
      .not('sale_price', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('loadSeasonalSalesProducts: query failed', error.message)
      return []
    }

    return (data ?? []) as SeasonalSalesProduct[]
  } catch (err) {
    console.warn('loadSeasonalSalesProducts: unexpected error', err)
    return []
  }
}