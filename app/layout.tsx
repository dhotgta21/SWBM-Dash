import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from './providers'
import { GlobalJsonLd } from '@/components/seo/GlobalJsonLd'
import { AppearanceStyles } from '@/components/server/AppearanceStyles'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Public site URL — used for canonical URLs, OG tags and the sitemap.
// Override via NEXT_PUBLIC_SITE_URL when deploying to a real domain.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'

const SITE_NAME = 'Star Hawk Builders Merchant'

// Optimised home-page metadata. These defaults are kept in sync with
// lib/seo/company-seo.ts so the root layout and the home page emit the
// same title/description/keywords even when the DB is unreachable.

// Search-engine verification codes. Add NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
// and/or NEXT_PUBLIC_BING_SITE_VERIFICATION to your environment to emit the
// corresponding <meta name="google-site-verification"> or
// <meta name="msvalidate.01"> tags automatically.
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION

// Google Analytics 4 measurement ID. Only emitted when the env value is set.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID

// Short label used in the browser tab and in the default/template titles
// for sub-pages. Keep this in sync with the favicon (Logo.png) so the
// tab looks consistent at a glance.
const TAB_TITLE = 'Star Hawk Builders Merchant'

// Tagline used in OG/Twitter cards and as the suffix on sub-page titles.
// Kept under 60 chars so Google doesn't truncate/rewrite the SERP title.
const TAGLINE = 'Building Materials & Timber'

// Site-wide SEO defaults. Per-page metadata in app/page.tsx overrides
// these for the home page. Other public routes (e.g. /quote) can layer
// on top with their own `export const metadata`.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TAB_TITLE,
    template: `%s | ${TAB_TITLE}`,
  },
  description:
    'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.',
  applicationName: SITE_NAME,
  keywords: [
    'builders merchant',
    'builders merchants near me',
    'building materials',
    'building supplies',
    'aggregates',
    'cement',
    'bricks',
    'blocks',
    'timber',
    'plasterboard',
    'insulation',
    'roofing supplies',
    'drainage',
    'fixings',
    'tools',
    'trade counter',
    'trade account',
    'same day delivery',
    'building merchants London',
    'building supplies Slough',
    'aggregates delivery',
    'bulk aggregates',
    'sharp sand',
    'ballast',
    'type 1 sub-base',
    'concrete blocks',
    'carcassing timber',
    'plywood',
    'OSB board',
    'MDF',
    'plaster',
    'render',
    'steel reinforcement',
    'DPC membrane',
    'landscaping supplies',
    'Slough',
    'High Wycombe',
    'Hayes',
    'Uxbridge',
    'Southall',
    'Reading',
    'Bracknell',
    'Wembley',
    'Harrow',
    'Enfield',
    'Croydon',
    'Hounslow',
    'Kingston upon Thames',
    'Epsom',
    'Newbury',
    'Guildford',
    'Woking',
    'Basingstoke',
    'Oxford',
    'Swindon',
    'Berkshire',
    'Buckinghamshire',
    'Greater London',
    'Surrey',
    'Hampshire',
    'Oxfordshire',
    'Wiltshire',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: 'Building materials supplier',
  openGraph: {
    type: 'website',
    locale: 'en_GB',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} | ${TAGLINE}`,
    description:
      'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} | ${TAGLINE}`,
    description:
      'Building materials, aggregates, bricks, timber, blocks & more from Star Hawk Builders Merchant. Same-day delivery across Greater London & the Home Counties.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    // Keep the .ico first — Google SERP favicon and most crawlers prefer
    // the legacy ICO at the domain root. Browsers that support WebP will
    // pick the smaller .webp entries from the list; the .png fallbacks
    // cover older browsers and crawlers that don't (Safari < 14 on
    // certain Android OEMs, some social-card crawlers).
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-48x48.png', type: 'image/png', sizes: '48x48' },
      { url: '/icon-48x48.webp', type: 'image/webp', sizes: '48x48' },
      { url: '/icon-192x192.webp', type: 'image/webp', sizes: '192x192' },
      { url: '/icon-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512x512.webp', type: 'image/webp', sizes: '512x512' },
      { url: '/icon-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
  verification: {
    ...(GOOGLE_SITE_VERIFICATION && { google: GOOGLE_SITE_VERIFICATION }),
    ...(BING_SITE_VERIFICATION && { other: { 'msvalidate.01': BING_SITE_VERIFICATION } }),
  },
}

// Mobile viewport: render at the device's actual width (instead of the
// legacy 980px default), starting at 1:1 zoom. The Next.js App Router
// only emits the <meta name="viewport"> tag when this export is present.
// Without it, mobile browsers fall back to a 980px layout viewport and
// shrink the page to fit, which makes fixed-width content (like the
// 794px invoice document on the public share view) look "zoomed in".
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Preconnect to the Supabase Storage origin so uploaded logos and assets
  // start their TLS handshake early. Only emits the tag when the env is set.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabasePreconnect = supabaseUrl
    ? (() => {
        try {
          return new URL(supabaseUrl).origin
        } catch {
          return null
        }
      })()
    : null

  // Read the per-request CSP nonce injected by proxy.ts and forward it
  // to the GoogleAnalytics component. Without this, both the inline
  // `gtag('config', ...)` init snippet and the external
  // https://www.googletagmanager.com/gtag/js script are blocked by
  // the strict-dynamic script-src policy.
  // See node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {supabasePreconnect && <link rel="preconnect" href={supabasePreconnect} crossOrigin="anonymous" />}
      </head>
      <body className="min-h-full flex flex-col bg-background" suppressHydrationWarning>
        <AppearanceStyles />
        <Providers>
          <GlobalJsonLd />
          {children}
        </Providers>
      </body>
      {GA_ID && <GoogleAnalytics gaId={GA_ID} nonce={nonce} />}
    </html>
  )
}
