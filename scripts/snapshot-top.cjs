// Crop the top 200px of each screenshot and stack them for comparison.
const { chromium } = require('playwright');
const path = require('path');

const OUT = 'C:\\Users\\sarpa\\PycharmProjects\\SWBM\\.tmp';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 977 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3008/case-studies', { waitUntil: 'networkidle' });
  // Take a viewport screenshot of the top portion only
  await page.setViewportSize({ width: 1920, height: 200 });
  await page.goto('http://localhost:3008/case-studies', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'case-studies-top.png'), type: 'png' });
  await page.goto('http://localhost:3008/guides', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'guides-top.png'), type: 'png' });
  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });