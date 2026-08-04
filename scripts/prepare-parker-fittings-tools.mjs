#!/usr/bin/env node
/**
 * Generate the final fittings/tools product JSON from the raw discovery file
 * without fetching individual product detail pages.
 *
 * Usage:
 *   node scripts/prepare-parker-fittings-tools.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OUT_DIR = resolve(process.cwd(), '.tmp')
const RAW_FILE = resolve(OUT_DIR, 'parker-fittings-tools-products-raw.json')
const OUT_FILE = resolve(OUT_DIR, 'parker-fittings-tools-products.json')
const BASE_URL = 'https://www.parkersteel.co.uk'

function imageUrlForId(id) {
  return `${BASE_URL}/webshared/media/images/product/tools/300/${id}_001.jpg`
}

async function main() {
  if (!existsSync(RAW_FILE)) {
    console.error(`Raw file not found: ${RAW_FILE}`)
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(RAW_FILE, 'utf-8'))
  console.log(`Preparing ${raw.length} products...`)

  const products = raw.map((p) => ({
    id: p.id,
    name: p.name || p.id,
    description: '',
    price: p.price,
    category: p.category,
    className: p.className || '',
    classCode: p.classCode || '',
    sourceUrl: p.href,
    image: imageUrlForId(p.id),
    sourceImage: imageUrlForId(p.id),
    specs: [],
  }))

  writeFileSync(OUT_FILE, JSON.stringify(products, null, 2))
  console.log(`\nSaved ${products.length} products to ${OUT_FILE}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
