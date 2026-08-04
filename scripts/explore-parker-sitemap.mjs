import { writeFileSync } from 'fs';

async function fetchXml(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.text();
}

function parseUrls(xml) {
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  return urls;
}

const xml = await fetchXml('https://www.parkersteel.co.uk/sitemap.xml');
const urls = parseUrls(xml);

const families = [];
const materials = [];
const variants = [];
const other = [];

for (const url of urls) {
  const path = new URL(url).pathname;
  if (path.startsWith('/product/f/')) {
    families.push({ url, path });
  } else if (path.startsWith('/product/m/')) {
    materials.push({ url, path });
  } else if (path.startsWith('/product/p/')) {
    variants.push({ url, path });
  } else {
    other.push({ url, path });
  }
}

console.log('Families:', families.length);
console.log('Material pages:', materials.length);
console.log('Variant pages:', variants.length);
console.log('Other:', other.length);

// Group material pages by slug and material
const bySlug = {};
for (const { path } of materials) {
  const parts = path.split('/').filter(Boolean);
  // /product/m/{id}/{material}/{slug}
  const material = parts[3];
  const slug = parts.slice(4).join('/');
  if (!bySlug[slug]) bySlug[slug] = [];
  bySlug[slug].push({ path, material, id: parts[2] });
}

console.log('Unique product slugs:', Object.keys(bySlug).length);
console.log('Slugs with multiple materials:', Object.entries(bySlug).filter(([k,v]) => v.length > 1).length);

// Show slugs and their materials
const summary = Object.entries(bySlug)
  .map(([slug, items]) => ({ slug, materials: items.map(i => i.material), ids: items.map(i => i.id) }))
  .sort((a, b) => b.materials.length - a.materials.length);

writeFileSync('.tmp/parker-sitemap-summary.json', JSON.stringify({ families, materials, variants: variants.slice(0, 100), bySlug: summary }, null, 2));
console.log('Wrote .tmp/parker-sitemap-summary.json');
