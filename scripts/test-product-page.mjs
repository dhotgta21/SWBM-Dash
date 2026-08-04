import { chromium } from 'playwright'
async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/products/PMS-SQUARE-HOLLOW-SECTION', { waitUntil: 'networkidle' })
  // Click Stainless Steel
  await page.getByRole('button', { name: /Stainless Steel/i }).click()
  await page.waitForTimeout(500)
  // Select depth x width
  await page.locator('select[id="selector-product-dimension1"]').selectOption({ index: 1 })
  await page.locator('select[id="selector-product-dimension2"]').selectOption({ index: 1 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.tmp/product-page-variant.png', fullPage: false })
  console.log('Screenshot saved')
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
