// lib/public-products.ts
// Server-side helpers for fetching products for the public shop.
// Uses the public/anon client so the pages work for anonymous visitors.
// The `products` RLS policy must allow `anon` SELECT access for these
// helpers to function.
//
// Returned rows include only what the public needs to see:
// productId, code, name, unit, price, category, description, imageUrl, etc.
// We deliberately do NOT expose cost prices, internal notes, or supplier
// metadata.

import { createPublicClient } from '@/lib/supabase/public'
import { sanitizeLikeTerm } from '@/lib/search'

export interface PublicProduct {
  id: string
  code: string
  name: string
  description: string | null
  unit: string
  price: number
  priceFrom: number | null
  /** Derived display mode. Discounts are only applied when this is 'show'. */
  displayMode: 'show' | 'from' | 'quote'
  /** True when default_price + sale_price already include VAT @ 20%. */
  priceIncludesVat: boolean
  /** Discounted sale price when a sale is active. Null = no sale. */
  salePrice: number | null
  /** Sale window start (ISO). Null = "starts immediately". */
  saleStartsAt: string | null
  /** Sale window end (ISO). Null = open-ended (clearance). */
  saleEndsAt: string | null
  /** Free-text campaign label ("Winter Sale", "Clearance", etc.). */
  saleLabel: string | null
  /** Active campaign discount percent applied to this product. Null = no active campaign. */
  campaignDiscountPercent: number | null
  /** Active campaign label, if any. */
  campaignLabel: string | null
  category: string | null
  imageUrl: string | null
  updatedAt: string
  seoTitle: string | null
  seoDescription: string | null
  shortDescription: string | null
  keyFeatures: string[]
  searchTags: string[]
  brand: string | null
  mpn: string | null
  applications: string[]
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  thicknessMm: number | null
  coverageM2PerUnit: number | null
  coverageLinearMPerUnit: number | null
  unitWeightKg: number | null
  packSize: number | null
  wastagePct: number | null
  calculatorType: string | null
  materials: string[]
  variantOptions: VariantOption[] | null
  familySlug: string | null
  sourceUrl: string | null
}

/**
 * A per-option measurement (e.g. length, weight, diameter). The
 * shape is intentionally open so the operator can attach whatever
 * specs make sense for a given product family — steel needs length
 * + weight, timber needs length × width, sheet needs thickness, etc.
 * Common presets in the admin form seed the operator's first
 * measurement row; the unit dropdown is a free-form picker, not a
 * pre-baked enum, so the operator can type m / mm / cm / in / kg / lb
 * / ft without us having to teach the schema about every one.
 */
export interface VariantMeasurement {
  /** Free-form measurement name, e.g. "length", "weight", "diameter", "thickness". */
  name: string
  /** Numeric value. Null when the operator hasn't filled it in yet. */
  value: number | null
  /** Free-form unit string, e.g. "m", "mm", "kg", "lb", "in". */
  unit: string
}

/**
 * One option on a variant — typically a "size" or "spec" the
 * customer picks from a dropdown on the public product page. Carries
 * its own display text + URL slug (the slug is used by the
 * `/products/<code>?size=<slug>` deep link from the catalogue search
 * to pre-select the option) and an optional list of per-option
 * measurements so each size can carry the length / weight it ships in.
 */
export interface VariantChoice {
  value: string
  text: string
  measurements?: VariantMeasurement[]
}

/**
 * A product can be split into multiple variants (e.g. treated vs
 * untreated timber, or different material grades) — but unlike the
 * legacy shape, each variant only carries its own `options` list.
 * Material is a product-level concept (see `Product.materials`) and
 * the product image is shared across all variants, so the per-variant
 * `material` / `image` fields from the old shape were dropped.
 *
 * The vast majority of products today are single-variant (one
 * `[{ options: [...] }]` entry). The wrapping is kept so multi-variant
 * products can still split without a future migration.
 */
export interface VariantOption {
  options: VariantChoice[]
}

export interface PublicCategorySummary {
  name: string
  slug: string
  productCount: number
  /** Representative image URL for the category — first product with an image. */
  imageUrl: string | null
}

const PUBLIC_PRODUCT_COLUMNS =
  'id, code, name, description, unit, default_price, price_from, price_includes_vat, sale_price, sale_starts_at, sale_ends_at, sale_label, category, image_url, updated_at, seo_title, seo_description, short_description, key_features, search_tags, brand, mpn, applications, length_mm, width_mm, height_mm, thickness_mm, coverage_m2_per_unit, coverage_linear_m_per_unit, unit_weight_kg, pack_size, wastage_pct, calculator_type, materials, variant_options, family_slug, source_url'

// Fallback when `sale_price` (or any newer sale column) is missing on the
// live DB. Strips the sale quartet but keeps price_from + price_includes_vat
// when they're present.
const PUBLIC_PRODUCT_COLUMNS_NO_SALE =
  'id, code, name, description, unit, default_price, price_from, price_includes_vat, category, image_url, updated_at, seo_title, seo_description, short_description, key_features, search_tags, brand, mpn, applications, length_mm, width_mm, height_mm, thickness_mm, coverage_m2_per_unit, coverage_linear_m_per_unit, unit_weight_kg, pack_size, wastage_pct, calculator_type, materials, variant_options, family_slug, source_url'

const PUBLIC_PRODUCT_COLUMNS_FALLBACK =
  'id, code, name, description, unit, default_price, price_from, category, image_url, updated_at, seo_title, seo_description, short_description, key_features, search_tags, brand, mpn, applications, length_mm, width_mm, height_mm, thickness_mm, coverage_m2_per_unit, coverage_linear_m_per_unit, unit_weight_kg, pack_size, wastage_pct, calculator_type, materials, variant_options, family_slug, source_url'

const PUBLIC_PRODUCT_COLUMNS_FALLBACK_LEGACY =
  'id, code, name, description, unit, default_price, category, image_url, updated_at, seo_title, seo_description, short_description, key_features, search_tags, brand, mpn, applications, length_mm, width_mm, height_mm, thickness_mm, coverage_m2_per_unit, coverage_linear_m_per_unit, unit_weight_kg, pack_size, wastage_pct, calculator_type, materials, variant_options, family_slug, source_url'

interface CampaignLike {
  id: string
  discount_percent: number
  starts_at: string | null
  ends_at: string | null
  label: string | null
  is_paused: boolean
  deleted_at: string | null
}

/**
 * Find the active campaign for each product ID. Returns a map of product_id
 * → { discountPercent, label }. Uses JS date math so it works with the public
 * (anon) client without extra RPCs.
 */
async function getActiveCampaignsForProducts(
  productIds: string[],
  now: Date = new Date()
): Promise<Map<string, { discountPercent: number; label: string | null }>> {
  if (productIds.length === 0) return new Map()

  const supabase = createPublicClient()
  const { data: memberships, error } = await supabase
    .from('campaign_products')
    .select('product_id, campaigns(id, discount_percent, starts_at, ends_at, label, is_paused, deleted_at)')
    .in('product_id', productIds)

  if (error || !memberships) {
    console.error('getActiveCampaignsForProducts error:', error)
    return new Map()
  }

  const result = new Map<string, { discountPercent: number; label: string | null }>()

  for (const row of memberships as unknown as { product_id: string; campaigns: CampaignLike | CampaignLike[] | null }[]) {
    const productId = row.product_id
    const campaign = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns
    if (!campaign || campaign.deleted_at || campaign.is_paused) continue

    const started = campaign.starts_at ? new Date(campaign.starts_at).getTime() <= now.getTime() : true
    const notEnded = campaign.ends_at ? new Date(campaign.ends_at).getTime() > now.getTime() : true
    if (!started || !notEnded) continue

    const existing = result.get(productId)
    if (!existing || campaign.discount_percent > existing.discountPercent) {
      result.set(productId, {
        discountPercent: campaign.discount_percent,
        label: campaign.label,
      })
    }
  }

  return result
}

export async function applyActiveCampaignsToProducts(
  products: PublicProduct[],
  now: Date = new Date()
): Promise<void> {
  const campaigns = await getActiveCampaignsForProducts(
    products.map((p) => p.id),
    now
  )
  for (const product of products) {
    const campaign = campaigns.get(product.id)
    if (campaign) {
      product.campaignDiscountPercent = campaign.discountPercent
      product.campaignLabel = campaign.label
    }
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

function parseVariantMeasurements(value: unknown): VariantMeasurement[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (m): m is VariantMeasurement =>
        m != null &&
        typeof m === 'object' &&
        typeof (m as VariantMeasurement).name === 'string' &&
        ((m as VariantMeasurement).value === null ||
          typeof (m as VariantMeasurement).value === 'number') &&
        typeof (m as VariantMeasurement).unit === 'string'
    )
    .map((m) => ({
      name: m.name,
      value: typeof m.value === 'number' && Number.isFinite(m.value) ? m.value : null,
      unit: m.unit,
    }))
}

function parseVariantOptions(value: unknown): VariantOption[] | null {
  if (!Array.isArray(value)) return null
  return value
    .filter((v) => v != null && typeof v === 'object')
    .map((v) => {
      const variant = v as Record<string, unknown>

      // New shape: { options: [{ value, text, measurements? }] }.
      if (Array.isArray(variant.options)) {
        return {
          options: variant.options
            .filter(
              (o): o is { value: string; text: string; measurements?: unknown } =>
                o != null &&
                typeof o === 'object' &&
                typeof (o as { value: string }).value === 'string' &&
                typeof (o as { text: string }).text === 'string'
            )
            .map((o) => ({
              value: o.value,
              text: o.text,
              ...(o.measurements
                ? { measurements: parseVariantMeasurements(o.measurements) }
                : {}),
            })),
        }
      }

      // Legacy shape: { material, image, selectors: [{ name, label,
      // options: [{ value, text }] }] }. Flatten inline so the
      // migration (162_flatten_variant_options.sql) and the code
      // change can ship independently — the parser keeps working
      // during the brief window where some products are still in the
      // old shape. Material/image are dropped (they were the
      // duplication that prompted the refactor).
      if (Array.isArray(variant.selectors)) {
        const flat: { value: string; text: string }[] = []
        for (const selector of variant.selectors) {
          if (!selector || typeof selector !== 'object') continue
          const options = (selector as { options?: unknown }).options
          if (!Array.isArray(options)) continue
          for (const o of options) {
            if (
              o != null &&
              typeof o === 'object' &&
              typeof (o as { value: string }).value === 'string' &&
              typeof (o as { text: string }).text === 'string'
            ) {
              flat.push({
                value: (o as { value: string }).value,
                text: (o as { text: string }).text,
              })
            }
          }
        }
        return { options: flat }
      }

      // Unknown shape — skip.
      return null
    })
    .filter((v): v is VariantOption => v !== null)
}

export function getDisplayMode(
  defaultPrice: number | null,
  priceFrom: number | null
): 'show' | 'from' | 'quote' {
  if ((defaultPrice ?? 0) === 0) return 'quote'
  if ((priceFrom ?? 0) > 0) return 'from'
  return 'show'
}

function rowToProduct(row: {
  id: string
  code: string
  name: string
  description: string | null
  unit: string
  default_price: number | null
  price_from?: number | null
  price_includes_vat?: boolean | null
  sale_price?: number | null
  sale_starts_at?: string | null
  sale_ends_at?: string | null
  sale_label?: string | null
  category: string | null
  image_url: string | null
  updated_at: string
  seo_title: string | null
  seo_description: string | null
  short_description: string | null
  key_features: unknown
  search_tags: unknown
  brand: string | null
  mpn: string | null
  applications: unknown
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  coverage_m2_per_unit: number | null
  coverage_linear_m_per_unit: number | null
  unit_weight_kg: number | null
  pack_size: number | null
  wastage_pct: number | null
  calculator_type: string | null
  materials: unknown
  variant_options: unknown
  family_slug: string | null
  source_url: string | null
}): PublicProduct {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: row.default_price ? Number(row.default_price) : 0,
    priceFrom: row.price_from ? Number(row.price_from) : (row.default_price ? Number(row.default_price) : null),
    displayMode: getDisplayMode(row.default_price, row.price_from ?? null),
    priceIncludesVat: row.price_includes_vat === true,
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    saleStartsAt: row.sale_starts_at ?? null,
    saleEndsAt: row.sale_ends_at ?? null,
    saleLabel: row.sale_label ?? null,
    campaignDiscountPercent: null,
    campaignLabel: null,
    category: row.category,
    imageUrl: row.image_url,
    updatedAt: row.updated_at,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    shortDescription: row.short_description,
    keyFeatures: parseStringArray(row.key_features),
    searchTags: parseStringArray(row.search_tags),
    brand: row.brand,
    mpn: row.mpn,
    applications: parseStringArray(row.applications),
    lengthMm: row.length_mm ? Number(row.length_mm) : null,
    widthMm: row.width_mm ? Number(row.width_mm) : null,
    heightMm: row.height_mm ? Number(row.height_mm) : null,
    thicknessMm: row.thickness_mm ? Number(row.thickness_mm) : null,
    coverageM2PerUnit: row.coverage_m2_per_unit ? Number(row.coverage_m2_per_unit) : null,
    coverageLinearMPerUnit: row.coverage_linear_m_per_unit ? Number(row.coverage_linear_m_per_unit) : null,
    unitWeightKg: row.unit_weight_kg ? Number(row.unit_weight_kg) : null,
    packSize: row.pack_size ? Number(row.pack_size) : null,
    wastagePct: row.wastage_pct ? Number(row.wastage_pct) : null,
    calculatorType: row.calculator_type,
    materials: parseStringArray(row.materials),
    variantOptions: parseVariantOptions(row.variant_options),
    familySlug: row.family_slug,
    sourceUrl: row.source_url,
  }
}

/**
 * Fetch every active product for the public catalogue page. Pagination
 * is intentionally not exposed — the catalogue is small enough (a few
 * hundred lines max) that one round-trip is fine. If we ever cross a
 * few thousand products, switch to a keyset-paginated API and a
 * client-side infinite list.
 */
export async function listPublicProducts(): Promise<PublicProduct[]> {
  try {
    const supabase = createPublicClient()
    const fullResult = await withRetry(() =>
      supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true })
    )

    if (fullResult.error && isMissingColumnError(fullResult.error, 'sale_price')) {
      console.warn('listPublicProducts: sale_price missing, falling back to legacy columns')
      return selectWithFallback(supabase, PUBLIC_PRODUCT_COLUMNS_NO_SALE)
    }

    if (fullResult.error && isMissingColumnError(fullResult.error, 'price_includes_vat')) {
      console.warn(
        'listPublicProducts: price_includes_vat missing, falling back to pre-094 columns'
      )
      return selectWithFallback(supabase, PUBLIC_PRODUCT_COLUMNS_FALLBACK)
    }

    if (fullResult.error && isMissingColumnError(fullResult.error, 'price_from')) {
      console.warn('listPublicProducts: price_from missing, falling back to legacy columns')
      return selectWithFallback(supabase, PUBLIC_PRODUCT_COLUMNS_FALLBACK_LEGACY)
    }

    if (fullResult.error) {
      console.error('listPublicProducts: database error', formatSupabaseError(fullResult))
      return []
    }

    if (!fullResult.data) {
      console.warn('listPublicProducts: no data returned')
      return []
    }

    const products = fullResult.data.map(rowToProduct)
    await applyActiveCampaignsToProducts(products)
    return products
  } catch (err) {
    console.error('listPublicProducts: unexpected error', err)
    return []
  }
}

/** Summary list for category navigation / landing-page cross-sell. */
export async function listPublicCategories(): Promise<PublicCategorySummary[]> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select('category, image_url')
      .eq('is_active', true)
      .not('category', 'is', null)

    if (error) {
      console.error('listPublicCategories: database error', error)
      return []
    }

    if (!data) {
      console.warn('listPublicCategories: no data returned')
      return []
    }

    const stats = new Map<string, { count: number; imageUrl: string | null }>()
    for (const row of data as Array<{ category: string | null; image_url: string | null }>) {
      if (!row.category) continue
      const cur = stats.get(row.category) ?? { count: 0, imageUrl: null }
      cur.count += 1
      if (!cur.imageUrl && row.image_url) cur.imageUrl = row.image_url
      stats.set(row.category, cur)
    }

    return Array.from(stats.entries())
      .map(([name, info]) => ({
        name,
        slug: slugifyCategory(name),
        productCount: info.count,
        imageUrl: info.imageUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (err) {
    console.error('listPublicCategories: unexpected error', err)
    return []
  }
}

/**
 * Look up a redirected product code. Returns the current code when the given
 * code has been renamed, or null when no redirect exists.
 */
export async function getRedirectedProductCode(code: string): Promise<string | null> {
  try {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('product_redirects')
      .select('new_code')
      // Codes are stored uppercase (see normalizeProductData); keep the
      // case-insensitive match but escape LIKE wildcards in the input.
      .ilike('old_code', sanitizeLikeTerm(code))
      .maybeSingle()

    if (error) {
      console.error('getRedirectedProductCode: database error', error)
      return null
    }

    return data?.new_code ?? null
  } catch (err) {
    console.error('getRedirectedProductCode: unexpected error', err)
    return null
  }
}

/** Fetch a single active product by its product code. */
export async function getPublicProductByCode(code: string): Promise<PublicProduct | null> {
  try {
    const supabase = createPublicClient()
    const fullResult = await withRetry(() =>
      supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq('is_active', true)
        .eq('code', code.trim().toUpperCase())
        .maybeSingle()
    )

    if (fullResult.error && isMissingColumnError(fullResult.error, 'sale_price')) {
      console.warn('getPublicProductByCode: sale_price missing, falling back')
      const fallbackResult = await supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS_NO_SALE)
        .eq('is_active', true)
        .eq('code', code.trim().toUpperCase())
        .maybeSingle()

      if (fallbackResult.error) {
        console.error('getPublicProductByCode: fallback database error', formatSupabaseError(fallbackResult))
        return null
      }
      if (!fallbackResult.data) return null
      const product = rowToProduct(fallbackResult.data)
      await applyActiveCampaignsToProducts([product])
      return product
    }

    if (fullResult.error && isMissingColumnError(fullResult.error, 'price_includes_vat')) {
      console.warn('getPublicProductByCode: price_includes_vat missing, falling back')
      const fallbackResult = await supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS_FALLBACK)
        .eq('is_active', true)
        .eq('code', code.trim().toUpperCase())
        .maybeSingle()

      if (fallbackResult.error) {
        console.error('getPublicProductByCode: fallback database error', formatSupabaseError(fallbackResult))
        return null
      }
      if (!fallbackResult.data) return null
      const product = rowToProduct(fallbackResult.data)
      await applyActiveCampaignsToProducts([product])
      return product
    }

    if (fullResult.error && isMissingColumnError(fullResult.error, 'price_from')) {
      console.warn('getPublicProductByCode: price_from missing, falling back')
      const fallbackResult = await supabase
        .from('products')
        .select(PUBLIC_PRODUCT_COLUMNS_FALLBACK_LEGACY)
        .eq('is_active', true)
        .eq('code', code.trim().toUpperCase())
        .maybeSingle()

      if (fallbackResult.error) {
        console.error('getPublicProductByCode: fallback database error', formatSupabaseError(fallbackResult))
        return null
      }
      if (!fallbackResult.data) return null
      const product = rowToProduct(fallbackResult.data)
      await applyActiveCampaignsToProducts([product])
      return product
    }

    if (fullResult.error) {
      console.error('getPublicProductByCode: database error', formatSupabaseError(fullResult))
      return null
    }

    if (!fullResult.data) return null
    const product = rowToProduct(fullResult.data)
    await applyActiveCampaignsToProducts([product])
    return product
  } catch (err) {
    console.error('getPublicProductByCode: unexpected error', err)
    return null
  }
}

interface SupabaseResultBase<T = unknown> {
  status: number
  statusText: string
  error: { message?: string; code?: string } | null
  data: T | null
}

function formatSupabaseError(result: SupabaseResultBase): string {
  const { status, statusText, error } = result
  let errorDetail = 'unknown'
  if (error === null || error === undefined) {
    errorDetail = 'null'
  } else if (error instanceof Error) {
    errorDetail = `${error.name}: ${error.message}`
  } else if (typeof error === 'object') {
    try {
      errorDetail = JSON.stringify(error, Object.getOwnPropertyNames(error))
    } catch {
      errorDetail = String(error)
    }
  } else {
    errorDetail = String(error)
  }
  return `status=${status} statusText=${statusText} error=${errorDetail}`
}

function isRetryableSupabaseResult(result: SupabaseResultBase): boolean {
  const status = result.status
  if (status === 0) return true
  if (status === 429) return true
  if (status >= 500) return true
  return false
}

async function withRetry<T extends SupabaseResultBase>(
  queryFn: () => PromiseLike<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 2
  const baseDelayMs = options.baseDelayMs ?? 250
  let lastResult: T | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await queryFn()
    lastResult = result
    if (!result.error) return result
    if (attempt === maxAttempts) break
    if (!isRetryableSupabaseResult(result)) break
    const delay = baseDelayMs * 2 ** (attempt - 1)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  return lastResult!
}

function isMissingColumnError(error: { message?: string; code?: string }, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes(`column "${column}" does not exist`) || (msg.includes('column') && msg.includes(column) && msg.includes('does not exist'))
}

/**
 * Run a column-limited SELECT and map the rows. Used when the full
 * column list isn't available on the live DB (i.e. a column added by a
 * newer migration hasn't been applied yet).
 */
async function selectWithFallback(
  supabase: ReturnType<typeof createPublicClient>,
  columns: string
): Promise<PublicProduct[]> {
  // Cast through `unknown` so the strongly-typed row shape doesn't leak
  // back from a generic SupabaseClient<GenericStringError> when this
  // helper is called with a fallback column list.
  const result = await supabase
    .from('products')
    .select(columns)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
  if (result.error) {
    console.error('listPublicProducts: fallback database error', formatSupabaseError(result))
    return []
  }
  if (!result.data) return []
  const products = (result.data as unknown as Parameters<typeof rowToProduct>[0][]).map(rowToProduct)
  await applyActiveCampaignsToProducts(products)
  return products
}

/** Slugify a category name the same way `listPublicCategories` does. */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Generate a URL slug for a product detail page. */
export function slugifyProduct(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Given a product and a search query, return the variant option value that
 * best matches the query, if any. Used by the search result UI to build
 * a deep link like `/products/STL-073?size=ub-127x76x13` so the public
 * product page can pre-select the matching variant.
 *
 * Strategy: normalise the query and every option text to a comparable form
 * (lowercase, alphanumeric-only, "x" as separator) and look for a
 * contains-match on any option `text`. Returns undefined if the product
 * has no variants, no selectors, or no option text contains the query.
 */
export function findVariantMatchForQuery(
  product: PublicProduct,
  query: string
): string | undefined {
  if (!query || !query.trim()) return undefined
  if (!product.variantOptions || product.variantOptions.length === 0) return undefined

  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[×x*]/g, 'x')
      .replace(/[^a-z0-9]/g, '')

  const needle = normalize(query)
  if (!needle) return undefined

  // Walk every variant's options list. The shape is now flat — no
  // selector wrapper — so each option's display text is matched
  // directly against the query. The first hit wins; callers get back
  // the option's URL slug so they can build the
  // `/products/<code>?size=<slug>` deep link.
  for (const variant of product.variantOptions) {
    for (const option of variant.options ?? []) {
      const hay = normalize(option.text ?? '')
      if (hay && hay.includes(needle)) {
        return option.value
      }
    }
  }
  return undefined
}

/**
 * Build a product detail URL with a pre-selected variant query string.
 * Returns the plain canonical URL when there is no match — callers
 * don't need to branch on undefined.
 */
export function buildProductUrlWithVariant(
  code: string,
  matchedVariantValue?: string
): string {
  const base = `/products/${encodeURIComponent(code)}`
  if (!matchedVariantValue) return base
  return `${base}?size=${encodeURIComponent(matchedVariantValue)}`
}
