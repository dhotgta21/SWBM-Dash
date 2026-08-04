// lib/seo/company-seo.ts
// Shared loader for company-level SEO settings. Pulls business-specific
// facts (name, sameAs, geo, priceRange) from the single company_settings
// row (id = 1) and returns optimised, hard-coded titles/descriptions so
// public pages always use the best metadata without relying on operators.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import {
  getDefaultCompanyName,
  getDefaultHomeDescription,
  getDefaultHomeTitle,
  getDefaultSiteUrl,
} from '@/lib/demo/brand'

type CompanySettingsRow = Database['public']['Tables']['company_settings']['Row']

export const SITE_URL = getDefaultSiteUrl()

const DEFAULT_SITE_NAME = getDefaultCompanyName()

// Home page metadata — optimised for local search. Demo-aware defaults so
// DEMO_MODE deployments do not leak production Star Hawk SEO strings.
//
// Title is intentionally kept under Google's ~60-character desktop display
// limit. Anything longer gets truncated or rewritten to the brand name
// alone, which is what was happening before this change.
const DEFAULT_HOME_TITLE = getDefaultHomeTitle()

// Description is targeted to ~155 chars so it doesn't show the trailing
// "…" in the SERP snippet.
const DEFAULT_HOME_DESCRIPTION = getDefaultHomeDescription()

const DEFAULT_OG_TITLE = getDefaultHomeTitle()

const DEFAULT_SHOP_TITLE = 'Get a Trade Quote'
const DEFAULT_SHOP_DESCRIPTION =
  'Request a trade quote on aggregates, bricks, timber, insulation, roofing, drainage, fixings and tools. Same-day delivery across Greater London and the Home Counties.'

const DEFAULT_CART_TITLE = 'Your Quote Cart'
const DEFAULT_CART_DESCRIPTION =
  'Review your selected building materials and submit your quote request.'

const DEFAULT_CATALOG_TITLE_FALLBACK = 'Full Product Catalogue'
const DEFAULT_CATALOG_DESCRIPTION_FALLBACK =
  `Browse the complete ${DEFAULT_SITE_NAME} catalogue. Request a trade quote on aggregates, cement, bricks, blocks, timber, insulation, roofing, steel and more.`

// Category and product page templates. Operators can no longer override
// these; the defaults are already tuned for local SEO.
// Available placeholders:
//   {category} — category display name (e.g. "Aggregates")
//   {product}  — product display name (e.g. "Sharp sand")
//   {site}     — site name from company_settings
//
// Templates are kept under Google's 60-char title and 160-char description
// SERP caps so they aren't truncated or rewritten. The previous templates
// ("{category} | Trade Prices & Same-Day Delivery | {site}") were 72 chars
// and 200 chars respectively and lost the brand + CTA in every snippet.
const DEFAULT_CATEGORY_TITLE_TEMPLATE = '{category} | Trade Prices | {site}'
const DEFAULT_CATEGORY_DESCRIPTION_TEMPLATE =
  'Buy {category} from {site}. Trade prices on application, same-day delivery across Greater London & the Home Counties. Order online.'

const DEFAULT_PRODUCT_TITLE_TEMPLATE = '{product} | Trade Prices | {site}'
const DEFAULT_PRODUCT_DESCRIPTION_TEMPLATE =
  'Buy {product} from {site}. Trade prices on application, same-day delivery across Greater London & the Home Counties. Order online.'

const DEFAULT_KEYWORDS = [
  'builders merchant',
  'builders merchants near me',
  'building materials',
  'building supplies',
  'aggregates',
  'cement',
  'bricks',
  'blocks',
  'timber',
  'plasterboard',
  'insulation',
  'roofing supplies',
  'drainage',
  'fixings',
  'tools',
  'trade counter',
  'trade account',
  'same day delivery',
  'building merchants London',
  'building supplies Slough',
  'aggregates delivery',
  'bulk aggregates',
  'sharp sand',
  'ballast',
  'type 1 sub-base',
  'concrete blocks',
  'carcassing timber',
  'plywood',
  'OSB board',
  'MDF',
  'plaster',
  'render',
  'steel reinforcement',
  'DPC membrane',
  'landscaping supplies',
  'Slough',
  'High Wycombe',
  'Hayes',
  'Uxbridge',
  'Southall',
  'Reading',
  'Bracknell',
  'Wembley',
  'Harrow',
  'Enfield',
  'Croydon',
  'Hounslow',
  'Kingston upon Thames',
  'Epsom',
  'Newbury',
  'Guildford',
  'Woking',
  'Basingstoke',
  'Oxford',
  'Swindon',
  'Berkshire',
  'Buckinghamshire',
  'Greater London',
  'Surrey',
  'Hampshire',
  'Oxfordshire',
  'Wiltshire',
]

// sameAs URLs emitted in the LocalBusiness schema are configured per-business
// in Settings (Facebook, Instagram, LinkedIn, Google Business Profile). They
// are intentionally empty by default: sameAs must point at THIS company's real
// profiles, and incorrect/placeholder URLs hurt local SEO more than they help.
// parseSameAs (below) keeps only well-formed http(s) URLs so stray text can't
// leak into the structured data.

export interface SeoConfig {
  siteUrl: string
  siteName: string
  home: {
    title: string
    description: string
    keywords: string[]
    ogTitle: string
    ogDescription: string
  }
  shop: {
    title: string
    description: string
  }
  catalog: {
    title: string
    description: string
  }
  cart: {
    title: string
    description: string
  }
  // Templates for the per-category and per-product pages. Both expose a
  // small set of placeholders (see DEFAULT_*_TEMPLATE constants). Pages
  // call applyTemplate() with their own values to render the final string.
  templates: {
    categoryTitle: string
    categoryDescription: string
    productTitle: string
    productDescription: string
  }
  // Identity URLs (social profiles, Google Business Profile) for the
  // LocalBusiness `sameAs` field. Used by schema.org structured data.
  sameAs: string[]
  // Schema.org priceRange (e.g. "££"). Null when empty → omit the field.
  priceRange: string | null
  geo: {
    latitude: number | null
    longitude: number | null
  } | null
  // First Google Maps URL found in sameAs. Used for the hasMap property in
  // LocalBusiness structured data.
  mapsUrl: string | null
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// Parse the operator-supplied sameAs list. Accepts newlines or commas as
// separators (the settings field is a textarea) and keeps only well-formed
// http(s) URLs so non-URL text can't leak into the LocalBusiness schema.
function parseSameAs(value: string | null | undefined): string[] {
  const raw = trimOrNull(value)
  if (!raw) return []
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s))
}

interface GeoCoords {
  latitude: number
  longitude: number
}

// Extract exact place coordinates from a Google Maps URL. Modern share links
// encode the point as !3d<lat>!4d<lng>; fallback to the /@lat,lng viewport
// centre if the exact point is missing. Returns null if no coords are found.
function parseGoogleMapsCoords(url: string): GeoCoords | null {
  try {
    // Exact place coordinates: !3d51.5212077!4d-0.4966699
    const exactMatch = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
    if (exactMatch) {
      const lat = Number(exactMatch[1])
      const lng = Number(exactMatch[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }

    // Viewport centre: /@51.5212077,-0.4992448,516m
    const viewportMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    if (viewportMatch) {
      const lat = Number(viewportMatch[1])
      const lng = Number(viewportMatch[2])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }
  } catch {
    // Ignore malformed URLs.
  }
  return null
}

// Find the first Google Maps URL in the sameAs list and extract coordinates.
function extractGeoFromSameAs(sameAs: string[]): GeoCoords | null {
  for (const url of sameAs) {
    if (isGoogleMapsUrl(url)) {
      const coords = parseGoogleMapsCoords(url)
      if (coords) return coords
    }
  }
  return null
}

function isGoogleMapsUrl(url: string): boolean {
  return /google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url)
}

function findMapsUrl(sameAs: string[]): string | null {
  for (const url of sameAs) {
    if (isGoogleMapsUrl(url)) return url
  }
  return null
}

/**
 * Substitute `{category}`, `{product}`, and `{site}` placeholders in a
 * template string. Unknown placeholders are left untouched so a typo in
 * the template doesn't silently lose characters.
 */
export function applyTemplate(
  template: string,
  vars: { category?: string; product?: string; site?: string },
): string {
  return template
    .replace(/\{category\}/g, vars.category ?? '')
    .replace(/\{product\}/g, vars.product ?? '')
    .replace(/\{site\}/g, vars.site ?? '')
}

export async function loadSeoConfig(): Promise<SeoConfig> {
  let row: CompanySettingsRow | null = null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('company_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    row = (data ?? null) as CompanySettingsRow | null
  } catch (err) {
    // If admin credentials are missing in dev/build or the DB is
    // unreachable, fall back to safe defaults so public pages still
    // render professional metadata rather than crashing.
    console.warn('[seo] Could not load company_settings, using fallback SEO config:', err)
  }

  const siteName = trimOrNull(row?.company_name) ?? DEFAULT_SITE_NAME

  // Hard-coded, optimised public-page SEO. We intentionally ignore any
  // previously-stored title/description/template overrides so the site
  // always uses the best metadata.
  const homeTitle = DEFAULT_HOME_TITLE
  const homeDescription = DEFAULT_HOME_DESCRIPTION
  const ogTitle = DEFAULT_OG_TITLE
  const ogDescription = homeDescription

  const shopTitle = `${DEFAULT_SHOP_TITLE} | ${siteName}`
  const shopDescription = DEFAULT_SHOP_DESCRIPTION

  const cartTitle = `${DEFAULT_CART_TITLE} | ${siteName}`
  const cartDescription = DEFAULT_CART_DESCRIPTION

  const catalogTitle = `${DEFAULT_CATALOG_TITLE_FALLBACK} | ${siteName}`
  const catalogDescription = DEFAULT_CATALOG_DESCRIPTION_FALLBACK

  const categoryTitleTemplate = DEFAULT_CATEGORY_TITLE_TEMPLATE
  const categoryDescriptionTemplate = DEFAULT_CATEGORY_DESCRIPTION_TEMPLATE
  const productTitleTemplate = DEFAULT_PRODUCT_TITLE_TEMPLATE
  const productDescriptionTemplate = DEFAULT_PRODUCT_DESCRIPTION_TEMPLATE

  const sameAs = parseSameAs(row?.seo_same_as)
  // priceRange is hard-coded so it cannot drift or be overridden in Settings.
  // Schema.org LocalBusiness priceRange uses 1–4 currency symbols.
  const priceRange = '££'

  // Map coordinates are now taken from the Google Maps URL in the sameAs
  // list instead of manual lat/long inputs.
  const geoFromMaps = extractGeoFromSameAs(sameAs)
  const mapsUrl = findMapsUrl(sameAs)

  return {
    siteUrl: SITE_URL,
    siteName,
    home: {
      title: homeTitle,
      description: homeDescription,
      keywords: [...new Set(DEFAULT_KEYWORDS)],
      ogTitle,
      ogDescription,
    },
    shop: {
      title: shopTitle,
      description: shopDescription,
    },
    catalog: {
      title: catalogTitle,
      description: catalogDescription,
    },
    cart: {
      title: cartTitle,
      description: cartDescription,
    },
    templates: {
      categoryTitle: categoryTitleTemplate,
      categoryDescription: categoryDescriptionTemplate,
      productTitle: productTitleTemplate,
      productDescription: productDescriptionTemplate,
    },
    sameAs,
    priceRange,
    geo: geoFromMaps,
    mapsUrl,
  }
}

export function canonical(path: string): string {
  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '')
  // Root always carries a trailing slash; every other path is slash-less
  // to match Next.js' default `trailingSlash: false`, the internal links,
  // the sitemap and robots.txt. Previously this appended a trailing slash
  // to non-root paths (e.g. /quote/), which conflicted with the canonical
  // URL form actually served and linked across the site.
  if (!cleanPath) return `${SITE_URL}/`
  return `${SITE_URL}/${cleanPath}`
}

/**
 * Resolve a product image path or absolute URL into a full absolute URL.
 * Handles both local `/products/IMG-xxx.webp` paths and remote Supabase
 * Storage URLs so JSON-LD and Open Graph tags never double-prefix URLs.
 */
export function resolveAbsoluteUrl(
  siteUrl: string,
  pathOrUrl: string | null | undefined,
): string | undefined {
  if (!pathOrUrl) return undefined
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  const prefix = pathOrUrl.startsWith('/') ? '' : '/'
  return `${siteUrl}${prefix}${pathOrUrl}`
}
