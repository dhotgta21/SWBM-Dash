// scripts/fetch-location-images.mjs
// Fallback image-source script. Used when matrix_generate_image is rate-limited
// or quota-exhausted. Web-searches each missing location/landmark/scenery
// term, picks the best non-social-media image URL, downloads it, and converts
// to 1920w WebP at quality 80 — matching the size/quality of the AI-generated
// images and the existing hero-1..4-4kgen.webp assets.
//
// Each search returns ~10 candidate URLs. We filter out:
//   - Facebook / Instagram / Twitter / Pinterest crawler URLs (lookaside.*, seo/)
//   - URLs without a recognisable image extension (.jpg/.jpeg/.png/.webp)
//   - Anything that 404s or returns non-image content
//
// Re-run safely: skips any public/locations/<slug>.webp that already exists.

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
const MIN_WIDTH = 1000 // anything narrower is a thumbnail we can't hero-strip safely
const MIN_ASPECT = 1.25 // width / height — accept landscape (16:9 ≈ 1.78, 4:3 ≈ 1.33)

const SOCIAL_HOST_PATTERNS = [
  /lookaside\.fbsbx\.com/i,
  /lookaside\.instagram\.com/i,
  /seo\.google_widget/i,
  /pinterest\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /tiktok\.com/i,
]

const VALID_IMAGE_EXTS = /\.(jpe?g|png|webp)(\?|$|#)/i

function parseArgs() {
  const args = process.argv.slice(2)
  const opts = { only: null }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only' && args[i + 1]) {
      opts.only = args[i + 1].split(',').map((s) => s.trim()).filter(Boolean)
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

function buildSearchQuery(item) {
  // Turn the long prompt into a concise, search-friendly query. Strip the
  // cinematic-suffix paragraphs and take the subject clause.
  const subject = item.prompt.split(',')[0].trim()
  // Append common SEO keywords for landscape/scenery type images.
  const tail = item.category === 'scenery'
    ? 'England countryside landscape golden hour'
    : item.category === 'landmark'
    ? 'England landmark golden hour scenic'
    : item.category === 'character'
    ? 'English architecture countryside'
    : 'England town centre golden hour'
  return `${subject}, ${tail}`
}

function isViableImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (SOCIAL_HOST_PATTERNS.some((re) => re.test(url))) return false
  if (!VALID_IMAGE_EXTS.test(url)) {
    // Some hosts (Wikimedia, Pexels CDN) use query-string extensions or no
    // path extension at all. Allow if the host looks image-friendly.
    const hostOk = /(wikimedia\.org|pexels\.com|unsplash\.com|cloudfront\.net|googleusercontent\.com|imgur\.com|staticflickr\.com)/i.test(url)
    if (!hostOk) return false
  }
  return true
}

async function searchOne(item) {
  const query = buildSearchQuery(item)
  const promptFilter = `Photograph, ${item.baseAlt}, no people in foreground, no watermarks, no text overlays, high resolution`
  const batchFile = path.join(TMP_DIR, `search-${item.slug}-${Date.now()}.json`)
  const payload = {
    queries: [
      { query, prompt: promptFilter, task_name: item.slug },
    ],
  }
  await fs.writeFile(batchFile, JSON.stringify(payload), 'utf-8')

  const mavisCmd = path.join(
    process.env.USERPROFILE ?? 'C:\\Users\\sarpa',
    '.mavis', 'bin', 'mavis.cmd',
  )
  const stdout = execFileSync(
    mavisCmd,
    ['mcp', 'call', 'matrix', 'matrix_search_images', '--file', batchFile],
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 },
  )
  // Cleanup batch file
  await fs.unlink(batchFile).catch(() => {})

  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error(`No JSON in search response for ${item.slug}`)
  }
  const response = JSON.parse(stdout.slice(start, end + 1))

  if (response.code !== 0 || !response.results?.[0]?.images) {
    throw new Error(`Search returned no results for ${item.slug}: ${response.message ?? ''}`)
  }

  const viable = response.results[0].images
    .filter((img) => isViableImageUrl(img.image_url))
    .slice(0, 3) // try up to 3 candidates before giving up

  if (viable.length === 0) {
    throw new Error(`No viable image URL for ${item.slug}`)
  }

  return viable.map((v) => v.image_url)
}

async function downloadAndConvert(item) {
  const dst = path.join(PUBLIC_LOCATIONS_DIR, `${item.slug}.webp`)
  if (existsSync(dst)) {
    return { skipped: true, slug: item.slug }
  }

  const candidates = await searchOne(item)
  let lastErr = null

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (StarHawkBuildersMerchant/1.0)' },
        redirect: 'follow',
      })
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`)
        continue
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.startsWith('image/')) {
        lastErr = new Error(`Bad content-type ${contentType} for ${url}`)
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 10_000) {
        lastErr = new Error(`Too-small payload (${buf.length}B) for ${url}`)
        continue
      }

      const tmpFile = path.join(TMP_DIR, `dl-${item.slug}-${Date.now()}.img`)
      await fs.writeFile(tmpFile, buf)

      // Inspect dimensions BEFORE committing. Reject thumbnails and
      // portrait crops — they look blurry on a 16:6 hero strip.
      const meta = await sharp(tmpFile).metadata()
      if (!meta.width || !meta.height) {
        lastErr = new Error(`No metadata for ${url}`)
        await fs.unlink(tmpFile).catch(() => {})
        continue
      }
      const aspect = meta.width / meta.height
      if (meta.width < MIN_WIDTH || aspect < MIN_ASPECT) {
        lastErr = new Error(`Too small/portrait (${meta.width}x${meta.height} aspect ${aspect.toFixed(2)}) for ${url}`)
        await fs.unlink(tmpFile).catch(() => {})
        continue
      }

      const beforeStat = await fs.stat(tmpFile)
      await sharp(tmpFile)
        .resize({ width: TARGET_WIDTH, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: QUALITY, effort: 6 })
        .toFile(dst)
      const afterStat = await fs.stat(dst)
      await fs.unlink(tmpFile).catch(() => {})

      return {
        skipped: false,
        slug: item.slug,
        source: url,
        beforeKb: Math.round(beforeStat.size / 1024),
        afterKb: Math.round(afterStat.size / 1024),
        width: meta.width,
        height: meta.height,
      }
    } catch (err) {
      lastErr = err
      continue
    }
  }

  throw lastErr ?? new Error(`No candidate worked for ${item.slug}`)
}

async function main() {
  const opts = parseArgs()
  await ensureDirs()
  const allPrompts = await loadPrompts()
  let toProcess = allPrompts
  if (opts.only) {
    toProcess = allPrompts.filter((p) => opts.only.includes(p.slug))
  }

  console.log(`Fetching ${toProcess.length} image${toProcess.length === 1 ? '' : 's'} via web search...\n`)

  let totalBefore = 0
  let totalAfter = 0
  let generated = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i]
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${item.slug} ... `)
    try {
      const out = await downloadAndConvert(item)
      if (out.skipped) {
        console.log('skipped (exists)')
        skipped++
      } else {
        console.log(`OK ${out.beforeKb}KB -> ${out.afterKb}KB`)
        totalBefore += out.beforeKb
        totalAfter += out.afterKb
        generated++
      }
    } catch (err) {
      console.log(`FAIL: ${err.message}`)
      failed++
    }

    // Small pause to be polite to the search provider
    if (i + 1 < toProcess.length) {
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  console.log(`\nDone.`)
  console.log(`  Fetched: ${generated}  Skipped: ${skipped}  Failed: ${failed}`)
  if (generated > 0) {
    const savingPct = Math.round(((totalBefore - totalAfter) / totalBefore) * 100)
    console.log(`  Total: ${totalBefore}KB -> ${totalAfter}KB (${savingPct}% smaller)`)
  }
  if (failed > 0) {
    console.log(`  Re-run with --only to retry the failed ones.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})