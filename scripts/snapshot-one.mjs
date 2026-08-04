// scripts/snapshot-one.mjs
// Snap a single calculator URL with cache-busting.

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', '.tmp', 'qa')
mkdirSync(outDir, { recursive: true })

const port = process.env.PORT || 3000
const base = `http://localhost:${port}`

const slug = process.argv[2] || 'concrete'
const scenario = process.argv[3] || 'column'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  colorScheme: 'light',
})
const page = await context.newPage()

const url = `${base}/tools/${slug}-calculator?nocache=${Date.now()}`
console.log(`→ ${url}`)
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForSelector('svg', { timeout: 10000 }).catch(() => {})

// Apply scenario-specific overrides
if (scenario === 'column') {
  await page.getByRole('button', { name: 'Column', exact: true }).click()
  await page.waitForTimeout(200)
  await page.fill('#diameter', '0.3')
  await page.fill('#depth', '2.5')
  await page.fill('#wastage', '5')
  await page.waitForTimeout(300)
} else if (scenario === 'volume-mode') {
  await page.getByRole('button', { name: 'From volume', exact: true }).click()
  await page.waitForTimeout(200)
  await page.fill('#volume', '1.5')
  await page.selectOption('#mix', '1:3')
  await page.waitForTimeout(300)
}

const file = path.join(outDir, `${slug}__${scenario}__fix.png`)
await page.screenshot({ path: file, fullPage: true })
console.log(`saved ${file}`)

await browser.close()