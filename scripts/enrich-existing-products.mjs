#!/usr/bin/env node
/**
 * Back-fill missing category, description and image_url for existing products.
 *
 * Usage:
 *   node scripts/enrich-existing-products.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8')
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

loadEnvFile(join(__dirname, '..', '.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CATEGORY_PREFIXES = {
  'Aggregates & Cement': 'AGG',
  Plasterboard: 'PLA',
  Blocks: 'BLO',
  'Cavity Insulation': 'CAV',
  Bricks: 'BRI',
  Timber: 'TIM',
  'PIR Insulation': 'PIR',
  'Sheet Materials': 'SHE',
  'Cement & Additives': 'CEM',
  'Steel & Lintels': 'STL',
  Roofing: 'ROO',
  Drainage: 'DRA',
  Tools: 'TOL',
  Fixings: 'FIX',
  Miscellaneous: 'MIS',
}

const CATEGORY_BY_CODE = {
  BLOCK: 'Blocks',
  'BUILDING SAND': 'Aggregates & Cement',
  ADMIX: 'Cement & Additives',
  BRICK: 'Bricks',
  UNI: 'Fixings',
  'WALLTIES 250MM': 'Fixings',
}

function descriptionFor(product) {
  const { name, category } = product
  const n = name.trim()
  const c = category || 'product'
  const templates = [
    `${n} — high-quality ${c.toLowerCase()} suitable for trade and domestic building projects.`,
    `Professional-grade ${n.toLowerCase()} for reliable performance on site.`,
    `${n} supplied for construction, renovation and maintenance applications.`,
    `Durable ${n.toLowerCase()} ideal for ${c.toLowerCase()} work.`,
    `${n} — a dependable ${c.toLowerCase()} choice for builders and contractors.`,
  ]
  // Deterministically pick one based on name length.
  return templates[n.length % templates.length]
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const imageDir = resolve(__dirname, '..', 'public', 'products')
  const imageFiles = new Set(readdirSync(imageDir))

  // Find products missing name, category, description or image.
  const { data: products, error } = await supabase
    .from('products')
    .select('id, code, name, category, description, image_url')
    .or('category.is.null,description.is.null,image_url.is.null')

  if (error) {
    console.error('Failed to query products:', error.message)
    process.exit(1)
  }

  console.log(`Found ${products.length} products needing enrichment.`)

  let updated = 0
  for (const p of products) {
    const updates = {}

    if (!p.name || p.name.trim() === '') {
      updates.name = p.code
    }

    if (!p.category || p.category.trim() === '') {
      updates.category = CATEGORY_BY_CODE[p.code] || 'Miscellaneous'
    }

    const category = updates.category || p.category

    if (!p.description || p.description.trim() === '') {
      updates.description = descriptionFor({ name: updates.name || p.name, category })
    }

    if (!p.image_url || p.image_url.trim() === '') {
      const specific = `IMG-${p.code}.webp`
      const prefix = CATEGORY_PREFIXES[category] || category.substring(0, 3).toUpperCase()
      const generic = `IMG-${prefix}-001.webp`
      if (imageFiles.has(specific)) {
        updates.image_url = `/products/${specific}`
      } else if (imageFiles.has(generic)) {
        updates.image_url = `/products/${generic}`
      }
    }

    if (Object.keys(updates).length === 0) continue

    const { error: updateError } = await supabase
      .from('products')
      .update(updates)
      .eq('id', p.id)

    if (updateError) {
      console.error(`Failed to update ${p.code}:`, updateError.message)
    } else {
      updated++
      console.log(`Updated ${p.code}:`, Object.keys(updates).join(', '))
    }
  }

  console.log(`\nUpdated ${updated} products.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
