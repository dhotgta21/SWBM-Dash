import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const url = 'https://www.parkersteel.co.uk/product/f/2/square-hollow-section';

async function scrapeFamilyPage(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Wait a bit for any dynamic content
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const title = document.querySelector('#product-header h3')?.textContent?.trim();
    const descEl = document.querySelector('#product-description');
    const description = descEl ? Array.from(descEl.querySelectorAll('p')).map(p => p.textContent.trim()).join('\n\n') : '';
    
    const images = Array.from(document.querySelectorAll('.product-description-image')).map(img => ({
      src: img.src,
      alt: img.alt,
      material: img.getAttribute('data-material')
    }));
    
    const materials = Array.from(document.querySelectorAll('#material-fieldset input[name="material"]')).map(input => {
      const container = input.closest('[data-matrix-table-ref]');
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
      return {
        value: input.value,
        matrixTableRef: container?.getAttribute('data-matrix-table-ref'),
        label: label?.textContent?.trim().replace(/\s+/g, ' ')
      };
    });
    
    return { title, description, images, materials };
  });
  
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}

await scrapeFamilyPage(url);
