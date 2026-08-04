import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import withBundleAnalyzer from '@next/bundle-analyzer'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

// Security headers (CSP, X-Frame-Options, etc.) are set per-request by
// proxy.ts so each response can carry a fresh, per-request nonce. The
// proxy-based approach is the Next.js 16+ recommended pattern and is
// required for nonce-based CSP to work. See
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.

// ADMIN_LOGIN_PATH is resolved from env in lib/auth/login-paths.ts so that
// next.config.ts and robots.ts always share the same value.

// Allow the Next.js Image component to optimize logos served from Supabase Storage.
// Build a list of legacy /blog URLs that must 301 to /case-studies.
// These are generated at build time from the filesystem so new case studies
// are redirected automatically without editing this file.
function buildLegacyRedirects() {
  const redirects: { source: string; destination: string; permanent: boolean }[] = []

  // Case-study posts.
  const caseStudiesDir = path.join(process.cwd(), 'content', 'case-studies')
  if (fs.existsSync(caseStudiesDir)) {
    const files = fs.readdirSync(caseStudiesDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    for (const file of files) {
      const slug = file.replace(/\.(md|mdx)$/, '')
      redirects.push({
        source: `/blog/${slug}`,
        destination: `/case-studies/${slug}`,
        permanent: true,
      })
    }
  }

  // Hero images that moved from /public/blog to /public/case-studies.
  const oldImagesDir = path.join(process.cwd(), 'public', 'case-studies')
  if (fs.existsSync(oldImagesDir)) {
    const images = fs.readdirSync(oldImagesDir).filter((f) => /\.(png|jpg|jpeg|webp|gif)$/i.test(f))
    for (const image of images) {
      redirects.push({
        source: `/blog/${image}`,
        destination: `/case-studies/${image}`,
        permanent: true,
      })
    }
  }

  return redirects
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseHostname = supabaseUrl
  ? (() => {
      try {
        return new URL(supabaseUrl).hostname
      } catch {
        return undefined
      }
    })()
  : undefined

const nextConfig: NextConfig = {
  // Use a non-default output directory on Windows so the OS does not keep
  // the previous build's .html files locked while the next build tries to
  // overwrite them. Vercel (Linux) expects the default `.next` directory,
  // so we only switch the distDir for local Windows development.
  distDir: process.platform === 'win32' ? '.next-build' : '.next',
  // Blog, case-study and guide pages are force-dynamic and read their
  // markdown from content/ at request time. fs reads are invisible to
  // output-file tracing, so without this the serverless bundle ships
  // without the markdown and every article 404s in production.
  // Keys are matched with picomatch (contains:true) against app routes
  // like /blog/[slug]. Include content for every content surface + sitemap.
  outputFileTracingIncludes: {
    '/**': ['./content/**/*'],
    '/guides': ['./content/**/*'],
    '/guides/[slug]': ['./content/**/*'],
    '/blog': ['./content/**/*'],
    '/blog/[slug]': ['./content/**/*'],
    '/case-studies': ['./content/**/*'],
    '/case-studies/[slug]': ['./content/**/*'],
    '/sitemap.xml': ['./content/**/*'],
    '/*': ['./content/**/*'],
  },
  // Keep jsdom out of the App Router server graph if anything still pulls it;
  // detail pages no longer import isomorphic-dompurify (see lib/blog/render.ts).
  serverExternalPackages: ['jsdom', 'isomorphic-dompurify'],
  images: {
    // Keep unoptimized only when deploying to non-Node/Vercel targets.
    // Vercel supports the Next.js Image Optimization API, so this can be removed.
    unoptimized: process.env.IMAGES_UNOPTIMIZED === 'true',
    qualities: [75, 90],
    remotePatterns: supabaseHostname
      ? [{ protocol: 'https', hostname: supabaseHostname }]
      : [],
  },

  async redirects() {
    return [
      // The public quote/catalogue flow used to live under /shop.
      // Permanent 301s keep bookmarks, search results and external
      // links pointing at the new /quote URLs.
      { source: '/shop', destination: '/quote', permanent: true },
      // Direct redirect from the original /shop/product/:code URL to the
      // current /products/:code URL. Skipping the /quote/product hop avoids
      // a 3-hop chain (http→https + /shop→/quote + /quote/product→/products)
      // that Google would refuse to validate. Listed BEFORE the catch-all
      // /shop/:path* → /quote/:path* rule so the more-specific match wins.
      { source: '/shop/product/:code', destination: '/products/:code', permanent: true },
      { source: '/shop/:path*', destination: '/quote/:path*', permanent: true },
      { source: '/quote/catalog', destination: '/catalogue', permanent: true },
      // Product detail pages moved from /quote/product to /products.
      // Permanent 301s preserve SEO value from indexed /quote/product URLs.
      { source: '/quote/product/:code', destination: '/products/:code', permanent: true },
      // Admin product management moved from /products to /admin/products so
      // the /products namespace is reserved for public catalogue URLs.
      // 301s keep staff bookmarks and old navigation working.
      { source: '/products/new', destination: '/admin/products/new', permanent: true },
      { source: '/products/seo', destination: '/admin/products/seo', permanent: true },
      { source: '/products/:id/edit', destination: '/admin/products/:id/edit', permanent: true },
      // Delivery checker used to live in the Tools section. It isn't a
      // calculator — it's a serviceability check that belongs on the
      // quote page so customers see "do you deliver to me?" before they
      // invest time building a quote list.
      { source: '/tools/delivery-checker', destination: '/quote', permanent: true },
      // Case studies moved from /blog to /case-studies. Explicit per-slug
      // redirects avoid intercepting new advice posts at /blog/{slug}.
      ...buildLegacyRedirects(),
    ]
  },

  async rewrites() {
    return [
      // Hide the operator login behind a configurable URL so it does
      // not appear at the default /login path. The browser keeps the
      // configured path in the address bar while Next.js internally
      // renders /admin-login (a plain-ASCII folder name — Next.js
      // reserves @folder names for parallel route slots, so we don't
      // use a folder literally matching the public-facing path).
      { source: ADMIN_LOGIN_PATH, destination: '/admin-login' },
    ]
  },

  // Long-cache control headers for hashed/static assets. The hashed
  // asset paths (`/_next/static/...`) carry a content hash in the
  // filename so they're safe to mark as immutable for a year. Plain
  // images/icons under `/` get a shorter cache with revalidation so
  // edits land without redeploying code.
  //
  // Next.js's header matching is path-to-regexp-based, not a JS regex —
  // negative-lookahead-style sources like `/((?!api).*)` are NOT
  // supported. We list each rule as a concrete path pattern.
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/_next/static/chunks/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Hashed Next.js image-optimisation output (served via the
        // `/_next/image?url=...` route). Content-addressed by query
        // string on Vercel, so a year of immutable caching is safe.
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Public brand assets (logo, icons, hero webp). Filenames can
        // change across releases without a code change, so use a
        // shorter cache with stale-while-revalidate.
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/icon-48x48.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        // WebP variant — browsers that negotiate it skip the PNG.
        source: '/icon-48x48.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/icon-192x192.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/icon-192x192.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/icon-512x512.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/icon-512x512.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/apple-touch-icon.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
        ],
      },
      {
        // Hero WEBPs on the home page + sub-page heroes. Filenames are
        // versioned (hero-1-4kgen.webp, etc.), so a 1-year immutable cache
        // is safe and removes the PageSpeed cache-lifetime warning.
        source: '/hero-:slide.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Homepage hero video files — versioned by filename, long-cache safe.
        source: '/hero-loop.:ext',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default withAnalyzer(nextConfig)
