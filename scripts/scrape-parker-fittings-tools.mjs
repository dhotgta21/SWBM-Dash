#!/usr/bin/env node
/**
 * Scrape Parker Steel fittings / tools catalogue using lightweight HTTP fetches.
 *
 * Resumable: discovered products are written to
 *   .tmp/parker-fittings-tools-products-raw.json
 * before detail pages are fetched, so a timeout can be recovered by re-running.
 *
 * Output:
 *   .tmp/parker-fittings-tools-products.json
 *   .tmp/parker-fittings-tools-images/ (downloaded product images)
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

const OUT_DIR = resolve(process.cwd(), '.tmp')
const IMAGE_DIR = resolve(OUT_DIR, 'parker-fittings-tools-images')
const RAW_FILE = resolve(OUT_DIR, 'parker-fittings-tools-products-raw.json')
const OUT_FILE = resolve(OUT_DIR, 'parker-fittings-tools-products.json')
const BASE_URL = 'https://www.parkersteel.co.uk'

const TARGET_GROUPS = [
  { code: 'FIX', slug: 'fixings', category: 'Fixings' },
  { code: 'HAN', slug: 'hand-tools', category: 'Tools' },
  { code: 'POW', slug: 'power-tools', category: 'Tools' },
  { code: 'POS', slug: 'power-tools-corded', category: 'Tools' },
  { code: 'PTA', slug: 'power-tool-accessories', category: 'Tools' },
  { code: 'SIT', slug: 'site-&-workshop', category: 'Tools' },
  { code: 'ABR', slug: 'abrasives', category: 'Tools' },
  { code: 'COA', slug: 'coatings-and-sealants', category: 'Tools' },
  { code: 'KEE', slug: 'industrial-handrail', category: 'Tools' },
  { code: 'QRA', slug: 'balustrade-&-balcony', category: 'Tools' },
  { code: 'SAF', slug: 'safety', category: 'Tools' },
  { code: 'V&F', slug: 'valves-&-fittings', category: 'Tools' },
  { code: 'WEL', slug: 'welding', category: 'Tools' },
]

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchText(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
      })
      if (res.status === 429) throw new Error(`HTTP 429`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (e) {
      if (i === retries) throw e
      const delay = 2000 * Math.pow(2, i)
      console.warn(`  retry ${i + 1}/${retries} for ${url} after ${delay}ms (${e.message})`)
      await sleep(delay)
    }
  }
}

function extractClassLinks(html) {
  const links = [...html.matchAll(/href="(\/class\/[^"]+)"/g)].map((m) => m[1])
  const seenHref = new Set()
  const seenCode = new Set()
  return links
    .filter((href) => {
      if (seenHref.has(href)) return false
      seenHref.add(href)
      return true
    })
    .map((href) => {
      const parts = href.split('/').filter(Boolean)
      return {
        href: `${BASE_URL}${href}`,
        groupCode: parts[1],
        classCode: parts[2],
        slug: parts.slice(3).join('/'),
      }
    })
    .filter((item) => {
      const key = `${item.groupCode}-${item.classCode}`
      if (seenCode.has(key)) return false
      seenCode.add(key)
      return true
    })
}

function extractProductCardData(html, category) {
  const results = []
  const seen = new Set()
  const re = /<a[^>]*href="(\/tools-product\/(\d+)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html))) {
    const href = `${BASE_URL}${m[1]}`
    const id = m[2]
    if (seen.has(id)) continue
    seen.add(id)

    const inner = m[3]
    const text = inner
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const priceMatch = text.match(/From\s*£([\d.]+)|£([\d.]+)/)
    const price = priceMatch ? parseFloat(priceMatch[1] || priceMatch[2]) : null

    const name = text
      .replace(/From\s*£[\d.]+\s*(per\s+[^E]+)?/i, '')
      .replace(/£[\d.]+/g, '')
      .replace(/Exc\.\s*VAT/i, '')
      .replace(/View\s*done\s*Try\s*Again/i, '')
      .replace(/Best\s*Seller/i, '')
      .trim()

    results.push({ id, href, name, price, category })
  }
  return results
}

function extractProductDetails(html) {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : ''

  let description = ''
  let specLines = []
  const detailsMatch = html.match(/<div[^>]*id=["']productDetails["'][^>]*>([\s\S]*?)<\/div>(?:\s*<div|\s*<\/div>\s*<div|\s*$)/i)
  if (detailsMatch) {
    const inner = detailsMatch[1]
    const pMatch = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    if (pMatch) description = pMatch[1].replace(/<[^>]+>/g, '').trim()
    const liMatches = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    for (const li of liMatches) {
      const text = li[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text && text.length < 300) specLines.push(text)
    }
  }

  return { name, description, specLines }
}

function imageUrlForId(id) {
  return `https://www.parkersteel.co.uk/webshared/media/images/product/tools/300/${id}_001.jpg`
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const path = resolve(IMAGE_DIR, filename)
    writeFileSync(path, buffer)
    return `/parker-fittings-tools-images/${filename}`
  } catch (e) {
    console.warn(`Image download failed: ${url} - ${e.message}`)
    return null
  }
}

function filenameForImage(id, name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  return `${id}-${safe}.jpg`
}

async function runInBatches(items, batchSize, fn, delayMs = 300) {
  const results = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
    if (i + batchSize < items.length) await sleep(delayMs)
  }
  return results
}

async function discoverProducts() {
  const allProductsById = new Map()

  for (const group of TARGET_GROUPS) {
    console.log(`\n[Group ${group.code}] ${group.slug}`)
    const groupUrl = `${BASE_URL}/group/${group.code}/${group.slug}`
    let groupHtml
    try {
      groupHtml = await fetchText(groupUrl)
    } catch (e) {
      console.warn(`Failed group page ${groupUrl}: ${e.message}`)
      continue
    }

    let classLinks = extractClassLinks(groupHtml)
    classLinks = classLinks.filter((c) => c.groupCode === group.code)
    const directProducts = extractProductCardData(groupHtml, group.category)
    console.log(`  found ${classLinks.length} classes, ${directProducts.length} direct products`)

    for (const p of directProducts) {
      if (!allProductsById.has(p.id)) allProductsById.set(p.id, p)
    }

    for (let i = 0; i < classLinks.length; i += 10) {
      const batch = classLinks.slice(i, i + 10)
      const batchResults = await Promise.all(
        batch.map(async (classLink) => {
          try {
            const classHtml = await fetchText(classLink.href)
            const classProducts = extractProductCardData(classHtml, group.category)
            const className = classLink.slug
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase())
            for (const p of classProducts) {
              if (!allProductsById.has(p.id)) {
                p.classCode = classLink.classCode
                p.className = className
                allProductsById.set(p.id, p)
              }
            }
            return classProducts.length
          } catch (e) {
            console.warn(`  Failed class ${classLink.href}: ${e.message}`)
            return 0
          }
        })
      )
      console.log(
        `  [${Math.min(i + 10, classLinks.length)}/${classLinks.length}] classes done — products: ${batchResults.reduce(
          (a, b) => a + b,
          0
        )}`
      )
      await sleep(50)
    }
  }

  const raw = Array.from(allProductsById.values())
  writeFileSync(RAW_FILE, JSON.stringify(raw, null, 2))
  console.log(`\nDiscovered ${raw.length} products. Saved to ${RAW_FILE}`)
  return raw
}

async function enrichProducts(raw) {
  console.log(`\nFetching product detail pages for ${raw.length} products...`)
  mkdirSync(IMAGE_DIR, { recursive: true })

  // Resume support: load existing enriched output if present.
  const existing = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf-8')) : []
  const enrichedById = new Map(existing.map((p) => [p.id, p]))

  let completed = 0
  let skipped = 0
  const toFetch = raw.filter((p) => !enrichedById.has(p.id))

  await runInBatches(toFetch, 2, async (product) => {
    try {
      const html = await fetchText(product.href)
      const details = extractProductDetails(html)
      const name = details.name || product.name
      const filename = filenameForImage(product.id, name)
      const sourceImage = imageUrlForId(product.id)
      const localImage = (await downloadImage(sourceImage, filename)) || sourceImage

      enrichedById.set(product.id, {
        id: product.id,
        name,
        description: details.description || '',
        price: product.price,
        category: product.category,
        className: product.className || '',
        classCode: product.classCode || '',
        sourceUrl: product.href,
        image: localImage,
        sourceImage,
        specs: details.specLines || [],
      })
      completed++
    } catch (e) {
      console.warn(`Failed product ${product.href}: ${e.message}`)
      enrichedById.set(product.id, {
        id: product.id,
        name: product.name,
        description: '',
        price: product.price,
        category: product.category,
        className: product.className || '',
        classCode: product.classCode || '',
        sourceUrl: product.href,
        image: '',
        sourceImage: imageUrlForId(product.id),
        specs: [],
      })
    }

    if ((completed + skipped) % 50 === 0) {
      writeFileSync(OUT_FILE, JSON.stringify(Array.from(enrichedById.values()), null, 2))
      console.log(`  ... ${completed + skipped}/${toFetch.length} products enriched`)
    }
  })

  const products = Array.from(enrichedById.values())
  writeFileSync(OUT_FILE, JSON.stringify(products, null, 2))
  console.log(`\nSaved ${products.length} enriched products to ${OUT_FILE}`)
  console.log(`Images saved to ${IMAGE_DIR}`)
}

async function main() {
  mkdirSync(IMAGE_DIR, { recursive: true })

  const discoverOnly = process.argv.includes('--discover-only')

  let raw
  if (existsSync(RAW_FILE)) {
    raw = JSON.parse(readFileSync(RAW_FILE, 'utf-8'))
    console.log(`Resuming from ${RAW_FILE} (${raw.length} products)`)
  } else {
    raw = await discoverProducts()
  }

  if (discoverOnly) {
    console.log('Discovery complete; skipping enrichment.')
    return
  }

  await enrichProducts(raw)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
