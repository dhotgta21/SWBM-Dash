// scripts/snapshot-tools.mjs
// Snapshot all 6 /tools/* calculators for visual verification.

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', '.tmp', 'visuals')
mkdirSync(outDir, { recursive: true })

const port = process.env.PORT || 3010
const base = `http://localhost:${port}`

const targets = [
  { slug: 'tile-calculator', file: 'tile.png' },
  { slug: 'paving-calculator', file: 'paving.png' },
  { slug: 'concrete-calculator', file: 'concrete.png' },
  { slug: 'mortar-calculator', file: 'mortar.png' },
  { slug: 'plaster-calculator', file: 'plaster.png' },
  { slug: 'coverage-calculator', file: 'coverage.png' },
]

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } })
const page = await context.newPage()

for (const t of targets) {
  const url = `${base}/tools/${t.slug}`
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  // Wait for SVG to render.
  await page.waitForSelector('svg', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(500)
  const dest = path.join(outDir, t.file)
  await page.screenshot({ path: dest, fullPage: true })
  console.log(`  saved ${dest}`)
}

await browser.close()
console.log('done.')
