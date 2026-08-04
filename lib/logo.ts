// lib/logo.ts
// Inlined base64 logo for PDF/email rendering, computed once per server process.
//
// The canonical brand asset lives in public/Logo.webp. Because @react-pdf/renderer
// (via pdfkit) only supports PNG/JPEG images, we read the WebP source and convert
// it to a PNG data URL here. HTML/Next.js renderers reference /Logo.webp directly;
// this helper is kept for server-side PDF generation and email routes.
//
// The read is wrapped in try/catch — if the file is missing or unreadable, callers
// get null and can fall back to a plain placeholder in the rendered output.

import { readFile } from 'fs/promises'
import { join } from 'path'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'

let cached: Promise<string | null> | null = null
let cachedPath: string | null = null

const DEFAULT_LOGO_PATH = '/Logo.webp'

/**
 * Read a brand asset by filename: custom variants uploaded via
 * Settings → Brand live in the `logos` Storage bucket under brand/
 * (lib/logo-processor.ts); the shipped defaults stay in public/.
 * Storage first, static file as fallback — null when neither exists.
 */
export async function getBrandAssetBuffer(name: string): Promise<Buffer | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from('logos').download(`brand/${name}`)
    if (!error && data) {
      return Buffer.from(await data.arrayBuffer())
    }
  } catch {
    // Storage unreachable — fall back to the shipped static file.
  }
  try {
    return await readFile(join(process.cwd(), 'public', name))
  } catch {
    return null
  }
}

/**
 * Read the configured logo path from company_settings. Falls back to the
 * shipped default if the DB is unreachable or no custom logo is set.
 */
export async function getConfiguredLogoPath(): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('company_settings')
      .select('logo_url')
      .eq('id', 1)
      .maybeSingle()
    return data?.logo_url || DEFAULT_LOGO_PATH
  } catch (err) {
    console.warn('Could not load configured logo path (non-fatal):', err instanceof Error ? err.message : err)
    return DEFAULT_LOGO_PATH
  }
}

/**
 * Return the current logo as a PNG data URL for use in PDFs and emails.
 * Caches the result per server process; cache is reset in development.
 */
export async function getLogoDataUrl(): Promise<string | null> {
  if (process.env.NODE_ENV === 'development') {
    cached = null
    cachedPath = null
  }

  const configuredPath = await getConfiguredLogoPath()

  if (!cached || cachedPath !== configuredPath) {
    cachedPath = configuredPath
    cached = (async () => {
      try {
        const webpBuf = await getBrandAssetBuffer(configuredPath.replace(/^\//, ''))
        if (!webpBuf) {
          throw new Error(`Logo asset not found: ${configuredPath}`)
        }
        const pngBuf = await sharp(webpBuf).png().toBuffer()
        return `data:image/png;base64,${pngBuf.toString('base64')}`
      } catch (err) {
        // Don't crash the request if the logo is missing — the
        // renderers know how to draw a placeholder.
        console.warn('Logo read failed (non-fatal):', err instanceof Error ? err.message : err)
        return null
      }
    })()
  }

  return cached
}
