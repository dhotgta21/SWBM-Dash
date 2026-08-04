#!/usr/bin/env node
/**
 * Add missing Damp Proof Course (DPC) products and tidy existing DPC entries.
 *
 * Adds standard UK roll widths (150, 200, 225, 300 mm) with professional
 * descriptions and consistent Roofing categorisation. Existing DPC products
 * that lack a category or description are backfilled so the catalog stays
 * consistent.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'

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
      if (key && !(key in process.env)) process.env[key] = value
    }
  } catch (err) {
    console.warn('Could not load .env.local:', err.message)
  }
}

loadEnvFile(join(__dirname, '..', '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or service-role key in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const DPC_CATEGORY = 'Roofing'
const DPC_UNIT = 'EA'
const DPC_DESCRIPTION =
  'High-quality polyethylene damp proof course (DPC) for masonry cavity trays, bed joints and above-opening protection. ' +
  'Provides an effective moisture barrier in cavity walls, boundary walls and ground-level construction. ' +
  'Supplied as a flexible roll for easy installation on site.'

const newDpcProducts = [
  { code: 'DPC-150', name: 'DPC 150MM', width: 150 },
  { code: 'DPC-200', name: 'DPC 200MM', width: 200 },
  { code: 'DPC-225', name: 'DPC 225MM', width: 225 },
  { code: 'DPC-300', name: 'DPC 300MM', width: 300 },
]

async function main() {
  // 1. Insert missing DPC products, skipping any whose code already exists.
  let inserted = 0
  let skipped = 0

  for (const product of newDpcProducts) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('code', product.code)
      .maybeSingle()

    if (existing) {
      console.log(`Skipping ${product.code} — already exists`)
      skipped++
      continue
    }

    const { error } = await supabase.from('products').insert({
      code: product.code,
      name: product.name,
      description: DPC_DESCRIPTION,
      unit: DPC_UNIT,
      category: DPC_CATEGORY,
      default_price: 0,
      is_active: true,
    })

    if (error) {
      console.error(`Failed to insert ${product.code}:`, error.message)
      process.exitCode = 1
    } else {
      console.log(`Inserted ${product.code} — ${product.name}`)
      inserted++
    }
  }

  // 2. Backfill category/description on existing DPC products that are blank.
  const { data: existingDpc, error: fetchError } = await supabase
    .from('products')
    .select('id, code, name, category, description')
    .or('name.ilike.%DPC%,code.ilike.%DPC%')

  if (fetchError) {
    console.error('Failed to fetch existing DPC products:', fetchError.message)
    process.exitCode = 1
    return
  }

  let updated = 0
  for (const product of existingDpc || []) {
    const needsCategory = !product.category
    const needsDescription = !product.description

    if (!needsCategory && !needsDescription) continue

    const { error } = await supabase
      .from('products')
      .update({
        ...(needsCategory ? { category: DPC_CATEGORY } : {}),
        ...(needsDescription ? { description: DPC_DESCRIPTION } : {}),
      })
      .eq('id', product.id)

    if (error) {
      console.error(`Failed to update ${product.code}:`, error.message)
      process.exitCode = 1
    } else {
      console.log(
        `Updated ${product.code} — ${product.name}` +
          ` (${needsCategory ? 'category' : ''}${needsCategory && needsDescription ? ', ' : ''}${needsDescription ? 'description' : ''})`
      )
      updated++
    }
  }

  console.log(`\nSummary: ${inserted} inserted, ${skipped} skipped, ${updated} updated.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
