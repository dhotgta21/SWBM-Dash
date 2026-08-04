#!/usr/bin/env node
/**
 * Scrape Parker Steel product families and material-specific dimension options.
 *
 * Usage:
 *   node scripts/scrape-parker-steel.mjs
 *
 * Output:
 *   .tmp/parker-steel-products.json
 *   .tmp/parker-steel-images/ (downloaded product images)
 *
 * The script respects the site by adding small delays between requests.
 */

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', '.tmp')
const IMAGE_DIR = resolve(OUT_DIR, 'parker-steel-images')
const SITEMAP_URL = 'https://www.parkersteel.co.uk/sitemap.xml'
const BASE_URL = 'https://www.parkersteel.co.uk'

const MATERIAL_MAP = {
  'mild-steel': 'Mild Steel',
  'bright-steel': 'Bright Steel',
  'stainless-steel': 'Stainless Steel',
  aluminium: 'Aluminium',
  galvanised: 'Galvanised',
}

const MATERIAL_CODE = {
  'Mild Steel': 'MLD',
  'Bright Steel': 'BRS',
  'Stainless Steel': 'SST',
  'Aluminium': 'ALU',
  'Galvanised': 'GAL',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchXml(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
  return res.text()
}

function parseUrls(xml) {
  const urls = []
  const re = /<loc>([^<]+)<\/loc>/g
  let m
  while ((m = re.exec(xml))) urls.push(m[1])
  return urls
}

function extractFamilyAndMaterialPages(urls) {
  const families = []
  const materials = []
  for (const url of urls) {
    const path = new URL(url).pathname
    if (path.startsWith('/product/f/')) {
      const parts = path.split('/').filter(Boolean)
      families.push({ url, id: parts[2], slug: parts.slice(3).join('/') })
    } else if (path.startsWith('/product/m/')) {
      const parts = path.split('/').filter(Boolean)
      materials.push({
        url,
        id: parts[2],
        materialSlug: parts[3],
        slug: parts.slice(4).join('/'),
      })
    }
  }
  return { families, materials }
}

async function scrapeFamilyPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(1000)

  return page.evaluate(() => {
    const titleEl = document.querySelector('#product-header h3')
    const title = titleEl?.textContent?.trim() || ''

    const descEl = document.querySelector('#product-description')
    const description = descEl
      ? Array.from(descEl.querySelectorAll('p'))
          .map((p) => p.textContent.trim())
          .filter(Boolean)
          .join('\n\n')
      : ''

    const images = Array.from(
      document.querySelectorAll('.product-description-image')
    ).map((img) => ({
      src: img.src,
      alt: img.alt,
      materialCode: img.getAttribute('data-material'),
    }))

    const materials = Array.from(
      document.querySelectorAll('#material-fieldset input[name="material"]')
    ).map((input) => {
      const container = input.closest('[data-matrix-table-ref]')
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`)
      return {
        code: input.value,
        matrixTableRef: container?.getAttribute('data-matrix-table-ref'),
        label: label?.textContent?.trim().replace(/\s+/g, ' '),
      }
    })

    return { title, description, images, materials }
  })
}

async function scrapeMaterialPage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await sleep(1000)

  return page.evaluate(() => {
    const selects = Array.from(
      document.querySelectorAll('#product-specification-fieldset select')
    ).map((select) => ({
      name: select.name,
      label:
        select.closest('.parker-input-section')?.querySelector('label')?.textContent?.trim() ||
        select.getAttribute('aria-label') ||
        select.name,
      options: Array.from(select.querySelectorAll('option'))
        .filter((o) => o.value)
        .map((o) => ({
          value: o.value,
          text: o.textContent.trim(),
        })),
    }))

    const stockInfo = Array.from(
      document.querySelectorAll('.product-stock-info .parker-data-pair-value')
    ).map((el) => el.textContent.trim())

    return { selects, stockInfo }
  })
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const path = resolve(IMAGE_DIR, filename)
    writeFileSync(path, buffer)
    return `/parker-steel-images/${filename}`
  } catch (e) {
    console.warn(`Image download failed: ${url} - ${e.message}`)
    return null
  }
}

function filenameForImage(slug, materialCode, src) {
  const ext = src.split('.').pop()?.split('?')[0] || 'png'
  return `${slug}-${materialCode.toLowerCase()}.${ext}`
}

async function main() {
  mkdirSync(IMAGE_DIR, { recursive: true })

  console.log('Fetching sitemap...')
  const xml = await fetchXml(SITEMAP_URL)
  const urls = parseUrls(xml)
  const { families, materials } = extractFamilyAndMaterialPages(urls)
  console.log(`Found ${families.length} families, ${materials.length} material pages`)

  // Map material pages by slug
  const materialsBySlug = {}
  for (const m of materials) {
    if (!materialsBySlug[m.slug]) materialsBySlug[m.slug] = []
    materialsBySlug[m.slug].push(m)
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const products = []

  for (let i = 0; i < families.length; i++) {
    const family = families[i]
    console.log(`[${i + 1}/${families.length}] Scraping family: ${family.slug}`)

    let familyData
    try {
      familyData = await scrapeFamilyPage(page, family.url)
    } catch (e) {
      console.warn(`Failed family page ${family.url}: ${e.message}`)
      continue
    }

    const materialVariants = materialsBySlug[family.slug] || []
    const variants = []

    for (const mat of materialVariants) {
      const materialName = MATERIAL_MAP[mat.materialSlug] || mat.materialSlug
      console.log(`  -> material: ${materialName}`)

      let matData
      try {
        matData = await scrapeMaterialPage(page, mat.url)
      } catch (e) {
        console.warn(`Failed material page ${mat.url}: ${e.message}`)
        continue
      }

      // Find the family image for this material
      const familyMaterialCode =
        familyData.materials.find(
          (m) => m.matrixTableRef === mat.id || m.label?.toLowerCase().includes(materialName.toLowerCase())
        )?.code || ''

      const imageSrc =
        familyData.images.find((img) => img.materialCode === familyMaterialCode)?.src ||
        familyData.images[0]?.src

      let localImage = ''
      if (imageSrc) {
        const absoluteSrc = imageSrc.startsWith('http') ? imageSrc : `${BASE_URL}${imageSrc}`
        const filename = filenameForImage(family.slug, materialName, absoluteSrc)
        localImage = (await downloadImage(absoluteSrc, filename)) || absoluteSrc
      }

      variants.push({
        material: materialName,
        materialCode: familyMaterialCode,
        matrixTableRef: mat.id,
        sourceUrl: mat.url,
        image: localImage,
        sourceImage: imageSrc,
        selectors: matData.selects,
      })

      await sleep(500)
    }

    const primaryMaterial = variants[0]?.material || 'Mild Steel'
    const product = {
      familyId: family.id,
      familySlug: family.slug,
      name: familyData.title,
      description: familyData.description,
      sourceUrl: family.url,
      primaryMaterial,
      materials: variants.map((v) => v.material),
      variants,
      category: primaryMaterial,
    }

    products.push(product)
    await sleep(500)
  }

  await browser.close()

  const outPath = resolve(OUT_DIR, 'parker-steel-products.json')
  writeFileSync(outPath, JSON.stringify(products, null, 2))
  console.log(`\nSaved ${products.length} products to ${outPath}`)
  console.log(`Images saved to ${IMAGE_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
