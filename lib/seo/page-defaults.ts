// lib/seo/page-defaults.ts
// Shared metadata defaults applied to every public route. Per-page
// generateMetadata can override any field, but most pages just spread
// `baseMetadata({...})` to inherit the site-wide SEO baseline — keywords,
// `lastModified`, OpenGraph defaults, robots.
//
// Why a single helper: 36 public route groups had inconsistent metadata
// — some had `keywords`, some didn't; some had `lastModified`, most
// didn't; some had `robots` settings, most didn't. Centralising the
// defaults means adding a new SEO field once propagates everywhere.

import type { Metadata } from 'next'
import { SITE_URL } from './company-seo'
import { getDefaultCompanyName } from '@/lib/demo/brand'

// Mirror the company-seo fallback so we don't need to export an extra
// constant from a heavily-edited module.
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || getDefaultCompanyName()

/**
 * Standard keyword set applied to every public page. Pages with their
 * own keyword strategy can override the `keywords` field; the rest get
 * this baseline (which still ranks for the broad site queries).
 */
const SITE_KEYWORDS = [
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
  'Slough',
  'High Wycombe',
  'Reading',
  'Guildford',
  'Basingstoke',
  'Oxford',
  'Swindon',
  'Berkshire',
  'Buckinghamshire',
  'Greater London',
  'Surrey',
  'Hampshire',
  'Oxfordshire',
]

/**
 * Truncate a string to N characters on a word boundary, appending an
 * ellipsis if needed. Used to enforce the 60-char title and 160-char
 * description caps that Google uses for SERP rendering.
 */
function truncateOnWord(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.trimEnd()}\u2026`
}

/**
 * Build the default metadata block for a public page. Caller can pass
 * any subset of `Metadata` fields; missing fields fall through to safe
 * site-wide defaults.
 *
 * The function:
 *  1. Caps the title to 60 chars (SERP-safe)
 *  2. Caps the description to 160 chars
 *  3. Adds the site-wide keyword set when the caller didn't provide one
 *  4. Adds `lastModified` (R06 freshness) when not provided
 *  5. Sets sensible `openGraph` defaults (OG image, locale, site name)
 *  6. Sets sensible `twitter` defaults (summary_large_image)
 *  7. Sets sensible `robots` (index + follow + googleBot overrides)
 *  8. Sets the canonical URL from the page path
 */
export interface BaseMetadataInput {
  /** Page title — gets truncated to 60 chars on a word boundary */
  title: string
  /** Page description — gets truncated to 160 chars */
  description: string
  /** Path under the site root, e.g. "about" → https://.../about */
  path: string
  /** Optional per-page keyword override; default is the site-wide set */
  keywords?: string[]
  /** Optional OG image override (default is the site OG image) */
  ogImage?: string
  /** Optional noindex for transactional/thin pages (cart, search results) */
  noindex?: boolean
  /** Optional OpenGraph type override (default is "website") */
  ogType?: 'website' | 'article' | 'profile'
  /** Optional article metadata */
  article?: {
    publishedTime?: string
    modifiedTime?: string
    authors?: string[]
    section?: string
    tags?: string[]
  }
  /** Optional explicit lastModified ISO string (R06 freshness signal) */
  lastModified?: string
}

/**
 * The site's default OG image. Renders well on Twitter/LinkedIn/Facebook
 * cards and is 1200×630 to satisfy all three platforms' minimum size.
 */
const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`

export function baseMetadata(input: BaseMetadataInput): Metadata {
  const title = truncateOnWord(input.title, 60)
  const description = truncateOnWord(input.description, 160)
  const canonical = `${SITE_URL}/${input.path.replace(/^\/+/, '').replace(/\/+$/, '')}`
  const ogImage = input.ogImage ?? DEFAULT_OG_IMAGE
  const keywords = input.keywords ?? SITE_KEYWORDS
  const lastModified = input.lastModified ?? new Date().toISOString()

  return {
    title: { absolute: title },
    description,
    keywords,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    // R06 freshness — visible in search snippets as "Updated 2 days ago"
    // and in the article:modified_time meta tag.
    other: {
      'article:modified_time': lastModified,
    },
    alternates: { canonical },
    openGraph: {
      type: input.ogType ?? 'website',
      locale: 'en_GB',
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${title} | ${SITE_NAME}`,
        },
      ],
      ...(input.article?.publishedTime ? { publishedTime: input.article.publishedTime } : {}),
      ...(input.article?.modifiedTime ? { modifiedTime: input.article.modifiedTime } : {}),
      ...(input.article?.authors ? { authors: input.article.authors } : {}),
      ...(input.article?.section ? { section: input.article.section } : {}),
      ...(input.article?.tags ? { tags: input.article.tags } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
    robots: input.noindex
      ? { index: false, follow: true }
      : {
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
  }
}

/**
 * Friendly format for visible "Updated" stamps in the page body. The
 * metadata uses ISO; the body uses UK long-form. Uses `Intl.DateTimeFormat`
 * so there's no runtime dependency on `date-fns`.
 */
export function friendlyDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export { SITE_KEYWORDS, truncateOnWord, DEFAULT_OG_IMAGE }
