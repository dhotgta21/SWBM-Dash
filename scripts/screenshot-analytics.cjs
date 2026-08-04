// scripts/screenshot-analytics.cjs
// Sign in to the analytics page via the operator login form, then
// screenshot the resulting dashboard. Used to verify the new money-
// collection widgets are rendering correctly.

const { chromium } = require('playwright')
const path = require('path')

const BASE = process.env.BASE_URL || 'http://localhost:3001'
const EMAIL = process.env.ANALYTICS_EMAIL
const PASSWORD = process.env.ANALYTICS_PASSWORD
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'screenshots-analytics')

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('Set ANALYTICS_EMAIL and ANALYTICS_PASSWORD env vars to run this script.')
    process.exit(1)
  }

  const fs = require('fs')
  fs.mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    // Discover the admin login URL from the env, fall back to default.
    const adminPath = '/admin-login'

    console.log(`navigate -> ${BASE}${adminPath}`)
    await page.goto(`${BASE}${adminPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.fill('input[name="email"]', EMAIL)
    await page.fill('input[name="password"]', PASSWORD)
    await page.click('button[type="submit"]')
    // Wait for the redirect to land.
    await page.waitForURL(/\/dashboard|\/invoices/, { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(1500)

    const url = page.url()
    console.log(`landed on -> ${url}`)
    await page.screenshot({ path: path.join(OUT, 'analytics-desktop.png'), fullPage: true })

    if (!url.includes('/dashboard')) {
      console.log('NOTE: sign-in did not land on /dashboard. Screenshot is of the actual landing page.')
    }

    // Mobile snapshot
    await ctx.close()
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const mpage = await mctx.newPage()
    await mpage.goto(`${BASE}${adminPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await mpage.fill('input[name="email"]', EMAIL)
    await mpage.fill('input[name="password"]', PASSWORD)
    await mpage.click('button[type="submit"]')
    await mpage.waitForURL(/\/dashboard|\/invoices/, { timeout: 30000 }).catch(() => {})
    await mpage.waitForTimeout(1500)
    await mpage.screenshot({ path: path.join(OUT, 'analytics-mobile.png'), fullPage: true })
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})