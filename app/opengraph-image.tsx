import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'
import { loadSeoConfig, type SeoConfig } from '@/lib/seo/company-seo'
import { getConfiguredLogoPath, getBrandAssetBuffer } from '@/lib/logo'

export const runtime = 'nodejs'
export const alt = 'Star Hawk Builders Merchant'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

const FALLBACK_SEO: SeoConfig = {
  siteUrl: 'https://www.starhawkbm.com',
  siteName: 'Star Hawk Builders Merchant',
  home: {
    title: 'Star Hawk Builders Merchant | Building Materials & Timber',
    description:
      'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.',
    keywords: [],
    ogTitle: 'Star Hawk Builders Merchant | Building Materials & Timber',
    ogDescription:
      'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.',
  },
  shop: { title: 'Get a Trade Quote', description: '' },
  catalog: { title: 'Full Product Catalogue', description: '' },
  cart: { title: 'Your Quote Cart', description: '' },
  templates: {
    categoryTitle: '{category} | Trade Prices & Same-Day Delivery | {site}',
    categoryDescription: 'Buy {category} from {site}. Trade prices on application, same-day delivery.',
    productTitle: '{product} | Trade Prices & Same-Day Delivery | {site}',
    productDescription: 'Buy {product} from {site}. Trade prices on application, same-day delivery.',
  },
  sameAs: [],
  priceRange: null,
  geo: null,
  mapsUrl: null,
}

async function logoDataUrl(): Promise<string> {
  try {
    const configured = await getConfiguredLogoPath().catch(() => '/Logo.webp')
    // The configured path is the canonical webp; OG image wants the square PNG.
    const logoFile = configured === '/Logo.webp' ? 'logo-square.png' : configured.replace(/^\//, '')
    // Storage-first read: custom brand variants live in the logos bucket
    // (see getBrandAssetBuffer); shipped defaults fall back to public/.
    const buffer = await getBrandAssetBuffer(logoFile)
    if (!buffer) throw new Error(`logo asset not found: ${logoFile}`)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch {
    // Fall back to the original logo if the square version is missing.
    const buffer = await getBrandAssetBuffer('Logo.png')
    if (!buffer) throw new Error('logo asset not found: Logo.png')
    return `data:image/png;base64,${buffer.toString('base64')}`
  }
}

export default async function Image() {
  let seo: SeoConfig
  try {
    seo = await loadSeoConfig()
  } catch {
    // Build environments may not have admin credentials available.
    // Fall back to a branded default image rather than failing the build.
    seo = FALLBACK_SEO
  }

  const logoSrc = await logoDataUrl()

  try {
    return await eagerRender(renderOgImage(seo, logoSrc))
  } catch (err) {
    // Image decoding can fail in some build environments (sharp/libvips
    // quirks). Never fail the build for the social card: retry without
    // the logo mark.
    console.error('opengraph-image: render failed, retrying without logo', err)
    try {
      return await eagerRender(renderOgImage(seo, null))
    } catch (err2) {
      // Dynamic rendering unavailable entirely (broken sharp/libvips in
      // the prerender worker). Serve the pre-generated branded card.
      console.error('opengraph-image: dynamic render unavailable, serving static fallback', err2)
      return staticFallback()
    }
  }
}

/** Pre-generated branded card (scripts/generate-og-fallback.mjs) used
 *  when the dynamic OG pipeline can't run in this environment. */
function staticFallback(): Response {
  try {
    const buffer = readFileSync(join(process.cwd(), 'public', 'og-fallback.png'))
    return new Response(new Uint8Array(buffer), {
      headers: { 'content-type': 'image/png' },
    })
  } catch {
    // Last resort: a valid 1x1 transparent PNG.
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    )
    return new Response(new Uint8Array(pixel), {
      headers: { 'content-type': 'image/png' },
    })
  }
}

/**
 * Satori decodes images lazily when the response stream is consumed, so
 * decode errors surface outside the route handler unless we consume the
 * body here. Buffering also lets the caller retry on failure.
 */
async function eagerRender(res: ImageResponse): Promise<Response> {
  const body = await res.arrayBuffer()
  return new Response(body, { status: res.status, headers: res.headers })
}

function renderOgImage(seo: SeoConfig, logoSrc: string | null) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          padding: 80,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 500,
            height: 500,
            background: 'radial-gradient(circle at top right, rgba(22,163,74,0.25), transparent 60%)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            marginBottom: 40,
          }}
        >
          {/* next/image cannot be used inside next/og ImageResponse; img is required here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoSrc ? (
            <img
              src={logoSrc}
              alt=""
              width={64}
              height={64}
              style={{
                borderRadius: 16,
                objectFit: 'cover',
              }}
            />
          ) : null}
          <div
            style={{
              fontSize: 42,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            {seo.siteName}
          </div>
        </div>

        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.1,
            maxWidth: 900,
            letterSpacing: '-0.03em',
          }}
        >
          {seo.home.ogTitle}
        </div>

        <div
          style={{
            fontSize: 28,
            color: '#cbd5e1',
            marginTop: 32,
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          {seo.home.ogDescription}
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 80,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 22,
            color: '#94a3b8',
            fontWeight: 600,
          }}
        >
          <span style={{ color: '#16a34a' }}>●</span>
          Same-day delivery · Trade accounts · Local stock
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
