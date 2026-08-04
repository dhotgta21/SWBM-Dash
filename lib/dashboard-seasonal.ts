// lib/dashboard-seasonal.ts
// Server-side loader for the Seasonal Sales widget on the Products →
// Data Dashboard tab. Pulls every product with sale_price set (live,
// upcoming or recently expired) so the widget can render its summary
// + featured rows in a single round trip.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SeasonalSalesProduct } from '@/components/dashboard/SeasonalSalesWidget'

export interface LoadSeasonalSalesOptions {
  /**
   * Maximum number of products to fetch. The widget caps at 4
   * featured rows + 3 "recently ended" rows = 7 visible, but we pull
   * a little more so the loader can survive products whose state
   * flips between server fetch and render (rare but possible).
   */
  limit?: number
}

// Generous cap: the query orders by updated_at, so a tight cap would
// hide live sales that simply haven't been edited recently behind
// fresher (but expired/upcoming) rows. The widget itself only shows
// 7 rows, so 200 is ample headroom.
const DEFAULT_LIMIT = 200

export async function loadSeasonalSalesProducts(
  options: LoadSeasonalSalesOptions = {}
): Promise<SeasonalSalesProduct[]> {
  const limit = options.limit ?? DEFAULT_LIMIT

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
    // Loader is best-effort — the widget renders its empty state if
    // we can't reach the DB. Never crash the dashboard over a sale
    // query failure.
    console.warn('loadSeasonalSalesProducts: unexpected error', err)
    return []
  }
}