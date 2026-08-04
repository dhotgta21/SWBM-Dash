// scripts/compress-hero-images.mjs
// Re-encode the marketing hero background images so the home-page LCP
// stays fast on mobile and slow connections. Keeps the same filenames so
// no component code needs to change.

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const TMP_DIR = path.join(process.cwd(), '.tmp')
const IMAGES = [
  'hero-1-4kgen.webp',
  'hero-2-4kgen.webp',
  'hero-3-4kgen.webp',
  'hero-4-4kgen.webp',
]

const TARGET_WIDTH = 1920
const QUALITY = 80

async function compress(filename) {
  const inputPath = path.join(PUBLIC_DIR, filename)
  const tmpInputPath = path.join(TMP_DIR, filename)
  const tmpOutputPath = path.join(TMP_DIR, `${filename}.compressed`)

  await fs.mkdir(TMP_DIR, { recursive: true })
  await fs.copyFile(inputPath, tmpInputPath)

  const metadata = await sharp(tmpInputPath).metadata()
  const beforeStat = await fs.stat(inputPath)

  await sharp(tmpInputPath)
    .resize({
      width: TARGET_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(tmpOutputPath)

  await fs.copyFile(tmpOutputPath, inputPath)

  const afterStat = await fs.stat(inputPath)

  const beforeKb = Math.round(beforeStat.size / 1024)
  const afterKb = Math.round(afterStat.size / 1024)
  const saving = Math.round(((beforeStat.size - afterStat.size) / beforeStat.size) * 100)

  console.log(`${filename}: ${beforeKb}KB → ${afterKb}KB (${metadata.width}x${metadata.height} → ${TARGET_WIDTH}w, ${saving}% smaller)`)
}

async function main() {
  for (const filename of IMAGES) {
    await compress(filename)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
