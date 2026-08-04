// scripts/generate-logo-variants.mjs
//
// Generate the canonical brand-asset family from a single transparent PNG.
// Reads  public/Logo.png  (already background-removed via rembg — see
// scripts/remove-logo-background.mjs) and writes the full set of sizes /
// formats / variants the SWBM site and emails expect.
//
// Why this exists
// ---------------
// The site used to ship a single composite PNG (wings + wordmark) reused for
// the favicon, header, email, OG card and PDF. With a transparent
// lettermark we get a sharper brand at every size — but only if every
// surface has its own tuned file. This script is the single source of truth
// for that matrix. Re-run after any brand refresh.
//
// Important: every resize uses  fit: 'contain'  so the full letterform is
// always inside the canvas. We never crop — side-cropping sliced the "S"
// and "H" at small sizes and looked broken in the browser tab. The
// transparent padding around the mark is the price; the trade-off is
// worth it for legibility at every resolution.
//
// Variants produced
// -----------------
//   public/Logo.png             canonical composite (transparent)        – PDF / email / BrandLogo
//   public/Logo.webp            webp of the above                       – BrandLogo <Image> (header)
//   public/logo-square.png      1024×1024, contain-fit, transparent     – OG card, JSON-LD logo, blog schema
//   public/logo-square.webp     webp of the above                       – lightweight square
//   public/logo-email.png       512×512 opaque-white tile               – transactional email body (white tile)
//   public/logo-mono-dark.png   single-colour black on transparent      – print, watermarks, embossing
//   public/logo-mono-light.png  single-colour white on transparent      – dark backgrounds
//   public/icon-16x16.png       favicon-size square, transparent
//   public/icon-32x32.png
//   public/icon-48x48.{png,webp}
//   public/icon-192x192.{png,webp}
//   public/icon-512x512.{png,webp}
//   public/apple-touch-icon.png 180×180 (Apple's "precomposed" spec — no rounded-corner mask needed)
//   public/favicon.ico          multi-size 16/32/48 from the same artwork
//
// All code paths (BrandLogo, opengraph-image.tsx, layout.tsx icons, lib/logo.ts,
// CartView, transactional email template) already point at these filenames —
// so updating the assets is enough to update every surface. No code edits
// required after this script runs.

import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Resize an image so it fits inside (w, h) without ever cropping. Anything
// not covered by the mark is left fully transparent.
function containResize(img, w, h) {
  return img.resize(w, h, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

async function load() {
  const buf = await readFile(join(PUBLIC, 'Logo.png'))
  const img = sharp(buf)
  const meta = await img.metadata()
  console.log(`  source Logo.png  ${meta.width}×${meta.height} ${meta.channels}ch`)
  return img
}

async function writePng(img, name) {
  // Palette mode with 16 colours crushes PNGs that are mostly a single
  // brand colour + transparent bands (which is every variant here). Cuts
  // the icon ladder and email tile ~5-10× vs raw RGBA.
  const buf = await img
    .clone()
    .png({ compressionLevel: 9, palette: true, quality: 100, colors: 16, effort: 10 })
    .toBuffer()
  await writeFile(join(PUBLIC, name), buf)
}

async function writeWebp(img, name) {
  const buf = await img.clone().webp({ quality: 92, effort: 6 }).toBuffer()
  await writeFile(join(PUBLIC, name), buf)
}

// Hand-pack a multi-size ICO with PNG-encoded entries (Vista+ format).
// sharp < 0.32 doesn't ship an .ico() encoder, so we assemble the
// container ourselves — it's a 6-byte header + N×16-byte directory
// entries + N PNG blobs.
async function writeIco(img, name, sizes = [16, 32, 48]) {
  const pngs = await Promise.all(
    sizes.map((s) => containResize(img, s, s).png().toBuffer()),
  )

  const headerSize = 6 + 16 * sizes.length
  let offset = headerSize
  const header = Buffer.alloc(headerSize)
  // ICONDIR
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = 1 (icon)
  header.writeUInt16LE(sizes.length, 4) // count
  // ICONDIRENTRY × N
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]
    const base = 6 + i * 16
    header.writeUInt8(s === 256 ? 0 : s, base + 0) // width  (0 means 256)
    header.writeUInt8(s === 256 ? 0 : s, base + 1) // height (0 means 256)
    header.writeUInt8(0, base + 2) // colour count
    header.writeUInt8(0, base + 3) // reserved
    header.writeUInt16LE(1, base + 4) // colour planes
    header.writeUInt16LE(32, base + 6) // bits per pixel
    header.writeUInt32LE(pngs[i].length, base + 8) // image size
    header.writeUInt32LE(offset, base + 12) // image offset
    offset += pngs[i].length
  }
  const out = Buffer.concat([header, ...pngs])
  await writeFile(join(PUBLIC, name), out)
}

// Solid-fill (monochrome) variant: keep alpha, recolour RGB.
async function monochrome(img, hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const { data, info } = await img.clone().raw().toBuffer({ resolveWithObject: true })
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i += info.channels) {
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = data[i + 3] // preserve alpha
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: info.channels } })
}

// Opaque-white tile variant for transactional emails — places the mark on a
// flat white square so dark/red artwork doesn't disappear into Outlook's
// default white-on-white rendering of unknown backgrounds.
async function onWhiteTile(img, size = 512) {
  const inner = await containResize(img, size, size).png().toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
}

async function run() {
  console.log('Generating logo variants from public/Logo.png …')
  const src = await load()

  // ── canonical ───────────────────────────────────────────────────────────
  // Master keeps its native aspect ratio (1054×1200 after the 2026-07-07
  // re-crop — the source asset now sits at aspect 0.878, see lib/brand.ts).
  // Used by the header, the PDF data URL, the email-data-URL fallback, etc.
  await writePng(src, 'Logo.png')
  await writeWebp(src, 'Logo.webp')

  // ── square (OG card, JSON-LD, blog schema) ──────────────────────────────
  // contain-fit so the full mark is inside the square, transparent bands
  // on top + bottom (the mark is wider than tall).
  await writePng(containResize(src, 1024, 1024), 'logo-square.png')
  await writeWebp(containResize(src, 1024, 1024), 'logo-square.webp')

  // ── email-friendly white tile ───────────────────────────────────────────
  await writePng(await onWhiteTile(src, 512), 'logo-email.png')

  // ── monochrome brand marks ──────────────────────────────────────────────
  await writePng(await monochrome(containResize(src, 1024, 1024), '#0f172a'), 'logo-mono-dark.png')
  await writePng(await monochrome(containResize(src, 1024, 1024), '#ffffff'), 'logo-mono-light.png')

  // ── icon ladder ─────────────────────────────────────────────────────────
  const iconSizes = [16, 32, 48, 192, 512]
  for (const s of iconSizes) {
    await writePng(containResize(src, s, s), `icon-${s}x${s}.png`)
    await writeWebp(containResize(src, s, s), `icon-${s}x${s}.webp`)
  }
  // Apple touch icon — 180×180. Apple applies its own mask so we ship a
  // flat transparent PNG; contain-fit keeps the full mark visible.
  await writePng(containResize(src, 180, 180), 'apple-touch-icon.png')

  // ── favicon.ico (multi-size) ────────────────────────────────────────────
  await writeIco(src, 'favicon.ico')

  console.log('done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})