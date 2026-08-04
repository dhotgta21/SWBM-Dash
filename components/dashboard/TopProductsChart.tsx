'use client'

// components/dashboard/TopProductsChart.tsx
// Ranked-bar widget for "Top products" — used on the Analytics page
// and the Products → Data Dashboard tab. Renders the highest-revenue
// products as a horizontal ranked list with share bars.
//
// Kept under components/dashboard/ so the two surfaces share one
// implementation.

import type { ProductSalesItem } from '@/lib/dashboard-types'
import { RankedBarList, PRODUCT_ICON } from './RankedBarList'

interface TopProductsChartProps {
  data: ProductSalesItem[]
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  const enriched = data.map((p, i) => ({ ...p, _key: `product-${i}` }))
  const total = enriched.reduce(
    (s, p) => s + (Number.isFinite(p.total) ? p.total : 0),
    0
  )

  return (
    <RankedBarList
      title="Top products"
      description="Best-selling items by revenue"
      icon={PRODUCT_ICON}
      data={enriched}
      total={total}
      viewAllHref="/admin/products"
      viewAllLabel="All products"
      emptyMessage="No product sales data yet"
      emptyHint="Products sold in this period will show here."
      renderLabel={(item) => item.name}
      renderSubLabel={(item) => (item.code ? `SKU ${item.code}` : null)}
      getValue={(item) => item.total}
      getHref={() => null}
      limit={5}
    />
  )
}