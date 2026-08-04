// scripts/check-svg.mjs
// Fetch the actual rendered SVG HTML to verify code changes are live.

import { chromium } from 'playwright'

const port = process.env.PORT || 3000
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  colorScheme: 'light',
})
const page = await context.newPage()

// Disable cache
await context.route('**/*', (route) => route.continue())

const url = `http://localhost:${port}/tools/mortar-calculator`
console.log(`→ ${url}`)
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForSelector('svg', { timeout: 10000 })

// Switch to volume mode
await page.getByRole('button', { name: 'From volume', exact: true }).click()
await page.waitForTimeout(300)
await page.fill('#volume', '1.5')
await page.selectOption('#mix', '1:3')
await page.waitForTimeout(300)

// Find all SVG text elements and print their content
const texts = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('svg text')).map((el) => ({
    text: el.textContent,
    x: el.getAttribute('x'),
    y: el.getAttribute('y'),
  }))
})
console.log('\nSVG text elements in volume mode:')
texts.forEach((t, i) => console.log(`  [${i}] y=${t.y}: "${t.text}"`))

await browser.close()