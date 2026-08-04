#!/usr/bin/env node
/**
 * Import scraped Parker Steel fittings / tools into Supabase.
 *
 * Usage:
 *   node scripts/import-parker-fittings-tools.mjs
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PRODUCTS_FILE = resolve(__dirname, '..', '.tmp', 'parker-fittings-tools-products.json')
const IMAGE_DEST_DIR = resolve(__dirname, '..', 'public', 'products')
const PROGRESS_FILE = resolve(__dirname, '..', '.tmp', 'parker-fittings-tools-import-progress.json')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

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
  Fixings: 'PFI',
  Tools: 'TOL',
}

function cleanFilename(id, name) {
  const safe = name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${id}-${safe}.webp`
}

async function ensureDestImage(sourcePath, targetFilename) {
  if (!sourcePath) return ''
  const fullSource = sourcePath.startsWith('/parker-fittings-tools-images/')
    ? resolve(__dirname, '..', '.tmp', sourcePath.replace(/^\//, ''))
    : sourcePath

  if (!existsSync(fullSource) && !sourcePath.startsWith('http')) return ''

  mkdirSync(IMAGE_DEST_DIR, { recursive: true })
  const destPath = resolve(IMAGE_DEST_DIR, targetFilename)

  try {
    if (sourcePath.startsWith('http')) {
      const res = await fetch(sourcePath, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
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

  let progress = { lastIndex: -1 }
  if (existsSync(PROGRESS_FILE)) {
    progress = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
    console.log(`Resuming from index ${progress.lastIndex + 1}`)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (let i = progress.lastIndex + 1; i < rawProducts.length; i++) {
    const product = rawProducts[i]
    const category = product.category || 'Fixings'
    const prefix = CATEGORY_PREFIX[category] || 'PST'
    const code = `${prefix}-${product.id}`

    const filename = cleanFilename(product.id, product.name)
    const imageUrl = await ensureDestImage(product.image || product.sourceImage, filename)

    const description = [product.description, product.specs?.length ? product.specs.join('\n') : '']
      .filter(Boolean)
      .join('\n\n')

    const row = {
      code,
      name: product.name,
      description,
      unit: 'EA',
      category,
      default_price: 0,
      price_from: product.price || null,
      image_url: imageUrl,
      is_active: true,
      materials: [],
      variant_options: [],
      family_slug: product.classCode || category.toLowerCase(),
      source_url: product.sourceUrl,
    }

    const { error } = await supabase
      .from('products')
      .upsert(row, { onConflict: 'code', ignoreDuplicates: false })

    if (error) {
      console.error(`Failed to import ${product.name}:`, error.message)
      continue
    }

    progress.lastIndex = i
    if ((i + 1) % 50 === 0) {
      writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
      console.log(`Imported ${i + 1}/${rawProducts.length} — latest: ${code}`)
    }

    await sleep(150)
  }

  writeFileSync(PROGRESS_FILE, JSON.stringify(progress))
  console.log('\nDone.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
