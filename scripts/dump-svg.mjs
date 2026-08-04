// scripts/dump-svg.mjs
// Dump the raw SVG HTML to a file for inspection.

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const port = process.env.PORT || 3000
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1280, height: 1100 },
  colorScheme: 'light',
})
const page = await context.newPage()

await context.route('**/*', (route) => route.continue())

const url = `http://localhost:${port}/tools/concrete-calculator`
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForSelector('svg', { timeout: 10000 })
await page.getByRole('button', { name: 'Column', exact: true }).click()
await page.waitForTimeout(300)
await page.fill('#diameter', '0.3')
await page.fill('#depth', '2.5')
await page.waitForTimeout(500)

const svgHtml = await page.evaluate(() => {
  const svgs = document.querySelectorAll('svg')
  // Find the largest one (the visualisation, not the icon SVGs)
  let largest = null
  let maxLen = 0
  svgs.forEach((svg) => {
    if (svg.outerHTML.length > maxLen) {
      maxLen = svg.outerHTML.length
      largest = svg
    }
  })
  return largest ? { count: svgs.length, html: largest.outerHTML } : { count: 0, html: 'NONE' }
})

console.log(`Found ${svgHtml.count} SVGs`)
writeFileSync('C:/Users/sarpa/PycharmProjects/SWBM/.tmp/concrete-column.svg', svgHtml.html)
console.log(`Largest SVG saved (${svgHtml.html.length} chars)`)
await browser.close()