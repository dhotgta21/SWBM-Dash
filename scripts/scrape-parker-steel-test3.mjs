import { chromium } from 'playwright';

async function test(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const fieldset = document.querySelector('#product-specification-fieldset');
    const selects = Array.from(document.querySelectorAll('#product-specification-fieldset select')).map(select => ({
      name: select.name,
      label: select.closest('.parker-input-section')?.querySelector('label')?.textContent?.trim(),
      options: Array.from(select.querySelectorAll('option')).map(o => ({
        value: o.value,
        text: o.textContent.trim()
      }))
    }));
    
    return { title: document.title, selects, fieldsetVisible: fieldset && !fieldset.classList.contains('hide') };
  });
  
  console.log(url, JSON.stringify(data, null, 2));
  await browser.close();
}

await test('https://www.parkersteel.co.uk/product/m/33/mild-steel/square-hollow-section');
await test('https://www.parkersteel.co.uk/product/f/2/square-hollow-section');
