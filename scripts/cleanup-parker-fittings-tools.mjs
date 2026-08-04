#!/usr/bin/env node
/**
 * Remove all Parker Steel fittings/tools products that use the 7-digit
 * tools-product ID format, along with their downloaded images and temp files.
 *
 * Usage:
 *   node scripts/cleanup-parker-fittings-tools.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, unlinkSync, rmSync, readdirSync } from 'fs'
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

const IMAGE_DEST_DIR = resolve(__dirname, '..', 'public', 'products')
const TMP_DIR = resolve(__dirname, '..', '.tmp')

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Match products imported from /tools-product/{7 digits}-... or with PFI-/TOL- codes.
  const { data, error, count } = await supabase
    .from('products')
    .select('id, code, source_url, image_url', { count: 'exact' })
    .or('source_url.ilike.%/tools-product/_______-%,code.like.PFI-%,code.like.TOL-%')

  if (error) {
    console.error('Failed to query products:', error.message)
    process.exit(1)
  }

  console.log(`Found ${count} fittings/tools products to remove.`)

  // Delete associated image files.
  let imagesRemoved = 0
  let imagesMissing = 0
  for (const p of data || []) {
    if (!p.image_url) continue
    const filename = p.image_url.replace('/products/', '')
    if (!filename || filename.includes('..')) continue
    const path = resolve(IMAGE_DEST_DIR, filename)
    if (existsSync(path)) {
      try {
        unlinkSync(path)
        imagesRemoved++
      } catch (e) {
        console.warn(`Failed to delete image ${path}: ${e.message}`)
      }
    } else {
      imagesMissing++
    }
  }
  console.log(`Removed ${imagesRemoved} images (${imagesMissing} already missing).`)

  // Delete product rows in batches to avoid huge requests.
  const ids = data.map((p) => p.id)
  const batchSize = 100
  let rowsDeleted = 0
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error: deleteError, count: deleted } = await supabase
      .from('products')
      .delete()
      .in('id', batch)
    if (deleteError) {
      console.error(`Failed to delete batch ${i / batchSize + 1}:`, deleteError.message)
    } else {
      rowsDeleted += deleted || 0
      console.log(`  deleted batch ${i / batchSize + 1}: ${deleted || 0} rows`)
    }
  }
  console.log(`Deleted ${rowsDeleted} product rows.`)

  // Clean up temporary scraper output files.
  const filesToRemove = [
    resolve(TMP_DIR, 'parker-fittings-tools-products.json'),
    resolve(TMP_DIR, 'parker-fittings-tools-products-raw.json'),
    resolve(TMP_DIR, 'parker-fittings-tools-import-progress.json'),
  ]
  for (const f of filesToRemove) {
    if (existsSync(f)) {
      unlinkSync(f)
      console.log(`Removed temp file: ${f}`)
    }
  }

  const imageTmpDir = resolve(TMP_DIR, 'parker-fittings-tools-images')
  if (existsSync(imageTmpDir)) {
    rmSync(imageTmpDir, { recursive: true, force: true })
    console.log(`Removed temp image dir: ${imageTmpDir}`)
  }

  // Remove any leftover 7-digit Parker image files in public/products that weren't linked.
  const orphans = []
  try {
    const files = readdirSync(IMAGE_DEST_DIR)
    for (const f of files) {
      if (/^\d{7}-.*\.webp$/.test(f)) {
        orphans.push(f)
      }
    }
  } catch {}

  if (orphans.length > 0) {
    console.log(`Removing ${orphans.length} orphan 7-digit product images...`)
    for (const f of orphans) {
      try {
        unlinkSync(resolve(IMAGE_DEST_DIR, f))
      } catch (e) {
        console.warn(`Failed to remove orphan ${f}: ${e.message}`)
      }
    }
  }

  console.log('\nCleanup complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
