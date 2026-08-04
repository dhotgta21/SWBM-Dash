import { chromium } from 'playwright';

const url = 'https://www.parkersteel.co.uk/product/f/2/square-hollow-section';

async function scrapeDimensions(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Click Mild Steel
  await page.click('#product-form-selectablematerialcard-material-bla');
  await page.waitForTimeout(2000);
  
  // Take screenshot to debug
  // await page.screenshot({ path: '.tmp/parker-test.png' });
  
  const data = await page.evaluate(() => {
    const fieldset = document.querySelector('#product-specification-fieldset');
    const labels = fieldset ? Array.from(fieldset.querySelectorAll('label')).map(l => l.textContent.trim()) : [];
    const selects = Array.from(document.querySelectorAll('#product-specification-fieldset select')).map(select => ({
      name: select.name,
      id: select.id,
      label: select.closest('.parker-input-section')?.querySelector('label')?.textContent?.trim(),
      options: Array.from(select.querySelectorAll('option')).map(o => ({
        value: o.value,
        text: o.textContent.trim()
      }))
    }));
    
    return { labels, selects, fieldsetHtml: fieldset ? fieldset.outerHTML.slice(0, 2000) : null };
  });
  
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

await scrapeDimensions(url);
