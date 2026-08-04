// scripts/qa-tools.mjs
// Comprehensive visual QA for /tools/* calculators.
// Captures screenshots across many scenarios, both viewports, both colour modes.

import { chromium } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', '.tmp', 'qa')
mkdirSync(outDir, { recursive: true })

const port = process.env.PORT || 3010
const base = `http://localhost:${port}`

// Each scenario: [slug, file suffix, form fields to fill, optional shape/mode toggle]
const scenarios = {
  tile: [
    { name: 'default', inputs: { 'area-length': '3', 'area-width': '2', 'tile-length': '300', 'tile-width': '300', wastage: '10' } },
    { name: 'large-format', inputs: { 'area-length': '4', 'area-width': '3', 'tile-length': '600', 'tile-width': '600', wastage: '10' } },
    { name: 'small-mosaic', inputs: { 'area-length': '2', 'area-width': '2', 'tile-length': '100', 'tile-width': '100', wastage: '15' } },
    { name: 'odd-dim', inputs: { 'area-length': '3.5', 'area-width': '2.7', 'tile-length': '400', 'tile-width': '250', wastage: '10' } },
    { name: 'zero-area', inputs: { 'area-length': '0', 'area-width': '2', 'tile-length': '300', 'tile-width': '300', wastage: '10' } },
  ],
  paving: [
    { name: 'default', inputs: { 'area-length': '4', 'area-width': '3', 'slab-length': '600', 'slab-width': '600', joint: '10', wastage: '10', 'sub-base': '100', bedding: '50' } },
    { name: 'large-patio', inputs: { 'area-length': '8', 'area-width': '5', 'slab-length': '600', 'slab-width': '600', joint: '10', wastage: '10', 'sub-base': '150', bedding: '50' } },
    { name: 'deep-base', inputs: { 'area-length': '4', 'area-width': '3', 'slab-length': '600', 'slab-width': '600', joint: '10', wastage: '10', 'sub-base': '300', bedding: '100' } },
    { name: 'rectangular-slabs', inputs: { 'area-length': '5', 'area-width': '4', 'slab-length': '900', 'slab-width': '600', joint: '10', wastage: '10', 'sub-base': '100', bedding: '50' } },
  ],
  concrete: [
    { name: 'slab', shape: 'Slab', inputs: { length: '5', width: '4', depth: '0.15', wastage: '5' } },
    { name: 'footing', shape: 'Strip footing', inputs: { length: '12', width: '0.45', depth: '0.3', wastage: '5' } },
    { name: 'column', shape: 'Column', inputs: { depth: '2.5', diameter: '0.3', wastage: '5' } },
    { name: 'small-slab', shape: 'Slab', inputs: { length: '1', width: '1', depth: '0.1', wastage: '0' } },
  ],
  mortar: [
    { name: 'wall-1to4', inputs: { length: '5', height: '2.4', volume: '1', mix: '1:4', wastage: '5' } },
    { name: 'volume-mode', mode: 'From volume', inputs: { length: '5', height: '2.4', volume: '1.5', mix: '1:3', wastage: '5' } },
    { name: 'tall-wall', inputs: { length: '8', height: '4', volume: '1', mix: '1:5', wastage: '10' } },
  ],
  plaster: [
    { name: 'skim', finish: 'skim', inputs: { area: '20', wastage: '10' } },
    { name: 'two-coat', finish: 'two_coat', inputs: { area: '30', wastage: '10' } },
    { name: 'render', finish: 'render', inputs: { area: '25', wastage: '15' } },
    { name: 'board', finish: 'board', inputs: { area: '40', wastage: '10' } },
  ],
  coverage: [
    { name: 'emulsion-2coats', preset: 'emulsion', inputs: { area: '30', coverage: '12', coats: '2', 'unit-size': '5' } },
    { name: 'render-3coats', preset: 'render', inputs: { area: '50', coverage: '8', coats: '3', 'unit-size': '25' } },
    { name: 'many-buckets', preset: 'emulsion', inputs: { area: '120', coverage: '10', coats: '2', 'unit-size': '5' } },
    { name: 'one-coat', preset: 'primer', inputs: { area: '20', coverage: '10', coats: '1', 'unit-size': '5' } },
  ],
}

async function setInput(page, name, value) {
  const sel = `#${name}`
  try {
    await page.waitForSelector(sel, { state: 'visible', timeout: 2000 })
  } catch {
    // Field not visible in current mode — skip
    return
  }
  const tag = await page.locator(sel).evaluate((el) => el.tagName.toLowerCase())
  if (tag === 'select') {
    await page.selectOption(sel, String(value))
  } else {
    await page.fill(sel, '')
    await page.fill(sel, String(value))
  }
}

async function selectButton(page, label) {
  const btn = page.getByRole('button', { name: label, exact: true })
  await btn.click()
}

async function runScenario(page, slug, scenario, theme = 'light') {
  const url = `${base}/tools/${slug}-calculator`
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForSelector('svg', { timeout: 10000 }).catch(() => {})

  if (scenario.shape) {
    await selectButton(page, scenario.shape)
    await page.waitForTimeout(200)
  }
  if (scenario.mode) {
    await selectButton(page, scenario.mode)
    await page.waitForTimeout(200)
  }
  if (scenario.preset) {
    await page.selectOption('#material', scenario.preset)
    await page.waitForTimeout(200)
  }
  if (scenario.finish) {
    await page.selectOption('#finish', scenario.finish)
    await page.waitForTimeout(200)
  }
  if (scenario.inputs) {
    for (const [name, value] of Object.entries(scenario.inputs)) {
      await setInput(page, name, value)
    }
    await page.waitForTimeout(300)
  }

  const file = path.join(outDir, `${slug}__${scenario.name}__${theme}.png`)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function runViewport(browser, scenario, slug, theme, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: theme })
  const page = await context.newPage()
  try {
    const file = await runScenario(page, slug, scenario, theme)
    console.log(`✓ ${slug}/${scenario.name} ${theme} ${viewport.width}x${viewport.height} → ${path.basename(file)}`)
  } catch (err) {
    console.error(`✗ ${slug}/${scenario.name} ${theme} ${viewport.width}x${viewport.height}:`, err.message)
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch()

// Desktop light — all variants
console.log('--- DESKTOP LIGHT, all variants ---')
for (const [slug, list] of Object.entries(scenarios)) {
  for (const scenario of list) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'light' })
    const page = await context.newPage()
    try {
      const file = await runScenario(page, slug, scenario, 'light')
      console.log(`✓ ${slug}/${scenario.name} → ${path.basename(file)}`)
    } catch (err) {
      console.error(`✗ ${slug}/${scenario.name}:`, err.message)
    } finally {
      await context.close()
    }
  }
}

// Mobile light — defaults only
console.log('--- MOBILE LIGHT, defaults ---')
for (const [slug, list] of Object.entries(scenarios)) {
  const scenario = list[0]
  await runViewport(browser, scenario, slug, 'light', { width: 390, height: 1200 })
}

// Dark mode — defaults only
console.log('--- DARK MODE, defaults ---')
for (const [slug, list] of Object.entries(scenarios)) {
  const scenario = list[0]
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'dark' })
  const page = await context.newPage()
  try {
    const file = await runScenario(page, slug, scenario, 'dark')
    console.log(`✓ ${slug}/${scenario.name} dark → ${path.basename(file)}`)
  } catch (err) {
    console.error(`✗ ${slug}/${scenario.name} dark:`, err.message)
  } finally {
    await context.close()
  }
}

await browser.close()
console.log('\nDone. Screenshots in', outDir)