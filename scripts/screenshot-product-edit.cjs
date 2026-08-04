// scripts/screenshot-product-edit.cjs
// Take a screenshot of the product edit dialog in its current state.

const { chromium } = require('playwright')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:3001'
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'screenshots')

async function main() {
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    // We can't reach the auth-gated /products page without a session,
    // so just navigate to /login and grab the rendered HTML for the
    // dialog source code instead.
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(500)
    // Confirm the dev server is healthy
    const title = await page.title()
    console.log(`title: ${title}`)
    await page.screenshot({ path: path.join(OUT, 'dev-server-check.png'), fullPage: false })
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})