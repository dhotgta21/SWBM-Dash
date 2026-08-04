import { chromium } from 'playwright'
async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/products/PMS-SQUARE-HOLLOW-SECTION', { waitUntil: 'networkidle' })
  const html = await page.evaluate(() => document.body.innerHTML)
  console.log('has Specifications:', html.includes('Specifications'))
  console.log('has Depth x Width:', html.includes('Depth x Width'))
  console.log('selector count:', (html.match(/selector-product-dimension/g) || []).length)
  await browser.close()
}
main().catch(e => { console.error(e); process.exit(1) })
