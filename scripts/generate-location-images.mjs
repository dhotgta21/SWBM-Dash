// scripts/generate-location-images.mjs
// One-shot generator for the 50 cinematic golden-hour location hero images.
// Reads scripts/location-images-prompts.json, calls the matrix_generate_image
// MCP in batches of 10, downloads each result, and converts to 1920w WebP at
// quality 80 in public/locations/<slug>.webp — matching the size/quality of
// the existing hero-1..4-4kgen.webp assets so Next.js serves them at the
// same per-viewport cost.
//
// Re-run safely: skips any public/locations/<slug>.webp that already exists,
// so a partial batch only re-fetches the missing ones.
//
// Usage:
//   node scripts/generate-location-images.mjs                  # full run
//   node scripts/generate-location-images.mjs --only windsor-castle,seven-sisters-cliffs
//   node scripts/generate-location-images.mjs --batch 5         # only 5 images

import sharp from 'sharp'
import fs from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const PROMPTS_PATH = path.join(ROOT, 'scripts', 'location-images-prompts.json')
const PUBLIC_LOCATIONS_DIR = path.join(ROOT, 'public', 'locations')
const TMP_DIR = path.join(ROOT, '.tmp', 'location-images')

const TARGET_WIDTH = 1920
const QUALITY = 80
const BATCH_SIZE = 5 // Smaller batches dodge intermittent 10-image rate limits
const BATCH_DELAY_MS = 3000

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { only: null, batch: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only' && args[i + 1]) {
      opts.only = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
      i++
    } else if (args[i] === '--batch' && args[i + 1]) {
      opts.batch = parseInt(args[i + 1], 10)
      i++
    }
  }
  return opts
}

async function ensureDirs() {
  mkdirSync(PUBLIC_LOCATIONS_DIR, { recursive: true })
  mkdirSync(TMP_DIR, { recursive: true })
}

async function loadPrompts() {
  const raw = await fs.readFile(PROMPTS_PATH, 'utf-8')
  return JSON.parse(raw)
}

async function generateBatch(items) {
  // Write the batch payload to a tmp JSON file and invoke the MCP via
  // --file (single-quote wrapping in PowerShell breaks the inline JSON).
  const batchFile = path.join(TMP_DIR, `batch-${Date.now()}.json`)
  const payload = {
    requests: items.map((it) => ({
      prompt: it.prompt,
      aspect_ratio: '21:9',
      resolution: '2K',
    })),
  }
  await fs.writeFile(batchFile, JSON.stringify(payload), 'utf-8')

  let stdout
  try {
    // mavis is a .cmd shim and lives at C:\Users\sarpa\.mavis\bin\mavis.cmd
    // — execFileSync won't find it via bare name from the Node child env on
    // Windows, so resolve the full path explicitly.
    const mavisCmd = path.join(
      process.env.USERPROFILE ?? 'C:\\Users\\sarpa',
      '.mavis', 'bin', 'mavis.cmd',
    )
    stdout = execFileSync(
      mavisCmd,
      ['mcp', 'call', 'matrix', 'matrix_generate_image', '--file', batchFile],
      { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
    )
  } finally {
    // Don't delete yet — we still need to verify the success_items output_paths.
    // The script's tail cleanup handles this.
  }

  // The MCP CLI prints a "Tip" prelude and a "[mavis hint]" postlude.
  // Slice from the first "{" to the last "}".
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`Could not find JSON object in MCP response:\n${stdout}`)
  }
  let response
  try {
    response = JSON.parse(stdout.slice(start, end + 1))
  } catch (err) {
    throw new Error(`Failed to parse MCP response JSON: ${err.message}\nRaw:\n${stdout}`)
  }

  if (response.code !== 0 || (response.total_failed ?? 0) > 0) {
    console.error('Raw response:', JSON.stringify(response, null, 2))
    throw new Error(`MCP batch failed: ${response.message ?? 'unknown'}`)
  }

  if (!response.success_items || response.success_items.length === 0) {
    console.error('Empty success_items. Raw response:', JSON.stringify(response, null, 2))
    throw new Error('MCP returned no success_items')
  }

  return response.success_items.map((item, idx) => ({
    slug: items[idx].slug,
    baseAlt: items[idx].baseAlt,
    category: items[idx].category,
    outputUrl: item.output_url,
    outputFile: item.output_file,
  }))
}

async function convertOne(item) {
  const dst = path.join(PUBLIC_LOCATIONS_DIR, `${item.slug}.webp`)
  if (existsSync(dst)) {
    return { skipped: true, slug: item.slug }
  }

  // The MCP returns either a local Windows path or a remote CDN URL
  // depending on its routing. Handle both.
  const isRemote = /^https?:\/\//i.test(item.outputUrl)
  let inputPath
  let cleanup = async () => {}

  if (isRemote) {
    const tmpDownload = path.join(TMP_DIR, `dl-${item.slug}-${Date.now()}.png`)
    const res = await fetch(item.outputUrl)
    if (!res.ok) {
      throw new Error(`CDN fetch ${res.status}: ${item.outputUrl}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(tmpDownload, buf)
    inputPath = tmpDownload
    cleanup = () => fs.unlink(tmpDownload).catch(() => {})
  } else {
    if (!existsSync(item.outputUrl)) {
      throw new Error(`MCP output not found: ${item.outputUrl}`)
    }
    inputPath = item.outputUrl
    cleanup = () => fs.unlink(item.outputUrl).catch(() => {})
  }

  const beforeStat = await fs.stat(inputPath)
  await sharp(inputPath)
    .resize({
      width: TARGET_WIDTH,
      withoutEnlargement: true,
      fit: 'inside',
    })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(dst)
  const afterStat = await fs.stat(dst)
  await cleanup()

  return {
    skipped: false,
    slug: item.slug,
    beforeKb: Math.round(beforeStat.size / 1024),
    afterKb: Math.round(afterStat.size / 1024),
  }
}

async function cleanupTmp() {
  try {
    const files = await fs.readdir(TMP_DIR)
    await Promise.all(
      files
        .filter((f) => f.startsWith('batch-'))
        .map((f) => fs.unlink(path.join(TMP_DIR, f)).catch(() => {})),
    )
  } catch {
    // ignore
  }
}

async function main() {
  const opts = parseArgs()
  await ensureDirs()
  const allPrompts = await loadPrompts()

  let toProcess = allPrompts
  if (opts.only) {
    toProcess = allPrompts.filter((p) => opts.only.includes(p.slug))
  }
  if (opts.batch) {
    toProcess = toProcess.slice(0, opts.batch)
  }

  console.log(
    `Generating ${toProcess.length} image${toProcess.length === 1 ? '' : 's'} in batches of ${BATCH_SIZE}...\n`,
  )

  let totalBefore = 0
  let totalAfter = 0
  let generated = 0
  let skipped = 0

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE)
    console.log(`Batch ${batchIdx}/${totalBatches} — ${batch.length} image${batch.length === 1 ? '' : 's'}`)

    const results = await generateBatch(batch)
    for (const r of results) {
      try {
        const out = await convertOne(r)
        if (out.skipped) {
          console.log(`  · ${out.slug}: skipped (already exists)`)
          skipped++
        } else {
          console.log(`  + ${out.slug}: ${out.beforeKb}KB -> ${out.afterKb}KB`)
          totalBefore += out.beforeKb
          totalAfter += out.afterKb
          generated++
        }
      } catch (err) {
        console.error(`  ! ${r.slug}: ${err.message}`)
      }
    }

    if (i + BATCH_SIZE < toProcess.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  await cleanupTmp()

  console.log(`\nDone.`)
  console.log(`  Generated: ${generated}  Skipped: ${skipped}`)
  if (generated > 0) {
    const savingPct = Math.round(((totalBefore - totalAfter) / totalBefore) * 100)
    console.log(`  Total: ${totalBefore}KB -> ${totalAfter}KB (${savingPct}% smaller)`)
  }
  console.log(`  Output: ${path.relative(ROOT, PUBLIC_LOCATIONS_DIR)}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})