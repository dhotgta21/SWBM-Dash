// lib/actions/public-products.ts
// Product search server actions.
// - Public shop search: anon client + search_products (catalogue-safe).
// - Staff AI search: authenticated client + search_products_for_ai (123).

'use server'

import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPublicClient } from '@/lib/supabase/public'
import { createClient } from '@/lib/supabase/server'
import {
  type PublicProduct,
  type VariantOption,
  type VariantChoice,
  type VariantMeasurement,
  applyActiveCampaignsToProducts,
  getDisplayMode,
} from '@/lib/public-products'
import {
  buildProductSearchFilter,
  extractProductSearchTerms,
} from '@/lib/search'
import { getClientIp } from '@/lib/ip'
import { rateLimit } from '@/lib/rate-limit'

/** Minimal client shape used by product search RPCs (anon or user JWT). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SearchSupabase = SupabaseClient<any, 'public'>

const PUBLIC_SEARCH_COLUMNS_FALLBACK =
  'id, code, name, description, unit, default_price, category, image_url, updated_at, seo_title, seo_description, short_description, key_features, brand, mpn, applications, search_tags, length_mm, width_mm, height_mm, thickness_mm, coverage_m2_per_unit, coverage_linear_m_per_unit, unit_weight_kg, pack_size, wastage_pct, calculator_type, materials, variant_options, family_slug, source_url'

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string')
  }
  return []
}

function mapSearchRowToProduct(row: Record<string, unknown>): PublicProduct {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    unit: String(row.unit),
    price: row.default_price ? Number(row.default_price) : 0,
    priceFrom: row.price_from
      ? Number(row.price_from)
      : row.default_price
        ? Number(row.default_price)
        : null,
    displayMode: getDisplayMode(
      row.default_price ? Number(row.default_price) : null,
      row.price_from ? Number(row.price_from) : null
    ),
    priceIncludesVat: row.price_includes_vat === true,
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    saleStartsAt: row.sale_starts_at ? String(row.sale_starts_at) : null,
    saleEndsAt: row.sale_ends_at ? String(row.sale_ends_at) : null,
    saleLabel: row.sale_label ? String(row.sale_label) : null,
    campaignDiscountPercent: null,
    campaignLabel: null,
    category: row.category ? String(row.category) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    updatedAt: String(row.updated_at),
    seoTitle: row.seo_title ? String(row.seo_title) : null,
    seoDescription: row.seo_description ? String(row.seo_description) : null,
    shortDescription: row.short_description ? String(row.short_description) : null,
    keyFeatures: parseStringArray(row.key_features),
    searchTags: parseStringArray(row.search_tags),
    brand: row.brand ? String(row.brand) : null,
    mpn: row.mpn ? String(row.mpn) : null,
    applications: parseStringArray(row.applications),
    lengthMm: row.length_mm ? Number(row.length_mm) : null,
    widthMm: row.width_mm ? Number(row.width_mm) : null,
    heightMm: row.height_mm ? Number(row.height_mm) : null,
    thicknessMm: row.thickness_mm ? Number(row.thickness_mm) : null,
    coverageM2PerUnit: row.coverage_m2_per_unit ? Number(row.coverage_m2_per_unit) : null,
    coverageLinearMPerUnit: row.coverage_linear_m_per_unit
      ? Number(row.coverage_linear_m_per_unit)
      : null,
    unitWeightKg: row.unit_weight_kg ? Number(row.unit_weight_kg) : null,
    packSize: row.pack_size ? Number(row.pack_size) : null,
    wastagePct: row.wastage_pct ? Number(row.wastage_pct) : null,
    calculatorType: row.calculator_type ? String(row.calculator_type) : null,
    materials: parseStringArray(row.materials),
    variantOptions: parseVariantOptions(row.variant_options),
    familySlug: row.family_slug ? String(row.family_slug) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
  }
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

/**
 * Parses the `variant_options` JSONB column. Tolerant of both the
 * new shape (`{ options: [{ value, text, measurements? }] }`) and
 * the legacy shape (`{ material, image, selectors: [...] }`) so the
 * code can deploy independently of migration 162 (which flattens the
 * existing rows). Returns the new shape regardless of input.
 */
function parseVariantOptions(value: unknown): VariantOption[] | null {
  if (!Array.isArray(value)) return null
  const out: VariantOption[] = []
  for (const raw of value) {
    if (raw == null || typeof raw !== 'object') continue
    const v = raw as Record<string, unknown>

    if (Array.isArray(v.options)) {
      const options: VariantChoice[] = []
      for (const o of v.options) {
        if (
          o != null &&
          typeof o === 'object' &&
          typeof (o as { value: string }).value === 'string' &&
          typeof (o as { text: string }).text === 'string'
        ) {
          const choice: VariantChoice = {
            value: (o as { value: string }).value,
            text: (o as { text: string }).text,
          }
          if (Array.isArray((o as { measurements?: unknown }).measurements)) {
            const ms = parseVariantMeasurements(
              (o as { measurements: unknown }).measurements
            )
            if (ms.length > 0) choice.measurements = ms
          }
          options.push(choice)
        }
      }
      out.push({ options })
      continue
    }

    if (Array.isArray(v.selectors)) {
      // Legacy shape — flatten inline.
      const flat: VariantChoice[] = []
      for (const selector of v.selectors) {
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
      out.push({ options: flat })
    }
  }
  return out
}

function isMissingColumnError(error: { message?: string }, column: string): boolean {
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes(`column products.${column} does not exist`) || (msg.includes('column') && msg.includes(column) && msg.includes('does not exist'))
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
  if (status >= 500 && status !== 503) return true
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

export interface SearchPublicProductsResult {
  products: PublicProduct[]
  error?: string
}

async function executeSearchProductsRpc(
  supabase: SearchSupabase,
  query: string,
  limit: number,
  activeOnly = true
): Promise<{ data: Record<string, unknown>[] | null; error: unknown }> {
  const rpcResult = await withRetry(() =>
    supabase.rpc('search_products', {
      p_query: query,
      p_limit: limit,
      p_active_only: activeOnly,
    })
  )

  // The RPC returns the whole products row type. If price_from is missing,
  // fall back to the older filter search with a reduced column set.
  if (rpcResult.error && isMissingColumnError(rpcResult.error, 'price_from')) {
    console.warn('executeSearchProductsRpc: price_from missing, falling back')
    const fallbackFilter = buildProductSearchFilter(query)
    if (!fallbackFilter) return { data: [], error: null }

    const fallbackResult = await withRetry(() =>
      supabase
        .from('products')
        .select(PUBLIC_SEARCH_COLUMNS_FALLBACK)
        .is('deleted_at', null)
        .or(fallbackFilter)
        .eq('is_active', activeOnly)
        .order('name', { ascending: true })
        .limit(limit)
    )
    return fallbackResult as { data: Record<string, unknown>[] | null; error: unknown }
  }

  return rpcResult as { data: Record<string, unknown>[] | null; error: unknown }
}

async function executeSearchProductsForAiRpc(
  supabase: SearchSupabase,
  query: string,
  limit: number,
  activeOnly = true
): Promise<{ data: Record<string, unknown>[] | null; error: unknown }> {
  const rpcResult = await withRetry(() =>
    supabase.rpc('search_products_for_ai', {
      p_query: query,
      p_limit: limit,
      p_active_only: activeOnly,
    })
  )

  // If the new RPC is not yet deployed, gracefully fall back to the generic
  // search so the assistant does not break during a rolling deploy.
  if (rpcResult.error) {
    const msg = (rpcResult.error as { message?: string }).message ?? ''
    if (
      msg.toLowerCase().includes('function public.search_products_for_ai') &&
      msg.toLowerCase().includes('does not exist')
    ) {
      console.warn('executeSearchProductsForAiRpc: RPC not found, falling back to search_products')
      return executeSearchProductsRpc(supabase, query, limit, activeOnly)
    }
  }

  return rpcResult as { data: Record<string, unknown>[] | null; error: unknown }
}

// Public search is unauthenticated, so a determined caller could scrape the
// whole catalogue. Throttle by client IP when the platform exposes it
// (TRUST_PROXY=1 behind a reverse proxy). On platforms where the IP is not
// available (e.g. Vercel strips these headers) we deliberately fail OPEN rather
// than bucket every visitor into one shared quota — the database already caps
// search_products to 100 rows and a WAF/edge rule is the better control there.
const PUBLIC_SEARCH_RATE_LIMIT = 60
const PUBLIC_SEARCH_RATE_WINDOW_MS = 60_000

async function enforcePublicSearchRateLimit(
  supabase: SearchSupabase
): Promise<string | null> {
  try {
    const headersList = await headers()
    const ip = getClientIp(headersList)
    if (!ip || ip === '0.0.0.0') {
      // IP unavailable on this platform — never shard everyone into one bucket.
      return null
    }
    const result = await rateLimit(
      supabase,
      `pubsearch:${ip}`,
      PUBLIC_SEARCH_RATE_LIMIT,
      PUBLIC_SEARCH_RATE_WINDOW_MS,
      { failOpen: true }
    )
    if (!result.allowed) {
      return 'Too many searches from your connection. Please slow down and try again in a minute.'
    }
    return null
  } catch {
    // headers() can throw outside a request context; never block search over it.
    return null
  }
}

export async function searchPublicProducts(query: string): Promise<SearchPublicProductsResult> {
  const q = query.trim()
  if (!q) return { products: [] }

  try {
    const supabase = createPublicClient()

    const rateError = await enforcePublicSearchRateLimit(supabase)
    if (rateError) return { products: [], error: rateError }

    const result = await executeSearchProductsRpc(supabase, q, 20, true)

    if (result.error) {
      console.error('searchPublicProducts: database error', formatSupabaseError(result as SupabaseResultBase))
      return { products: [], error: 'Unable to search products right now. Please try again shortly.' }
    }

    if (!result.data) return { products: [] }

    const products = result.data.map((row) => mapSearchRowToProduct(row))
    await applyActiveCampaignsToProducts(products)

    return { products }
  } catch (err) {
    console.error('searchPublicProducts: unexpected error', err)
    return { products: [], error: 'Search failed. Please try again.' }
  }
}

export interface SmartSearchPublicProductsResult {
  products: PublicProduct[]
  totalMatches: number
  tooMany: boolean
  categories: string[]
  error?: string
}

const SMART_SEARCH_LIMIT = 100
const SMART_SEARCH_DISPLAY_LIMIT = 8
const SMART_SEARCH_TOO_MANY_THRESHOLD = 8

/**
 * Natural-language product search for the staff invoice AI assistant.
 *
 * Uses the authenticated server client (not anon). The RPC
 * `search_products_for_ai` is staff/service-only after migration 123.
 * Hybrid full-text + trigram + substring ranking; falls back to a stripped
 * query when the raw utterance matches nothing.
 */
export async function searchPublicProductsSmart(
  query: string
): Promise<SmartSearchPublicProductsResult> {
  const q = query.trim()
  if (!q) return { products: [], totalMatches: 0, tooMany: false, categories: [] }

  try {
    // Staff JWT — not the public anon client. Anon cannot execute
    // search_products_for_ai after migration 123.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return {
        products: [],
        totalMatches: 0,
        tooMany: false,
        categories: [],
        error: 'You must be signed in to use AI product search.',
      }
    }

    const rateError = await enforcePublicSearchRateLimit(supabase as SearchSupabase)
    if (rateError) {
      return { products: [], totalMatches: 0, tooMany: false, categories: [], error: rateError }
    }

    let result = await executeSearchProductsForAiRpc(
      supabase as SearchSupabase,
      q,
      SMART_SEARCH_LIMIT,
      true
    )

    // Fallback: if the raw query found nothing, try with only the significant
    // product terms (e.g. "50 bags of gravel" -> "gravel").
    if (!result.error && (!result.data || result.data.length === 0)) {
      const stripped = extractProductSearchTerms(q).join(' ')
      if (stripped && stripped !== q) {
        result = await executeSearchProductsForAiRpc(
          supabase as SearchSupabase,
          stripped,
          SMART_SEARCH_LIMIT,
          true
        )
      }
    }

    if (result.error) {
      console.error('searchPublicProductsSmart: database error', formatSupabaseError(result as SupabaseResultBase))
      return {
        products: [],
        totalMatches: 0,
        tooMany: false,
        categories: [],
        error: 'Unable to search products right now. Please try again shortly.',
      }
    }

    if (!result.data) {
      return { products: [], totalMatches: 0, tooMany: false, categories: [] }
    }

    const allMatches: PublicProduct[] = result.data.map((row) => mapSearchRowToProduct(row))
    await applyActiveCampaignsToProducts(allMatches)

    const totalMatches = allMatches.length
    const tooMany = totalMatches > SMART_SEARCH_TOO_MANY_THRESHOLD
    const products = allMatches.slice(0, tooMany ? 5 : SMART_SEARCH_DISPLAY_LIMIT)
    const categories = [...new Set(allMatches.map((p) => p.category).filter(Boolean))].sort() as string[]

    return { products, totalMatches, tooMany, categories }
  } catch (err) {
    console.error('searchPublicProductsSmart: unexpected error', err)
    return {
      products: [],
      totalMatches: 0,
      tooMany: false,
      categories: [],
      error: 'Search failed. Please try again.',
    }
  }
}
