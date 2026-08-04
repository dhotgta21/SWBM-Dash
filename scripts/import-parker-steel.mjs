#!/usr/bin/env node
/**
 * Import scraped Parker Steel products into Supabase.
 *
 * Usage:
 *   node scripts/import-parker-steel.mjs
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PRODUCTS_FILE = resolve(__dirname, '..', '.tmp', 'parker-steel-products.json')
const IMAGE_DEST_DIR = resolve(__dirname, '..', 'public', 'products')

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

const CATEGORY_PREFIX = {
  'Mild Steel': 'PMS',
  'Bright Steel': 'PBS',
  'Stainless Steel': 'PSS',
  'Aluminium': 'PAL',
  'Galvanised': 'PGL',
  'Fittings': 'PFI',
}

function cleanFilename(slug, material) {
  const cleanSlug = decodeURIComponent(slug)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
  const mat = material.toLowerCase().replace(/\s+/g, '-')
  return `${cleanSlug}-${mat}.webp`
}

async function ensureDestImage(sourcePath, targetFilename) {
  if (!sourcePath) return ''
  const fullSource = sourcePath.startsWith('/parker-steel-images/')
    ? resolve(__dirname, '..', '.tmp', sourcePath.replace(/^\//, ''))
    : sourcePath

  if (!existsSync(fullSource) && !sourcePath.startsWith('http')) return ''

  mkdirSync(IMAGE_DEST_DIR, { recursive: true })
  const destPath = resolve(IMAGE_DEST_DIR, targetFilename)

  try {
    if (sourcePath.startsWith('http')) {
      const res = await fetch(sourcePath)
      if (!res.ok) return ''
      const buffer = Buffer.from(await res.arrayBuffer())
      await sharp(buffer).webp({ quality: 85 }).toFile(destPath)
    } else {
      await sharp(fullSource).webp({ quality: 85 }).toFile(destPath)
    }
    return `/products/${targetFilename}`
  } catch (e) {
    console.warn(`Image conversion failed for ${sourcePath}: ${e.message}`)
    return ''
  }
}

function dedupeVariants(variants) {
  const seen = new Map()
  for (const v of variants) {
    if (!seen.has(v.material)) {
      seen.set(v.material, v)
    }
  }
  return Array.from(seen.values())
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (!existsSync(PRODUCTS_FILE)) {
    console.error(`Scraped data not found: ${PRODUCTS_FILE}`)
    process.exit(1)
  }

  const rawProducts = JSON.parse(readFileSync(PRODUCTS_FILE, 'utf-8'))
  console.log(`Importing ${rawProducts.length} products...`)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const product of rawProducts) {
    const variants = dedupeVariants(product.variants || [])
    if (variants.length === 0) {
      console.warn(`No variants for ${product.name}, skipping`)
      continue
    }

    const materials = variants.map((v) => v.material)
    const category = product.category || materials[0] || 'Mild Steel'
    const prefix = CATEGORY_PREFIX[category] || 'PST'
    const code = `${prefix}-${product.familySlug.replace(/-%26-/g, '-').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 30).toUpperCase()}`

    // Convert images
    const imageMap = new Map()
    for (const v of variants) {
      const filename = cleanFilename(product.familySlug, v.material)
      const url = await ensureDestImage(v.image || v.sourceImage, filename)
      imageMap.set(v.material, url)
    }

    const primaryImage = imageMap.get(variants[0].material) || ''

    const variantOptions = variants.map((v) => ({
      material: v.material,
      image: imageMap.get(v.material) || primaryImage,
      selectors: v.selectors.map((s) => ({
        name: s.name,
        label: s.label,
        options: s.options,
      })),
    }))

    const row = {
      code,
      name: product.name,
      description: product.description,
      unit: 'EA',
      category,
      default_price: 0,
      price_from: null,
      image_url: primaryImage,
      is_active: true,
      materials,
      variant_options: variantOptions,
      family_slug: product.familySlug,
      source_url: product.sourceUrl,
    }

    const { error } = await supabase
      .from('products')
      .upsert(row, { onConflict: 'code', ignoreDuplicates: false })

    if (error) {
      console.error(`Failed to import ${product.name}:`, error.message)
      continue
    }

    console.log(`Imported: ${code} — ${product.name}`)
  }

  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
