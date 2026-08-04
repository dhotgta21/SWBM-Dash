// scripts/optimize-public-icons.mjs
// Tidy-up: convert favicon-tier icons to WebP at matching dimensions
// so the browser <link rel="icon"> chain (and PWA manifest) can ship
// the smaller file alongside the PNG fallbacks (kept for older iOS
// and crawlers that don't reliably negotiate WebP).

import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs/promises'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

const TARGETS = [
  { file: 'icon-48x48.png', maxWidth: 48 },
  { file: 'icon-192x192.png', maxWidth: 192 },
]

for (const t of TARGETS) {
  const src = path.join(PUBLIC_DIR, t.file)
  const dst = src.replace(/\.png$/i, '.webp')
  const before = (await fs.stat(src)).size
  await sharp(src)
    .resize({ width: t.maxWidth, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: 90, effort: 6 })
    .toFile(dst)
  const after = (await fs.stat(dst)).size
  console.log(
    `${t.file} -> ${path.basename(dst)}: ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB (${Math.round(((before - after) / before) * 100)}% smaller)`
  )
}

