// scripts/optimize-public-images-top-level.mjs
// One-shot conversion of remaining top-level /public/*.png files to
// WebP for web display. Original PNGs are KEPT for compatibility:
//   • Logo.png         — used in transactional email templates where
//                         Outlook and other email clients don't always
//                         honour WebP. PNG is the safer choice.
//   • logo-square.png  — JSON-LD image/logo URLs can be WebP (Google
//                         accepts). PNG kept as belt-and-braces fallback.
//   • icon-512x512.png — PWA manifest icon. Android does render WebP
//                         manifests fine, iOS Safari is finickier.
//
// The 13 KB apple-touch-icon and the ≤15 KB PNG icons are already small
// enough that WebP conversion would save less than the bandwidth spent
// serving a second <link rel="icon"> — left alone.
//
// Web-facing references are switched to the .webp files in the same
// commit that runs this script.

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

const TARGETS = [
  // Logo.png is the brand mark (1199×1049). Used in headers at ≤56 px
  // wide and in settings at ~100 px. Capping at 256 px preserves
  // crispness on Retina displays while shrinking the file ~85%.
  { file: 'Logo.png', maxWidth: 256, quality: 90 },
  // logo-square.png (1024×1024 ish). Used as the JSON-LD
  // Organization.logo / LocalBusiness.image. Browsers fetch this
  // directly (no Next/Image wrapper for schema.org), so the file
  // size matters.
  { file: 'logo-square.png', maxWidth: 512, quality: 90 },
  // PWA manifest tile. Already 512 px square; cap at 512 to keep the
  // Android home-screen icon crisp.
  { file: 'icon-512x512.png', maxWidth: 512, quality: 90 },
]

async function convert({ file, maxWidth, quality }) {
  const src = path.join(PUBLIC_DIR, file)
  const dst = src.replace(/\.png$/i, '.webp')
  const before = (await fs.stat(src)).size
  await sharp(src)
    .resize({ width: maxWidth, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality, effort: 6 })
    .toFile(dst)
  const after = (await fs.stat(dst)).size
  const beforeKb = Math.round(before / 1024)
  const afterKb = Math.round(after / 1024)
  const saving = before ? Math.round(((before - after) / before) * 100) : 0
  console.log(
    `  ${file.padEnd(22)} ${String(beforeKb).padStart(5)}KB -> ${String(afterKb).padStart(5)}KB  (${saving}% smaller)  →  ${path.basename(dst)}`
  )
}

console.log('=== Top-level public/*.png -> WebP ===')
for (const t of TARGETS) {
  await convert(t)
}
console.log('\nDone. Original PNGs kept on disk for email + PWA fallback compatibility.')
