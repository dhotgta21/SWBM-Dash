// scripts/regenerate-hero-webp.mjs
// Regenerate the hero background WEBPs from the original 4K PNGs.
//
// Source: C:/Users/sarpa/Downloads/hero-{1,2,3,4}-4kgen.png (5504x3072 RGB)
// Target: <repo>/public/hero-{1,2,3,4}-4kgen.webp (1920w, quality 80)
//
// Resizes the long side to 1920px so Next.js Image can downscale
// further per viewport without re-encoding a giant source. WEBP q=80
// with effort=6 hits the same visual quality as the old .compressed
// output but starts from the full-resolution master so the downscale
// is sharper.

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const SRC_DIR = 'C:\\Users\\sarpa\\Downloads'
const DST_DIR = path.join(process.cwd(), 'public')

const TARGET_WIDTH = 1920
const QUALITY = 80

const FILES = [1, 2, 3, 4]

async function convert(idx) {
  const src = path.join(SRC_DIR, `hero-${idx}-4kgen.png`)
  const dst = path.join(DST_DIR, `hero-${idx}-4kgen.webp`)

  const beforeStat = await fs.stat(src)
  const meta = await sharp(src).metadata()

  await sharp(src)
    .resize({
      width: TARGET_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(dst)

  const afterStat = await fs.stat(dst)
  const beforeMb = (beforeStat.size / 1024 / 1024).toFixed(1)
  const afterKb = Math.round(afterStat.size / 1024)
  console.log(
    `hero-${idx}-4kgen.webp  ${meta.width}x${meta.height} → ${TARGET_WIDTH}w  ${beforeMb}MB → ${afterKb}KB`,
  )
}

async function main() {
  for (const i of FILES) {
    await convert(i)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})