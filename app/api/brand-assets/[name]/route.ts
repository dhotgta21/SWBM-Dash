// app/api/brand-assets/[name]/route.ts
// Serves brand assets (Logo.png, favicon.ico, icon-*, …). Custom variants
// uploaded via Settings → Brand live in the `logos` Storage bucket under
// brand/ (lib/logo-processor.ts); the shipped defaults stay as static files
// in public/. The middleware rewrites the fixed root paths to this route
// so every consumer with a hard-coded filename keeps working.
//
// Fallback order: bucket variant → shipped public/ file → 404.

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'logos'
const OBJECT_PREFIX = 'brand'

// Allowlist — must stay in sync with BRAND_FILES in lib/logo-processor.ts
// and the middleware matcher in proxy.ts. Anything else is a 404 (also
// prevents path traversal, since the name becomes a storage key / fs path).
const BRAND_FILES = new Set([
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
])

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

// Short browser cache so a newly uploaded logo shows up within minutes;
// longer shared cache so the CDN shields the storage/fetch round-trip.
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params

  if (!BRAND_FILES.has(name)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const headers = {
    'Content-Type': contentTypeFor(name),
    'Cache-Control': CACHE_CONTROL,
  }

  // 1. Custom variant in Storage.
  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient.storage
      .from(BUCKET)
      .download(`${OBJECT_PREFIX}/${name}`)
    if (!error && data) {
      const buffer = Buffer.from(await data.arrayBuffer())
      return new NextResponse(buffer, { status: 200, headers })
    }
  } catch (err) {
    console.error('[brand-assets] storage fetch failed, falling back to static file:', err)
  }

  // 2. Shipped default in public/.
  try {
    const buffer = await readFile(join(process.cwd(), 'public', name))
    return new NextResponse(buffer, { status: 200, headers })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
