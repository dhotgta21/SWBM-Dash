// Take screenshots of /case-studies and /guides to verify the
// hero-image changes and any remaining UI issues.
const { chromium } = require('playwright');
const path = require('path');

const OUT_DIR = 'C:\\Users\\sarpa\\PycharmProjects\\SWBM\\.tmp';

const PAGES = [
  { url: 'http://localhost:3008/',              name: 'home-final.png' },
  { url: 'http://localhost:3008/case-studies',  name: 'case-studies-final.png' },
  { url: 'http://localhost:3008/guides',        name: 'guides-final.png' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 977 } });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
    const out = path.join(OUT_DIR, p.name);
    await page.screenshot({ path: out, type: 'png' });
    console.log('wrote', out);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});