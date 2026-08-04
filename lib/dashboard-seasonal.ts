// lib/dashboard-seasonal.ts
// Server-side loader for the Seasonal Sales / Product discounts widget on
// Products → Data Dashboard (and any other surface that wants the same set).
//
// Two promotion systems exist:
//   1. Individual product sales (products.sale_price + window)
//   2. Campaign groups (campaigns + campaign_products % off)
//
// Operators treat both as "discounts". This loader merges them so the hero
// never shows 0 while live campaign groups are running.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignStatus } from '@/lib/products/sale'
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

function isMissingColumnError(message: string | undefined, column: string): boolean {
  const msg = (message ?? '').toLowerCase()
  return msg.includes(column.toLowerCase()) && msg.includes('does not exist')
}

/**
 * Map a campaign % discount onto the individual-sale shape so the existing
 * SeasonalSalesWidget (getSaleInfo) can render campaign products without a
 * second UI path.
 */
function campaignToSaleProduct(row: {
  id: string
  code: string
  name: string
  is_active: boolean
  default_price: number
  discount_percent: number
  starts_at: string | null
  ends_at: string | null
  label: string | null
}): SeasonalSalesProduct {
  const defaultPrice = Number(row.default_price) || 0
  const pct = Number(row.discount_percent) || 0
  const salePrice =
    defaultPrice > 0 && pct > 0
      ? Math.round(defaultPrice * (1 - pct / 100) * 100) / 100
      : null

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    is_active: row.is_active,
    default_price: defaultPrice,
    sale_price: salePrice,
    sale_starts_at: row.starts_at,
    sale_ends_at: row.ends_at,
    sale_label: row.label || null,
  }
}

async function loadIndividualSaleProducts(
  admin: ReturnType<typeof createAdminClient>,
  limit: number
): Promise<SeasonalSalesProduct[]> {
  let filterDeletedAt = true

  for (let attempt = 0; attempt < 2; attempt++) {
    let query = admin
      .from('products')
      .select(
        'id, code, name, is_active, default_price, sale_price, sale_starts_at, sale_ends_at, sale_label'
      )
      .gt('default_price', 0)
      .is('price_from', null)
      .not('sale_price', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (filterDeletedAt) {
      query = query.is('deleted_at', null)
    }

    const { data, error } = await query
    if (error && filterDeletedAt && isMissingColumnError(error.message, 'deleted_at')) {
      console.warn(
        'loadSeasonalSalesProducts: products.deleted_at missing; retrying without soft-delete filter'
      )
      filterDeletedAt = false
      continue
    }
    if (error) {
      console.warn('loadSeasonalSalesProducts: individual sales query failed', error.message)
      return []
    }
    return (data ?? []) as SeasonalSalesProduct[]
  }
  return []
}

/**
 * Products currently attached to a non-deleted campaign. We materialise a
 * synthetic sale_price so getSaleInfo / the widget treat them like product sales.
 * Campaign price wins over individual sale when both exist (matches shop).
 */
async function loadCampaignSaleProducts(
  admin: ReturnType<typeof createAdminClient>,
  limit: number,
  now: Date = new Date()
): Promise<SeasonalSalesProduct[]> {
  const { data: campaigns, error: campError } = await admin
    .from('campaigns')
    .select('id, name, label, discount_percent, starts_at, ends_at, is_paused, deleted_at')
    .is('deleted_at', null)

  if (campError) {
    // Soft-fail when campaigns table is missing on ancient schemas.
    if (isMissingColumnError(campError.message, 'deleted_at')) {
      const retry = await admin
        .from('campaigns')
        .select('id, name, label, discount_percent, starts_at, ends_at, is_paused')
      if (retry.error) {
        console.warn('loadSeasonalSalesProducts: campaigns query failed', retry.error.message)
        return []
      }
      return materialiseCampaignProducts(admin, retry.data ?? [], limit, now)
    }
    console.warn('loadSeasonalSalesProducts: campaigns query failed', campError.message)
    return []
  }

  return materialiseCampaignProducts(admin, campaigns ?? [], limit, now)
}

async function materialiseCampaignProducts(
  admin: ReturnType<typeof createAdminClient>,
  campaigns: Array<{
    id: string
    name: string
    label: string | null
    discount_percent: number
    starts_at: string | null
    ends_at: string | null
    is_paused: boolean
  }>,
  limit: number,
  now: Date
): Promise<SeasonalSalesProduct[]> {
  // Include live + scheduled so the widget can show "upcoming" campaign products too.
  const relevant = campaigns.filter((c) => {
    const status = getCampaignStatus({
      discountPercent: Number(c.discount_percent) || 0,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      isPaused: !!c.is_paused,
    }, now)
    return status === 'live' || status === 'scheduled' || status === 'paused'
  })

  if (relevant.length === 0) return []

  const campaignIds = relevant.map((c) => c.id)
  const campaignById = new Map(relevant.map((c) => [c.id, c]))

  const { data: joins, error: joinError } = await admin
    .from('campaign_products')
    .select('campaign_id, product_id')
    .in('campaign_id', campaignIds)
    .limit(Math.max(limit * 3, 300))

  if (joinError || !joins?.length) {
    if (joinError) {
      console.warn('loadSeasonalSalesProducts: campaign_products query failed', joinError.message)
    }
    return []
  }

  const productIds = Array.from(new Set(joins.map((j) => j.product_id)))
  if (productIds.length === 0) return []

  let productQuery = admin
    .from('products')
    .select('id, code, name, is_active, default_price, deleted_at')
    .in('id', productIds.slice(0, limit * 2))
    .gt('default_price', 0)
    .is('price_from', null)

  let { data: products, error: prodError } = await productQuery.is('deleted_at', null)

  if (prodError && isMissingColumnError(prodError.message, 'deleted_at')) {
    const retry = await admin
      .from('products')
      .select('id, code, name, is_active, default_price')
      .in('id', productIds.slice(0, limit * 2))
      .gt('default_price', 0)
      .is('price_from', null)
    products = retry.data as typeof products
    prodError = retry.error
  }

  if (prodError || !products?.length) {
    if (prodError) {
      console.warn('loadSeasonalSalesProducts: campaign product load failed', prodError.message)
    }
    return []
  }

  const productById = new Map(products.map((p) => [p.id, p]))

  // Prefer the strongest live discount per product (matches shop).
  const bestByProduct = new Map<
    string,
    {
      product: (typeof products)[0]
      campaign: (typeof relevant)[0]
    }
  >()

  for (const join of joins) {
    const product = productById.get(join.product_id)
    const campaign = campaignById.get(join.campaign_id)
    if (!product || !campaign) continue

    const existing = bestByProduct.get(product.id)
    if (
      !existing ||
      Number(campaign.discount_percent) > Number(existing.campaign.discount_percent)
    ) {
      bestByProduct.set(product.id, { product, campaign })
    }
  }

  return Array.from(bestByProduct.values())
    .slice(0, limit)
    .map(({ product, campaign }) =>
      campaignToSaleProduct({
        id: product.id,
        code: product.code,
        name: product.name,
        is_active: product.is_active,
        default_price: Number(product.default_price) || 0,
        discount_percent: Number(campaign.discount_percent) || 0,
        starts_at: campaign.starts_at,
        ends_at: campaign.ends_at,
        label: campaign.label || campaign.name || null,
      })
    )
}

export async function loadSeasonalSalesProducts(
  options: LoadSeasonalSalesOptions = {}
): Promise<SeasonalSalesProduct[]> {
  const limit = options.limit ?? DEFAULT_LIMIT

  try {
    const admin = createAdminClient()
    const now = new Date()

    const [individual, campaign] = await Promise.all([
      loadIndividualSaleProducts(admin, limit),
      loadCampaignSaleProducts(admin, limit, now),
    ])

    // Campaign wins when both exist for the same product (shop parity).
    const byId = new Map<string, SeasonalSalesProduct>()
    for (const p of individual) {
      byId.set(p.id, p)
    }
    for (const p of campaign) {
      byId.set(p.id, p)
    }

    return Array.from(byId.values()).slice(0, limit)
  } catch (err) {
    // Loader is best-effort — the widget renders its empty state if
    // we can't reach the DB. Never crash the dashboard over a sale
    // query failure.
    console.warn('loadSeasonalSalesProducts: unexpected error', err)
    return []
  }
}
