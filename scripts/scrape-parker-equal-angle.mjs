import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const PRODUCTS_FILE = resolve(__dirname, '..', '.tmp', 'parker-steel-products.json')
const IMAGE_DIR = resolve(__dirname, '..', '.tmp', 'parker-steel-images')

const MATERIAL_MAP = {
  'mild-steel': 'Mild Steel',
  'bright-steel': 'Bright Steel',
  'stainless-steel': 'Stainless Steel',
  aluminium: 'Aluminium',
  galvanised: 'Galvanised',
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function scrapeFamilyPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  return page.evaluate(() => {
    const title = document.querySelector('#product-header h3')?.textContent?.trim() || ''
    const descEl = document.querySelector('#product-description')
    const description = descEl ? Array.from(descEl.querySelectorAll('p')).map(p => p.textContent.trim()).filter(Boolean).join('\n\n') : ''
    const images = Array.from(document.querySelectorAll('.product-description-image')).map(img => ({
      src: img.src, alt: img.alt, materialCode: img.getAttribute('data-material')
    }))
    const materials = Array.from(document.querySelectorAll('#material-fieldset input[name="material"]')).map(input => {
      const container = input.closest('[data-matrix-table-ref]')
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`)
      return { code: input.value, matrixTableRef: container?.getAttribute('data-matrix-table-ref'), label: label?.textContent?.trim().replace(/\s+/g, ' ') }
    })
    return { title, description, images, materials }
  })
}

async function scrapeMaterialPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await sleep(2000)
  return page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('#product-specification-fieldset select')).map(select => ({
      name: select.name,
      label: select.closest('.parker-input-section')?.querySelector('label')?.textContent?.trim() || select.name,
      options: Array.from(select.querySelectorAll('option')).filter(o => o.value).map(o => ({ value: o.value, text: o.textContent.trim() }))
    }))
    return { selects }
  })
}

async function downloadImage(url, filename) {
  const res = await fetch(url)
  if (!res.ok) return null
  const buffer = Buffer.from(await res.arrayBuffer())
  const path = resolve(IMAGE_DIR, filename)
  writeFileSync(path, buffer)
  return `/parker-steel-images/${filename}`
}

async function main() {
  const products = JSON.parse(readFileSync(PRODUCTS_FILE, 'utf-8'))
  if (products.some(p => p.familySlug === 'equal-angle')) {
    console.log('equal-angle already present')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const familyUrl = 'https://www.parkersteel.co.uk/product/f/12/equal-angle'
  console.log('Scraping equal-angle family...')
  const familyData = await scrapeFamilyPage(page, familyUrl)

  const materialUrls = [
    { id: '7', materialSlug: 'mild-steel', url: 'https://www.parkersteel.co.uk/product/m/7/mild-steel/equal-angle' },
    { id: '64', materialSlug: 'bright-steel', url: 'https://www.parkersteel.co.uk/product/m/64/bright-steel/equal-angle' },
    { id: '73', materialSlug: 'stainless-steel', url: 'https://www.parkersteel.co.uk/product/m/73/stainless-steel/equal-angle' },
    { id: '85', materialSlug: 'aluminium', url: 'https://www.parkersteel.co.uk/product/m/85/aluminium/equal-angle' },
  ]

  const variants = []
  for (const mat of materialUrls) {
    console.log('Scraping', mat.materialSlug)
    const matData = await scrapeMaterialPage(page, mat.url)
    const materialName = MATERIAL_MAP[mat.materialSlug]
    const materialCode = familyData.materials.find(m => m.matrixTableRef === mat.id)?.code || ''
    const imageSrc = familyData.images.find(img => img.materialCode === materialCode)?.src || familyData.images[0]?.src
    const absoluteSrc = imageSrc.startsWith('http') ? imageSrc : `https://www.parkersteel.co.uk${imageSrc}`
    const filename = `equal-angle-${mat.materialSlug}.png`
    const localImage = await downloadImage(absoluteSrc, filename)
    variants.push({ material: materialName, materialCode, matrixTableRef: mat.id, sourceUrl: mat.url, image: localImage, sourceImage: imageSrc, selectors: matData.selects })
    await sleep(500)
  }

  await browser.close()

  const product = {
    familyId: '12',
    familySlug: 'equal-angle',
    name: familyData.title,
    description: familyData.description,
    sourceUrl: familyUrl,
    primaryMaterial: 'Mild Steel',
    materials: variants.map(v => v.material),
    variants,
    category: 'Mild Steel'
  }

  products.push(product)
  writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2))
  console.log('Added equal-angle')
}

main().catch(e => { console.error(e); process.exit(1) })
