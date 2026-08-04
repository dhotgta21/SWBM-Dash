#!/usr/bin/env node
/**
 * Deep-dive audit of every product in the public.products table.
 *
 * For each row we check the SEO hygiene of the page Google will see and
 * print a per-issue breakdown plus a list of every product that is missing
 * one of the critical fields.  Run with:
 *
 *   node scripts/audit-products.mjs
 *
 * Output (stdout) is the human-readable report.  The raw dump is also
 * written to .tmp/audit-products-<timestamp>.json so you can paste the
 * JSON back to Mavis for a deeper analysis if anything needs follow-up.
 *
 * Uses the public anon key — every active product is SELECT-able for
 * anonymous visitors, so we don't need the service-role key.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

function loadEnv(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && !(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch (err) {
    console.warn('Could not load .env.local:', err.message)
  }
}

loadEnv(path.join(REPO_ROOT, '.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

if (SUPABASE_URL.includes('YOUR-PROJECT-REF')) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL is still the template placeholder. ' +
      'Replace it with your real Supabase project URL in .env.local.'
  )
  process.exit(1)
}

const COLUMNS = [
  'id',
  'code',
  'name',
  'description',
  'short_description',
  'seo_title',
  'seo_description',
  'unit',
  'category',
  'default_price',
  'image_url',
  'is_active',
  'is_temporary',
  'brand',
  'mpn',
  'key_features',
  'search_tags',
  'applications',
  'materials',
  'length_mm',
  'width_mm',
  'height_mm',
  'thickness_mm',
  'unit_weight_kg',
  'family_slug',
  'updated_at',
].join(',')

async function fetchAllProducts() {
  // Use the anon key against the public REST API. The catalogue is small
  // enough (a few hundred rows) to load in one shot with pagination. We
  // sort by category, then name to keep the report readable.
  const PAGE = 500
  const rows = []
  let offset = 0
  for (;;) {
    const qs = new URLSearchParams({
      select: COLUMNS,
      is_active: 'eq.true',
      is_temporary: 'eq.false',
      order: 'category.asc,name.asc',
      limit: String(PAGE),
      offset: String(offset),
    })
    const url = `${SUPABASE_URL}/rest/v1/products?${qs}`
    const res = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Supabase REST error ${res.status}: ${body}`)
    }
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < PAGE) break
    offset += PAGE
    if (offset > 50_000) break // safety
  }
  return rows
}

function isEmptyString(s) {
  return s == null || String(s).trim() === ''
}

function isEmptyArray(a) {
  return !Array.isArray(a) || a.length === 0
}

function titleLength(s) {
  if (!s) return 0
  return String(s).length
}

function descLength(s) {
  if (!s) return 0
  return String(s).length
}

function audit(products) {
  const issues = {
    missingImage: [],
    missingCode: [],
    missingName: [],
    missingCategory: [],
    missingSeoTitle: [],
    missingSeoDescription: [],
    missingShortDescription: [],
    missingDescription: [],
    missingKeyFeatures: [],
    missingApplications: [],
    missingSearchTags: [],
    missingMaterials: [],
    missingUnit: [],
    seoTitleOver60: [],
    seoDescriptionOver160: [],
    defaultPriceZero: [],
  }

  const categoryStats = new Map()
  const imageStats = { withImage: 0, withoutImage: 0 }
  const seoStats = {
    withSeoTitle: 0,
    withSeoDescription: 0,
    withShortDescription: 0,
    withKeyFeatures: 0,
    withApplications: 0,
    withSearchTags: 0,
  }
  const summary = {
    total: products.length,
    active: 0,
    inactive: 0,
    temporary: 0,
  }

  for (const p of products) {
    const id = p.id
    const code = p.code
    const label = `${code ?? '?'} — ${p.name ?? '<unnamed>'}`

    if (p.is_active === false) {
      summary.inactive += 1
    } else {
      summary.active += 1
    }
    if (p.is_temporary) summary.temporary += 1

    if (isEmptyString(code)) issues.missingCode.push(label)
    if (isEmptyString(p.name)) issues.missingName.push(label)
    if (isEmptyString(p.category)) issues.missingCategory.push(label)
    if (isEmptyString(p.unit)) issues.missingUnit.push(label)
    if (isEmptyString(p.image_url)) {
      issues.missingImage.push(label)
      imageStats.withoutImage += 1
    } else {
      imageStats.withImage += 1
    }
    if (isEmptyString(p.description)) issues.missingDescription.push(label)
    if (isEmptyString(p.seo_title)) {
      issues.missingSeoTitle.push(label)
    } else {
      seoStats.withSeoTitle += 1
      if (titleLength(p.seo_title) > 60) {
        issues.seoTitleOver60.push({ label, length: titleLength(p.seo_title), value: p.seo_title })
      }
    }
    if (isEmptyString(p.seo_description)) {
      issues.missingSeoDescription.push(label)
    } else {
      seoStats.withSeoDescription += 1
      if (descLength(p.seo_description) > 160) {
        issues.seoDescriptionOver160.push({
          label,
          length: descLength(p.seo_description),
          value: p.seo_description,
        })
      }
    }
    if (isEmptyString(p.short_description)) {
      issues.missingShortDescription.push(label)
    } else {
      seoStats.withShortDescription += 1
    }
    if (isEmptyArray(p.key_features)) {
      issues.missingKeyFeatures.push(label)
    } else {
      seoStats.withKeyFeatures += 1
    }
    if (isEmptyArray(p.applications)) {
      issues.missingApplications.push(label)
    } else {
      seoStats.withApplications += 1
    }
    if (isEmptyArray(p.search_tags)) {
      issues.missingSearchTags.push(label)
    } else {
      seoStats.withSearchTags += 1
    }
    if (isEmptyArray(p.materials)) issues.missingMaterials.push(label)
    if (!p.default_price || Number(p.default_price) === 0) {
      issues.defaultPriceZero.push(label)
    }

    const cat = p.category ?? '∅ (no category)'
    const cur = categoryStats.get(cat) ?? {
      count: 0,
      withImage: 0,
      withoutImage: 0,
      withSeo: 0,
      withAllSeo: 0,
    }
    cur.count += 1
    if (!isEmptyString(p.image_url)) cur.withImage += 1
    else cur.withoutImage += 1
    const fullSeo =
      !isEmptyString(p.seo_title) &&
      !isEmptyString(p.seo_description) &&
      !isEmptyString(p.short_description) &&
      !isEmptyArray(p.key_features) &&
      !isEmptyArray(p.applications) &&
      !isEmptyArray(p.search_tags)
    if (!isEmptyString(p.seo_title) || !isEmptyString(p.seo_description)) cur.withSeo += 1
    if (fullSeo) cur.withAllSeo += 1
    categoryStats.set(cat, cur)
  }

  return { issues, imageStats, seoStats, summary, categoryStats }
}

function printReport({ issues, imageStats, seoStats, summary, categoryStats }) {
  const lines = []
  const hr = (c = '─', n = 78) => c.repeat(n)

  lines.push(hr('═'))
  lines.push('PRODUCT AUDIT — DEEP DIVE')
  lines.push(hr('═'))
  lines.push('')
  lines.push(`Total products scanned:    ${summary.total}`)
  lines.push(`  • active:                ${summary.active}`)
  lines.push(`  • inactive:              ${summary.inactive}`)
  lines.push(`  • temporary (excluded):  ${summary.temporary}`)
  lines.push('')
  lines.push('IMAGES')
  lines.push(hr())
  lines.push(`  • with image_url:        ${imageStats.withImage}`)
  lines.push(`  • without image_url:     ${imageStats.withoutImage}`)
  const pct = ((imageStats.withImage / Math.max(1, summary.total)) * 100).toFixed(1)
  lines.push(`  • coverage:              ${pct}%`)
  lines.push('')
  lines.push('SEO FIELDS')
  lines.push(hr())
  lines.push(`  • with seo_title:        ${seoStats.withSeoTitle}`)
  lines.push(`  • with seo_description:  ${seoStats.withSeoDescription}`)
  lines.push(`  • with short_description:${seoStats.withShortDescription}`)
  lines.push(`  • with key_features:     ${seoStats.withKeyFeatures}`)
  lines.push(`  • with applications:     ${seoStats.withApplications}`)
  lines.push(`  • with search_tags:      ${seoStats.withSearchTags}`)
  lines.push('')
  lines.push('PER-CATEGORY BREAKDOWN')
  lines.push(hr())
  const cats = Array.from(categoryStats.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  for (const [name, s] of cats) {
    lines.push(`  ${name}`)
    lines.push(
      `    count=${s.count}  withImage=${s.withImage}  withoutImage=${s.withoutImage}  fullSEO=${s.withAllSeo}/${s.count}`
    )
  }
  lines.push('')

  // Per-issue section.
  const printList = (title, items, opts = {}) => {
    lines.push(title)
    lines.push(hr())
    if (items.length === 0) {
      lines.push('  ✓ none')
    } else {
      lines.push(`  ${items.length} item(s)`)
      for (const item of items) {
        if (typeof item === 'string') {
          lines.push(`  - ${item}`)
        } else {
          const extra = opts.showLength ? ` (${item.length} chars)` : ''
          lines.push(`  - ${item.label}${extra}`)
          if (opts.showValue) lines.push(`      ${item.value}`)
        }
      }
    }
    lines.push('')
  }

  lines.push('ISSUES')
  lines.push(hr('═'))
  lines.push('')
  printList('Products missing an image_url (candidates for image work):', issues.missingImage)
  printList('Products missing a code (STL-014 etc.) — data integrity bug:', issues.missingCode)
  printList('Products missing a name — data integrity bug:', issues.missingName)
  printList('Products missing a category — will not appear in any /quote/<cat> page:', issues.missingCategory)
  printList('Products missing a unit — defaults to EA silently:', issues.missingUnit)
  printList('Products with no description at all (rely on fallback):', issues.missingDescription)
  printList('Products missing seo_title (Google falls back to template):', issues.missingSeoTitle)
  printList('Products missing seo_description (SERPs will auto-generate):', issues.missingSeoDescription)
  printList('Products missing short_description (cards look thin):', issues.missingShortDescription)
  printList('Products missing key_features (no schema.org/additionalProperty):', issues.missingKeyFeatures)
  printList('Products missing applications (no on-page "Typical uses" list):', issues.missingApplications)
  printList("Products missing search_tags (will not be matched by hybrid search):", issues.missingSearchTags)
  printList('Products missing materials (no schema.org/Product.material):', issues.missingMaterials)
  printList('Products with seo_title longer than 60 chars (will be truncated):', issues.seoTitleOver60, {
    showLength: true,
    showValue: true,
  })
  printList('Products with seo_description longer than 160 chars (will be truncated):', issues.seoDescriptionOver160, {
    showLength: true,
    showValue: true,
  })
  printList('Products with default_price = 0 (display as "Price on application"):', issues.defaultPriceZero)

  return lines.join('\n')
}

async function main() {
  console.log('Fetching products from Supabase…')
  let products
  try {
    products = await fetchAllProducts()
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  console.log(`Fetched ${products.length} products. Auditing…`)

  const result = audit(products)
  const report = printReport(result)
  console.log('\n' + report)

  // Also dump a machine-readable copy so Mavis (or the operator) can do
  // a follow-up analysis without re-querying the API.
  const outDir = path.join(REPO_ROOT, '.tmp')
  fs.mkdirSync(outDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(outDir, `audit-products-${ts}.json`)
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        summary: result.summary,
        imageStats: result.imageStats,
        seoStats: result.seoStats,
        categoryStats: Array.from(result.categoryStats.entries()).map(([name, s]) => ({
          name,
          ...s,
        })),
        issues: result.issues,
        products: products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          image_url: p.image_url,
          has_seo_title: !!p.seo_title,
          has_seo_description: !!p.seo_description,
          has_short_description: !!p.short_description,
          has_description: !!p.description,
          has_key_features: Array.isArray(p.key_features) && p.key_features.length > 0,
          has_applications: Array.isArray(p.applications) && p.applications.length > 0,
          has_search_tags: Array.isArray(p.search_tags) && p.search_tags.length > 0,
          has_materials: Array.isArray(p.materials) && p.materials.length > 0,
          default_price_zero: !p.default_price || Number(p.default_price) === 0,
        })),
      },
      null,
      2
    )
  )
  console.log(`\nMachine-readable dump written to ${outFile}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
