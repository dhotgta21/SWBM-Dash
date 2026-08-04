// Generate a Google Merchant Center product feed CSV from the Supabase catalogue.
// Usage: node scripts/generate-google-merchant-csv.mjs [output.csv]
//
// The CSV follows Google Merchant Center spec:
// https://support.google.com/merchants/answer/7052112

import * as fs from 'fs'
import * as path from 'path'

const OUTPUT_PATH = process.argv[2] || 'google-merchant-products.csv'
const SITE_URL = 'https://www.starhawkbm.com'

// Read Supabase credentials from .env.local
const envFile = fs.readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/)
  if (m) env[m[1]] = m[2].trim()
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// Google product category mapping (Google taxonomy paths)
const CATEGORY_TO_GOOGLE = {
  'Aggregates & Cement': 'Home & Garden > Building Materials > Concrete, Cement & Masonry',
  'Cement & Additives': 'Home & Garden > Building Materials > Concrete, Cement & Masonry',
  Blocks: 'Home & Garden > Building Materials > Bricks & Blocks',
  Bricks: 'Home & Garden > Building Materials > Bricks & Blocks',
  Timber: 'Home & Garden > Building Materials > Lumber & Wood',
  'Sheet Materials': 'Home & Garden > Building Materials > Lumber & Wood',
  Roofing: 'Home & Garden > Building Materials > Roofing',
  Fixings: 'Hardware > Hardware Accessories',
  'Steel & Lintels': 'Home & Garden > Building Materials',
  Plasterboard: 'Home & Garden > Building Materials > Drywall',
  'Cavity Insulation': 'Home & Garden > Building Materials > Insulation',
  'PIR Insulation': 'Home & Garden > Building Materials > Insulation',
  Drainage: 'Home & Garden > Building Materials',
  Tools: 'Hardware > Tools',
  Miscellaneous: 'Home & Garden > Building Materials',
}

// Unit measure mapping for unit_pricing_measure / unit_pricing_base_measure
const UNIT_MEASURE = {
  EA: '1 ct',
  BAG: '1 bag',
  SHEET: '1 sheet',
  M: '1 m',
  M2: '1 m2',
  M3: '1 m3',
  KG: '1 kg',
  TON: '1000 kg',
  LTR: '1 l',
  HM: '1 hm',
  TH: '1 th',
  PK: '1 pk',
  ROLL: '1 roll',
  BOX: '1 box',
}

const UNIT_BASE = {
  EA: '1 ct',
  BAG: '1 bag',
  SHEET: '1 sheet',
  M: '1 m',
  M2: '1 m2',
  M3: '1 m3',
  KG: '1 kg',
  TON: '1 ton',
  LTR: '1 l',
  HM: '1 hm',
  TH: '1 th',
  PK: '1 pk',
  ROLL: '1 roll',
  BOX: '1 box',
}

function resolveUrl(base, rel) {
  if (!rel) return ''
  if (/^https?:\/\//i.test(rel)) return rel
  const sep = rel.startsWith('/') ? '' : '/'
  return `${base.replace(/\/+$/, '')}${sep}${rel}`
}

function cleanDescription(description, name, category) {
  if (!description) {
    return `${name}${category ? ` — ${category}` : ''}. Trade-quality building material from Star Hawk Builders Merchant. Same-day delivery available across Greater London and the Home Counties.`
  }
  // Strip common boilerplate phrases copied across the imported catalogue.
  const boilerplate = [
    'supplied for trade and domestic building work',
    'weather-resistant product for pitched or flat roof details and rainwater goods',
    'dependable fixing for secure connections in masonry, timber or steelwork',
    'quality-assured material that mixes and finishes as expected on site',
    'strong masonry block for load-bearing walls, partitions and structural infill',
    'versatile panel for flooring, roofing, wall sheathing or formwork',
    'treated or graded timber for structural frames, roofing and finishing details',
    'improves thermal and acoustic performance inside cavity construction',
    'structural steel or lintel component for openings and load-bearing frames',
    'wallboard and finishing plaster for smooth internal surfaces',
    'consistent quality facing or engineering brick for a range of brickwork finishes',
    'rigid insulation board giving high thermal efficiency in a slim build-up',
  ]
  let cleaned = description.replace(/\s+/g, ' ').trim()
  for (const phrase of boilerplate) {
    cleaned = cleaned.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
  if (cleaned.length < 20) cleaned = description.trim()
  // Google recommends 500–5000 chars; cap at 5000.
  return cleaned.slice(0, 5000)
}

function csvEscape(value) {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Low-end UK trade price estimates by category + unit.
// These are intentionally set low for competitive positioning.
// YOU MUST VERIFY AND ADJUST BEFORE GOING LIVE.
const CATEGORY_UNIT_PRICE_GBP = {
  'Aggregates & Cement': { TON: 38.0, BAG: 4.5, EA: 5.0, default: 38.0 },
  'Cement & Additives': { BAG: 4.5, EA: 4.5, default: 4.5 },
  Blocks: { EA: 0.9, default: 0.9 },
  Bricks: { EA: 0.2, default: 0.2 },
  Timber: { EA: 4.0, M: 2.5, default: 4.0 },
  'Sheet Materials': { SHEET: 12.0, EA: 12.0, M2: 6.0, default: 12.0 },
  Roofing: { EA: 0.6, ROLL: 18.0, M: 1.5, M2: 4.5, default: 0.6 },
  Fixings: { BOX: 6.5, EA: 0.15, PK: 3.5, default: 0.15 },
  'Steel & Lintels': { EA: 14.0, M: 6.0, default: 14.0 },
  Plasterboard: { SHEET: 6.5, EA: 6.5, M2: 3.5, default: 6.5 },
  'Cavity Insulation': { SHEET: 8.5, M2: 4.0, default: 8.5 },
  'PIR Insulation': { SHEET: 11.0, M2: 5.5, default: 11.0 },
  Drainage: { M: 3.0, EA: 6.5, default: 6.5 },
  Tools: { EA: 7.5, default: 7.5 },
  Miscellaneous: { EA: 2.5, default: 2.5 },
}

function estimatePrice(category, unit, name) {
  const catKey = category || 'Miscellaneous'
  const unitKey = (unit || 'EA').toUpperCase()
  const map = CATEGORY_UNIT_PRICE_GBP[catKey] || CATEGORY_UNIT_PRICE_GBP.Miscellaneous
  let price = map[unitKey] ?? map.default ?? 1.0

  // A few name-based tweaks to keep things plausible but still low.
  const lower = (name || '').toLowerCase()
  if (catKey === 'Bricks') price = 0.2
  if (catKey === 'Blocks' && lower.includes('aircrete')) price = 1.2
  if (catKey === 'Blocks' && lower.includes('hollow')) price = 0.75
  if (catKey === 'Aggregates & Cement' && lower.includes('cement')) price = 4.5
  if (catKey === 'Aggregates & Cement' && (lower.includes('ballast') || lower.includes('gravel'))) price = 42.0
  if (catKey === 'Aggregates & Cement' && lower.includes('sand')) price = 35.0
  if (catKey === 'Aggregates & Cement' && (lower.includes('type 1') || lower.includes('sub-base'))) price = 32.0
  if (catKey === 'Plasterboard' && lower.includes('fire')) price = 8.5
  if (catKey === 'Plasterboard' && lower.includes('moisture')) price = 8.0
  if (catKey === 'Timber' && lower.includes('cls')) price = 4.5
  if (catKey === 'Timber' && lower.includes('cladding')) price = 9.0
  if (catKey === 'Timber' && lower.includes('skirting')) price = 5.5
  if (catKey === 'Sheet Materials' && lower.includes('plywood')) price = 18.0
  if (catKey === 'Sheet Materials' && lower.includes('osb')) price = 14.0
  if (catKey === 'Sheet Materials' && lower.includes('mdf')) price = 15.0
  if (catKey === 'Steel & Lintels' && lower.includes('beam')) price = 28.0
  if (catKey === 'Steel & Lintels' && lower.includes('lintel')) price = 16.0
  if (catKey === 'Roofing' && lower.includes('tile')) price = 0.5
  if (catKey === 'Roofing' && (lower.includes('underlay') || lower.includes('felt'))) price = 22.0
  if (catKey === 'Roofing' && lower.includes('dry ridge')) price = 38.0
  if (catKey === 'Fixings' && lower.includes('wall tie')) price = 0.12
  if (catKey === 'Fixings' && lower.includes('screw')) price = 5.5
  if (catKey === 'Fixings' && lower.includes('nail')) price = 4.5

  return Number(price.toFixed(2))
}

function formatPrice(value) {
  const num = Number(value)
  if (Number.isNaN(num)) return ''
  return `${num.toFixed(2)} GBP`
}

async function fetchProducts() {
  const columns = [
    'id',
    'code',
    'name',
    'description',
    'unit',
    'default_price',
    'price_from',
    'category',
    'image_url',
    'brand',
    'mpn',
    'length_mm',
    'width_mm',
    'height_mm',
    'thickness_mm',
    'unit_weight_kg',
    'pack_size',
  ].join(',')

  const qs = `select=${columns}&is_active=eq.true&limit=1000`
  const apiUrl = `${url}/rest/v1/products?${qs}`
  const res = await fetch(apiUrl, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) {
    console.error('Supabase REST error:', res.status, await res.text())
    process.exit(1)
  }
  return res.json()
}

function rowToCsv(row) {
  const dbPrice = Number(row.price_from ?? row.default_price ?? 0)
  const effectivePrice = dbPrice > 0 ? dbPrice : estimatePrice(row.category, row.unit, row.name)

  const id = row.code
  const title = row.name
  const description = cleanDescription(row.description, row.name, row.category)
  const link = `${SITE_URL}/products/${encodeURIComponent(row.code)}`
  const imageLink = resolveUrl(SITE_URL, row.image_url)
  const availability = 'in stock'
  const condition = 'new'
  const priceStr = formatPrice(effectivePrice)
  const googleProductCategory = CATEGORY_TO_GOOGLE[row.category] || 'Home & Garden > Building Materials'
  const productType = row.category || 'Building Materials'
  const brand = row.brand || 'Star Hawk Builders Merchant'
  const mpn = row.mpn || row.code
  const shipping = 'GB::0.00 GBP'
  const identifierExists = 'yes'

  // Size / dimensions for Google
  const dims = []
  if (row.length_mm) dims.push(`${row.length_mm}mm L`)
  if (row.width_mm) dims.push(`${row.width_mm}mm W`)
  if (row.height_mm) dims.push(`${row.height_mm}mm H`)
  if (row.thickness_mm) dims.push(`${row.thickness_mm}mm T`)
  const size = dims.join(' x ') || ''

  const unit = (row.unit || '').toUpperCase()
  const unitPricingMeasure = UNIT_MEASURE[unit] || ''
  const unitPricingBaseMeasure = UNIT_BASE[unit] || ''

  return [
    id,
    title,
    description,
    link,
    imageLink,
    availability,
    condition,
    priceStr,
    googleProductCategory,
    productType,
    brand,
    mpn,
    shipping,
    identifierExists,
    size,
    unitPricingMeasure,
    unitPricingBaseMeasure,
    row.unit || '',
  ].map(csvEscape)
}

async function main() {
  console.log('Fetching products from Supabase...')
  const products = await fetchProducts()
  console.log(`Found ${products.length} active products.`)

  if (products.length === 0) {
    console.log('No products to export.')
    return
  }

  const headers = [
    'id',
    'title',
    'description',
    'link',
    'image_link',
    'availability',
    'condition',
    'price',
    'google_product_category',
    'product_type',
    'brand',
    'mpn',
    'shipping',
    'identifier_exists',
    'size',
    'unit_pricing_measure',
    'unit_pricing_base_measure',
    'unit',
  ]

  const lines = [headers.join(','), ...products.map(rowToCsv).map((cols) => cols.join(','))]
  const csv = lines.join('\r\n')

  fs.writeFileSync(OUTPUT_PATH, '\uFEFF' + csv, 'utf8')
  console.log(`Wrote ${products.length} products to ${path.resolve(OUTPUT_PATH)}`)

  // Print warnings about estimated prices and missing images.
  const estimatedCount = products.filter((p) => !(p.price_from > 0 || p.default_price > 0)).length
  const missingImage = products.filter((p) => !p.image_url)
  if (estimatedCount) {
    console.warn(`\nNote: ${estimatedCount} product(s) had no database price and were assigned low estimated trade prices.`)
    console.warn('Please review and adjust these in the CSV before uploading to Google Merchant Center.')
  }
  if (missingImage.length) {
    console.warn(`\nWarning: ${missingImage.length} product(s) have no image_url:`)
    for (const p of missingImage.slice(0, 5)) console.warn(`  - ${p.code}: ${p.name}`)
    if (missingImage.length > 5) console.warn(`  ... and ${missingImage.length - 5} more`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
