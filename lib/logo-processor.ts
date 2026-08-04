// lib/logo-processor.ts
//
// Server-only utility that takes a single uploaded image and generates the
// full brand-asset matrix the SWBM site expects. Variants are uploaded to
// the `logos` Supabase Storage bucket under the `brand/` prefix (previously
// they were written into public/ at request time, which fails on serverless
// hosts and was silently lost on every redeploy).
//
// Serving: app/api/brand-assets/[name]/route.ts streams the custom variant
// from the bucket and falls back to the shipped default in public/. The
// middleware (proxy.ts) rewrites the fixed root paths (/Logo.png,
// /favicon.ico, …) to that route, so the dozens of consumers with
// hard-coded filenames (favicon metadata, manifest, OG image, PDF helpers,
// BrandLogo, DashboardBrand) keep working unchanged.

import sharp, { type Sharp } from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'logos'
const OBJECT_PREFIX = 'brand'

const ALLOWED_LOGO_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
])

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

// Files that form the brand-asset family. Keep in sync with
// app/api/brand-assets/[name]/route.ts and the middleware matcher in
// proxy.ts.
const BRAND_FILES = [
  'Logo.png',
  'Logo.webp',
  'logo-square.png',
  'logo-square.webp',
  'logo-email.png',
  'logo-mono-dark.png',
  'logo-mono-light.png',
  'icon-16x16.png',
  'icon-16x16.webp',
  'icon-32x32.png',
  'icon-32x32.webp',
  'icon-48x48.png',
  'icon-48x48.webp',
  'icon-192x192.png',
  'icon-192x192.webp',
  'icon-512x512.png',
  'icon-512x512.webp',
  'apple-touch-icon.png',
  'favicon.ico',
]

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

export interface ProcessLogoResult {
  success: boolean
  written?: string[]
  error?: string
}

function containResize(img: Sharp, w: number, h: number): Sharp {
  return img.resize(w, h, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
}

function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

async function uploadVariant(name: string, buf: Buffer): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(`${OBJECT_PREFIX}/${name}`, buf, {
      contentType: contentTypeFor(name),
      upsert: true,
      // Browsers/CDNs may hold the old variant briefly; the brand-asset
      // route caps its own cache headers the same way.
      cacheControl: '300',
    })
  if (error) {
    throw new Error(`Storage upload failed for ${name}: ${error.message}`)
  }
}

async function writePng(img: Sharp, name: string): Promise<void> {
  const buf = await img
    .clone()
    .png({ compressionLevel: 9, palette: true, quality: 100, colors: 16, effort: 10 })
    .toBuffer()
  await uploadVariant(name, buf)
}

async function writeWebp(img: Sharp, name: string): Promise<void> {
  const buf = await img.clone().webp({ quality: 92, effort: 6 }).toBuffer()
  await uploadVariant(name, buf)
}

async function writeIco(img: Sharp, name: string, sizes: number[] = [16, 32, 48]): Promise<void> {
  const pngs = await Promise.all(sizes.map((s) => containResize(img, s, s).png().toBuffer()))

  const headerSize = 6 + 16 * sizes.length
  let offset = headerSize
  const header = Buffer.alloc(headerSize)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(sizes.length, 4) // count

  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]
    const base = 6 + i * 16
    header.writeUInt8(s === 256 ? 0 : s, base + 0)
    header.writeUInt8(s === 256 ? 0 : s, base + 1)
    header.writeUInt8(0, base + 2)
    header.writeUInt8(0, base + 3)
    header.writeUInt16LE(1, base + 4)
    header.writeUInt16LE(32, base + 6)
    header.writeUInt32LE(pngs[i].length, base + 8)
    header.writeUInt32LE(offset, base + 12)
    offset += pngs[i].length
  }

  const out = Buffer.concat([header, ...pngs])
  await uploadVariant(name, out)
}

async function monochrome(img: Sharp, hex: string): Promise<Sharp> {
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

async function onWhiteTile(img: Sharp, size = 512): Promise<Sharp> {
  const inner = await containResize(img, size, size).png().toBuffer()
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).composite([{ input: inner, gravity: 'center' }]).png()
}

async function loadMaster(sourceBuffer: Buffer, sourceMime: string): Promise<Sharp> {
  if (sourceMime === 'image/svg+xml') {
    // Rasterise SVG at a high resolution so downstream variants stay crisp.
    return sharp(sourceBuffer, { density: 300 }).resize(2048, 2048, { fit: 'inside' })
  }

  if (sourceMime === 'image/gif') {
    // sharp will use the first frame by default.
    return sharp(sourceBuffer, { pages: 1 })
  }

  return sharp(sourceBuffer)
}

/**
 * Validate an uploaded logo file before processing.
 */
export function validateLogoFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return {
      ok: false,
      error: `Unsupported file type: ${file.type || 'unknown'}. Please upload PNG, JPG, WebP, GIF, or SVG.`,
    }
  }

  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return {
      ok: false,
      error: `Logo must be smaller than 5 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`,
    }
  }

  return { ok: true }
}

/**
 * Restore the shipped default brand assets: deleting the custom variants
 * from the bucket makes the brand-asset route fall back to the static
 * files in public/ again. No local backup is needed any more — the
 * defaults are never overwritten (previously this copied files out of
 * public/_default-logo, which runtime uploads had replaced).
 */
export async function restoreDefaultLogos(): Promise<{ success: boolean; error?: string }> {
  try {
    const adminClient = createAdminClient()
    const objects = BRAND_FILES.map((name) => `${OBJECT_PREFIX}/${name}`)
    const { error } = await adminClient.storage.from(BUCKET).remove(objects)
    if (error) {
      console.error('[logo-processor] failed to remove custom brand assets:', error)
      return { success: false, error: `Could not restore the default logo: ${error.message}` }
    }
    return { success: true }
  } catch (err) {
    console.error('[logo-processor] restoreDefaultLogos failed:', err)
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Could not restore the default logo: ${message}` }
  }
}

/**
 * Generate the full brand-asset matrix from an uploaded image buffer and
 * upload every variant to the logos bucket.
 */
export async function processLogo(sourceBuffer: Buffer, sourceMime: string): Promise<ProcessLogoResult> {
  try {
    const master = await loadMaster(sourceBuffer, sourceMime)

    // Ensure the master has an alpha channel for transparent variants.
    const src = master.ensureAlpha()

    // ── canonical master ───────────────────────────────────────────────────
    await writePng(src, 'Logo.png')
    await writeWebp(src, 'Logo.webp')

    // ── square (OG card, JSON-LD) ──────────────────────────────────────────
    await writePng(containResize(src, 1024, 1024), 'logo-square.png')
    await writeWebp(containResize(src, 1024, 1024), 'logo-square.webp')

    // ── email-friendly white tile ──────────────────────────────────────────
    await writePng(await onWhiteTile(src, 512), 'logo-email.png')

    // ── monochrome marks ───────────────────────────────────────────────────
    await writePng(await monochrome(containResize(src, 1024, 1024), '#0f172a'), 'logo-mono-dark.png')
    await writePng(await monochrome(containResize(src, 1024, 1024), '#ffffff'), 'logo-mono-light.png')

    // ── icon ladder ────────────────────────────────────────────────────────
    const iconSizes = [16, 32, 48, 192, 512]
    for (const s of iconSizes) {
      await writePng(containResize(src, s, s), `icon-${s}x${s}.png`)
      await writeWebp(containResize(src, s, s), `icon-${s}x${s}.webp`)
    }
    await writePng(containResize(src, 180, 180), 'apple-touch-icon.png')

    // ── favicon.ico ────────────────────────────────────────────────────────
    await writeIco(src, 'favicon.ico')

    return { success: true, written: BRAND_FILES }
  } catch (err) {
    console.error('[logo-processor] failed to generate logo variants:', err)
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Could not process the uploaded logo: ${message}`,
    }
  }
}
