import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Brand assets with custom variants in Storage are served through
// app/api/brand-assets/[name] (bucket first, shipped public/ default as
// fallback). Keep in sync with BRAND_FILES in lib/logo-processor.ts.
const BRAND_ASSET_PATHS = new Set([
  '/Logo.png',
  '/Logo.webp',
  '/logo-square.png',
  '/logo-square.webp',
  '/logo-email.png',
  '/logo-mono-dark.png',
  '/logo-mono-light.png',
  '/icon-16x16.png',
  '/icon-16x16.webp',
  '/icon-32x32.png',
  '/icon-32x32.webp',
  '/icon-48x48.png',
  '/icon-48x48.webp',
  '/icon-192x192.png',
  '/icon-192x192.webp',
  '/icon-512x512.png',
  '/icon-512x512.webp',
  '/apple-touch-icon.png',
  '/favicon.ico',
])

// Generate a per-request CSP nonce. The framework will auto-attach it
// to its own <script> / <style> tags and to any <Script nonce={...}>
// components. See node_modules/next/dist/docs/01-app/02-guides/
// content-security-policy.md.
function generateNonce(): string {
  // base64 of a UUIDv4 — 24 chars, URL-safe, well under any sensible
  // CSP header size limit.
  return Buffer.from(crypto.randomUUID()).toString('base64')
}

function getSupabaseImageHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return null
  try {
    return `https://${new URL(url).hostname}`
  } catch {
    return null
  }
}

function buildCsp(nonce: string): string {
  // The policies below match the previous header set in next.config.ts,
  // with the broad `'unsafe-inline'` for scripts replaced by per-request
  // nonces. `'unsafe-eval'` is only added in development mode because React
  // uses eval() for debugging features; it is omitted in production because
  // React does not use eval() in production builds. Invoice PDFs are already
  // rendered server-side via /api/invoices/pdf, so they do not need it.
  //
  // Notes on individual directives:
  //   - script-src 'self' 'nonce-...' 'strict-dynamic' —
  //     strict-dynamic trusts scripts loaded by a nonced script, so
  //     dynamic chunks keep working without per-chunk nonces.
  //   - style-src 'self' 'unsafe-inline' — Tailwind 4, Recharts,
  //     next/image (fill mode), and several components use runtime
  //     inline style attributes we don't want to (and can't easily)
  //     nonce by hand. Per the CSP spec, 'unsafe-inline' is IGNORED
  //     when a nonce or hash is also present in the source list, so
  //     we deliberately do NOT include the nonce here. If you want a
  //     stricter style policy later, the path is: drop 'unsafe-inline',
  //     add the nonce, and propagate `nonce={nonce}` from a server
  //     component down through every inline-style site.
  //   - frame-ancestors 'none' — replaces the separate X-Frame-Options
  //     header (CSP supersedes it on modern browsers, but we still
  //     send X-Frame-Options DENY for old IE-style compatibility).
  //   - object-src 'none' — kills <object>/<embed>, a common XSS sink.
  //   - upgrade-insecure-requests — auto-upgrades http:// subresource
  //     URLs to https. Safe to enable on a Next.js app served over
  //     HTTPS.
  // React uses eval() in development mode for debug features (e.g.
  // reconstructing callstacks from a different environment), so we must
  // keep 'unsafe-eval' in script-src while running locally. It is omitted
  // in production because React does not use eval() in production builds.

  // Mirror the GA_ID check in app/layout.tsx so the CSP only widens to
  // Google's origins when GoogleAnalytics is actually being rendered.
  const gaEnabled = Boolean(process.env.NEXT_PUBLIC_GA_ID)

  // Cloudflare Turnstile needs to load its script from challenges.cloudflare.com.
  // It is listed explicitly because strict-dynamic only covers scripts loaded by
  // a nonced script, not third-party widgets that inject themselves.
  const turnstileOrigin = ' https://challenges.cloudflare.com'

  const scriptSrc =
    process.env.NODE_ENV === 'development'
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'wasm-unsafe-eval'${turnstileOrigin}`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${turnstileOrigin}`

  // Google Analytics origins. The <GoogleAnalytics /> component is
  // passed the per-request CSP nonce, so under 'strict-dynamic' any
  // script it dynamically injects is trusted automatically — but the
  // initial gtag.js load and the analytics ping endpoints still need
  // direct allowances in connect-src / img-src.
  const gaOrigins = gaEnabled
    ? ' https://www.googletagmanager.com https://www.google-analytics.com'
    : ''

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${getSupabaseImageHost() ? ` ${getSupabaseImageHost()}` : ''}${gaEnabled ? ' https://www.google-analytics.com https://www.googletagmanager.com' : ''}`,
    "font-src 'self'",
    // SECURITY: removed `data:` from connect-src — it's a known
    // exfiltration vector for browser XSS bugs and the app doesn't
    // legitimately fetch data: URIs. If a future feature needs them,
    // restrict to a specific origin/path instead of re-allowing
    // globally.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co${turnstileOrigin}${gaOrigins}`,
    "worker-src 'self' blob:",
    // ContactSection.tsx embeds a Google Maps iframe showing the yard
    // location. Allow only the specific Google Maps embed origins; do
    // not widen this to arbitrary third-party iframes.
    "frame-src 'self' blob: https://maps.google.com https://www.google.com https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ]
  return directives.join('; ')
}

export default async function proxy(request: NextRequest) {
  // Brand assets short-circuit: rewrite to the storage-backed route before
  // any session work — image requests don't need a Supabase round-trip.
  if (BRAND_ASSET_PATHS.has(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = `/api/brand-assets${request.nextUrl.pathname}`
    return NextResponse.rewrite(url)
  }

  const nonce = generateNonce()
  const csp = buildCsp(nonce)

  // Stamp the nonce on the inbound request so server components can
  // read it via `headers().get('x-nonce')` if they need it (e.g. for
  // a <Script nonce={...}>). The framework picks it up automatically
  // for its own runtime, so most code never needs to read it.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  // Let the Supabase session-refresh run. Pass a fresh NextRequest that
  // carries the nonce, so cookies it sets on the response don't
  // collide with the modified request.
  const response = await updateSession(
    new NextRequest(request, { headers: requestHeaders })
  )

  // Attach CSP and the legacy X-Frame-Options for old browsers.
  // (Modern browsers honour frame-ancestors; old ones need
  // X-Frame-Options.)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(self), geolocation=()'
  )

  // Intentionally do not preload hero-1-4kgen.webp here: auth pages and
  // many routes never use that asset, which produced browser console
  // warnings ("preloaded but not used"). The Hero component loads its
  // own images with priority when needed.

  // Only set HSTS when the request came in over HTTPS. In local HTTP
  // development this header is skipped so browsers don't get pinned to
  // HTTPS against a dev server that doesn't support it.
  //
  // We deliberately only read `x-forwarded-proto` (the standard header).
  // An older `x-forwarded-protocol` (non-standard, occasionally set by
  // misconfigured proxies) is ignored — if it disagrees with the
  // standard header the standard wins, and the non-standard header has
  // no well-defined parsing rules anyway.
  const proto = requestHeaders.get('x-forwarded-proto')
  const isHttps = proto === 'https' || request.nextUrl.protocol === 'https:'
  if (isHttps) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    )
  }

  return response
}

export const config = {
  matcher: [
    // Run on every page and API request. Static assets and Next.js
    // internal paths are excluded — including `_next/data`, the JSON
    // prefetch endpoint, which fires on every client navigation. Without
    // this exclusion every router.push triggers a session-refresh round
    // trip to Supabase. API routes still perform their own auth; this
    // middleware only adds security headers to them.
    //
    // Also excludes the cheap-but-frequent paths (robots, sitemap, RSS,
    // manifests, favicons, OpenGraph image) so we don't run a CSP nonce
    // generation + session-refresh roundtrip for files that don't render
    // or that don't render any inline JS.
    '/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap.*|llms\\.txt|manifest\\.json|opengraph-image|icon-[0-9]+\\.png|apple-touch-icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    // Brand assets are matched explicitly so the proxy can rewrite them to
    // the storage-backed route (they are excluded by the catch-all above).
    '/Logo.png',
    '/Logo.webp',
    '/logo-square.png',
    '/logo-square.webp',
    '/logo-email.png',
    '/logo-mono-dark.png',
    '/logo-mono-light.png',
    '/icon-16x16.png',
    '/icon-16x16.webp',
    '/icon-32x32.png',
    '/icon-32x32.webp',
    '/icon-48x48.png',
    '/icon-48x48.webp',
    '/icon-192x192.png',
    '/icon-192x192.webp',
    '/icon-512x512.png',
    '/icon-512x512.webp',
    '/apple-touch-icon.png',
    '/favicon.ico',
  ],
}
