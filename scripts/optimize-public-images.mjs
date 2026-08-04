// scripts/optimize-public-images.mjs
// Convert the large PNG asset libraries under /public into WebP so the
// site ships dramatically smaller images without losing visual quality.
//
//   public/case-studies/*.png  → resize to 1920w, encode WebP q80
//   public/categories/*.png    → resize to 800w,  encode WebP q80
//
// The originals are kept in place beside the .webp output so this script
// is idempotent and recoverable — once you've confirmed the .webp files
// look right and the site renders correctly, delete the .png files
// separately (or with `npm run optimize-public-images --prune`).
//
// Image references in the codebase:
//   • `components/landing/CategoryGrid.tsx` reads /categories/{slug}.png —
//     updated to .webp in the same change.
//   • Each case-study markdown frontmatter has `heroImage: /case-studies/*.png`
//     — updated to .webp via a follow-up pass that rewrites the .md files.
//
// Sharp is already a devDependency.

import sharp from 'sharp'
import fs from 'node:fs/promises'
import path from 'node:path'

const PUBLIC_DIR = path.join(process.cwd(), 'public')

const HERO_TARGET_WIDTH = 1920
const CATEGORY_TARGET_WIDTH = 800
const QUALITY = 80

const args = new Set(process.argv.slice(2).map((a) => a.replace(/^--?/, '')))
const PRUNE = args.has('prune')

async function optimizeOne(srcPath, targetWidth) {
  const webpPath = srcPath.replace(/\.png$/i, '.webp')
  const beforeStat = await fs.stat(srcPath)
  await sharp(srcPath)
    .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(webpPath)
  const afterStat = await fs.stat(webpPath)
  return { srcPath, webpPath, before: beforeStat.size, after: afterStat.size }
}

async function run(dir, targetWidth, label) {
  const fullDir = path.join(PUBLIC_DIR, dir)
  let entries
  try {
    entries = await fs.readdir(fullDir)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`(skip) ${fullDir} does not exist`)
      return []
    }
    throw err
  }
  const pngs = entries.filter((f) => f.endsWith('.png'))
  if (pngs.length === 0) {
    console.log(`(skip) no .png files in ${fullDir}`)
    return []
  }
  console.log(`\n=== ${label} (${pngs.length} files) ===`)
  let totalBefore = 0
  let totalAfter = 0
  const results = []
  for (const f of pngs) {
    try {
      const { srcPath, webpPath, before, after } = await optimizeOne(
        path.join(fullDir, f),
        targetWidth
      )
      totalBefore += before
      totalAfter += after
      results.push({ srcPath, webpPath, before, after })
      const beforeKb = Math.round(before / 1024)
      const afterKb = Math.round(after / 1024)
      const saving = before ? Math.round(((before - after) / before) * 100) : 0
      console.log(`  ${f.padEnd(48)} ${String(beforeKb).padStart(5)}KB -> ${String(afterKb).padStart(5)}KB  (${saving}% smaller)`)
    } catch (err) {
      console.error(`  ! ${f}: ${err.message}`)
    }
  }
  if (totalBefore > 0) {
    const savedKb = Math.round((totalBefore - totalAfter) / 1024)
    console.log(
      `  TOTAL: ${Math.round(totalBefore / 1024)}KB -> ${Math.round(totalAfter / 1024)}KB  (${savedKb}KB saved, ${Math.round((savedKb * 100) / (totalBefore / 1024))}% smaller)`
    )
  }
  return results
}

const results = [
  ...(await run('case-studies', HERO_TARGET_WIDTH, 'Case-study hero images')),
  ...(await run('categories', CATEGORY_TARGET_WIDTH, 'Category tile images')),
]

if (PRUNE) {
  console.log('\n=== Pruning originals (.png) ===')
  let pruned = 0
  let savedBytes = 0
  for (const r of results) {
    try {
      const stat = await fs.stat(r.srcPath)
      await fs.unlink(r.srcPath)
      pruned++
      savedBytes += stat.size
      console.log(`  removed ${path.relative(process.cwd(), r.srcPath)}`)
    } catch (err) {
      console.error(`  ! ${r.srcPath}: ${err.message}`)
    }
  }
  console.log(`Pruned ${pruned} files, reclaimed ${Math.round(savedBytes / 1024 / 1024)}MB on disk.`)
}

console.log('\nDone.')
