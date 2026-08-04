// scripts/switch-case-study-images-to-webp.mjs
// One-shot migration: rewrite every case-study markdown's `heroImage`
// frontmatter from .png to .webp, since the image-optimizer just wrote
// fresh .webp siblings next to the originals.

import fs from 'node:fs/promises'
import path from 'node:path'

const CONTENT_DIR = path.join(process.cwd(), 'content', 'case-studies')

const files = (await fs.readdir(CONTENT_DIR)).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
let updated = 0
let skipped = 0

for (const file of files) {
  const full = path.join(CONTENT_DIR, file)
  const raw = await fs.readFile(full, 'utf-8')
  if (!raw.includes('-hero.png')) {
    skipped++
    continue
  }
  const next = raw.replace(/(heroImage:\s*["']?[^"'\n]*?-hero)\.png(["']?)/g, '$1.webp$2')
  if (next === raw) {
    skipped++
    continue
  }
  await fs.writeFile(full, next, 'utf-8')
  updated++
}

console.log(`Updated ${updated} of ${files.length} case-study files (${skipped} skipped — no .png heroImage).`)
