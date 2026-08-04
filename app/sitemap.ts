// app/sitemap.ts
// Dynamic sitemap for the public marketing site. Every URL family that can
// grow in the future is sourced from a shared loader or data file so the
// sitemap never goes out of sync with the actual routes:
//
//   - Products & categories  → Supabase (revalidated on product edits)
//   - Case studies           → content/case-studies/*.md
//   - Blog / advice articles → content/blog/*.md
//   - How-to guides          → content/guides/*.md
//   - Locations / towns      → case-study towns + delivery areas
//   - Trade services         → lib/services/data.ts
//   - Material calculators   → lib/calculators/navigation.ts
//   - Tool pages             → lib/tools/data.ts
//
// Adding a new case study, blog post, guide, service, calculator type or
// tool page automatically includes it on the next request / build without
// touching this file. Authenticated routes (/login, /dashboard, /portal,
// /invoices, /api/*) are intentionally excluded.

import type { MetadataRoute } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPublicCategories, listPublicProducts } from '@/lib/public-products'
import { resolveAbsoluteUrl } from '@/lib/seo/company-seo'
import { listCaseStudies, listLocationTowns } from '@/lib/blog/loader'
import { listArticles } from '@/lib/articles/loader'
import { listGuides } from '@/lib/guides/loader'
import { listServiceSlugs } from '@/lib/services/data'
import { listLocationSlugs } from '@/lib/locations'
import { VALID_CALCULATOR_TYPES } from '@/lib/calculators/navigation'
import { listToolSlugs } from '@/lib/tools/data'

// Cache the generated sitemap for one hour. Product mutations explicitly
// revalidate /sitemap.xml via lib/actions/products.ts, so the cache never
// stays stale for long. Editorial content (Markdown) is picked up on the
// next deployment or when the cache naturally expires.
export const revalidate = 3600

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'

const CONTENT_DIRS = {
  caseStudies: path.join(process.cwd(), 'content', 'case-studies'),
  articles: path.join(process.cwd(), 'content', 'blog'),
  guides: path.join(process.cwd(), 'content', 'guides'),
}

async function loadSettingsUpdatedAt(): Promise<Date | undefined> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('company_settings')
      .select('updated_at')
      .eq('id', 1)
      .maybeSingle()
    if (data?.updated_at) return new Date(data.updated_at)
  } catch {
    // Fall back to undefined so Next.js omits lastModified.
  }
  return undefined
}

/**
 * Read the filesystem modification time of a Markdown file in one of the
 * content directories. Falls back to the supplied date if the file can't be
 * read (e.g. during a build without the content directory).
 */
function contentFileMtime(
  dir: string,
  slug: string,
  fallback: Date | undefined,
): Date | undefined {
  try {
    const filePath = path.join(dir, `${slug}.md`)
    if (fs.existsSync(filePath)) {
      return fs.statSync(filePath).mtime
    }
  } catch {
    // Ignore and fall through.
  }
  return fallback
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settingsUpdatedAt = await loadSettingsUpdatedAt()

  // Static marketing pages. These change rarely, so they are listed here
  // explicitly. New top-level landing pages should be added to this array.
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/quote`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/catalogue`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.85 },
    { url: `${SITE_URL}/quote/calculators`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/case-studies`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/blog`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${SITE_URL}/locations`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${SITE_URL}/services`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${SITE_URL}/about`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${SITE_URL}/contact`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.75 },
    { url: `${SITE_URL}/tools`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.75 },
    { url: `${SITE_URL}/guides`, lastModified: settingsUpdatedAt, changeFrequency: 'weekly', priority: 0.72 },
    { url: `${SITE_URL}/delivery`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.72 },
    { url: `${SITE_URL}/trade-account`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.72 },
    { url: `${SITE_URL}/reviews`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${SITE_URL}/glossary`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${SITE_URL}/sustainability`, lastModified: settingsUpdatedAt, changeFrequency: 'monthly', priority: 0.65 },
    { url: `${SITE_URL}/privacy`, lastModified: settingsUpdatedAt, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: settingsUpdatedAt, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/returns`, lastModified: settingsUpdatedAt, changeFrequency: 'yearly', priority: 0.3 },
  ]

  // Material calculator type pages — sourced from the same authority that
  // validates the [type] route so the sitemap and the router never drift.
  for (const type of VALID_CALCULATOR_TYPES) {
    entries.push({
      url: `${SITE_URL}/quote/calculators/${type.toLowerCase()}`,
      lastModified: settingsUpdatedAt,
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  let categories: Awaited<ReturnType<typeof listPublicCategories>> = []
  let products: Awaited<ReturnType<typeof listPublicProducts>> = []

  try {
    ;[categories, products] = await Promise.all([
      listPublicCategories(),
      listPublicProducts(),
    ])
  } catch {
    // Fall back to just the core entries above.
  }

  for (const category of categories) {
    entries.push({
      url: `${SITE_URL}/quote/${category.slug}`,
      lastModified: settingsUpdatedAt,
      changeFrequency: 'weekly',
      priority: 0.75,
    })
  }

  for (const product of products) {
    entries.push({
      url: `${SITE_URL}/products/${encodeURIComponent(product.code)}`,
      lastModified: product.updatedAt ? new Date(product.updatedAt) : settingsUpdatedAt,
      changeFrequency: 'weekly',
      priority: 0.65,
      images: product.imageUrl ? [resolveAbsoluteUrl(SITE_URL, product.imageUrl)!] : undefined,
    })
  }

  // Location landing pages — every delivery town. listLocationSlugs() merges
  // case-study towns (richer content) with delivery-only towns (long-tail
  // SEO for "delivery {town}"). Case-study towns get a slight priority bump.
  const caseStudySlugs = new Set(listLocationTowns().map((l) => l.slug))
  for (const slug of listLocationSlugs()) {
    const isCaseStudy = caseStudySlugs.has(slug)
    entries.push({
      url: `${SITE_URL}/locations/${slug}`,
      lastModified: settingsUpdatedAt,
      changeFrequency: 'weekly',
      priority: isCaseStudy ? 0.72 : 0.6,
    })
  }

  // Tool pages — sourced from lib/tools/data.ts so a new /tools/* page is
  // automatically included without editing this file.
  for (const slug of listToolSlugs()) {
    entries.push({
      url: `${SITE_URL}/tools/${slug}`,
      lastModified: settingsUpdatedAt,
      changeFrequency: 'monthly',
      priority: 0.6,
    })
  }

  // How-to guides — read from content/guides/*.md.
  // Include the hero image for image-sitemap coverage.
  const guides = listGuides()
  for (const post of guides) {
    entries.push({
      url: `${SITE_URL}/guides/${post.slug}`,
      lastModified: contentFileMtime(CONTENT_DIRS.guides, post.slug, settingsUpdatedAt),
      changeFrequency: 'monthly',
      priority: 0.65,
      images: post.heroImage ? [resolveAbsoluteUrl(SITE_URL, post.heroImage)!] : undefined,
    })
  }

  // Trade service pages.
  for (const slug of listServiceSlugs()) {
    entries.push({
      url: `${SITE_URL}/services/${slug}`,
      lastModified: settingsUpdatedAt,
      changeFrequency: 'monthly',
      priority: 0.72,
    })
  }

  // Case studies — read from content/case-studies/*.md so adding a new
  // post automatically appears in the sitemap. Use the file's mtime as
  // lastModified so untouched posts don't ping Google. Include the hero
  // image for image-sitemap coverage.
  const caseStudies = listCaseStudies()
  for (const post of caseStudies) {
    entries.push({
      url: `${SITE_URL}/case-studies/${post.slug}`,
      lastModified: contentFileMtime(CONTENT_DIRS.caseStudies, post.slug, settingsUpdatedAt),
      changeFrequency: 'monthly',
      priority: 0.7,
      images: post.heroImage ? [resolveAbsoluteUrl(SITE_URL, post.heroImage)!] : undefined,
    })
  }

  // Advice / blog articles — read from content/blog/*.md.
  // Include the hero image for image-sitemap coverage.
  const articles = listArticles()
  for (const post of articles) {
    entries.push({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: contentFileMtime(CONTENT_DIRS.articles, post.slug, settingsUpdatedAt),
      changeFrequency: 'monthly',
      priority: 0.65,
      images: post.heroImage ? [resolveAbsoluteUrl(SITE_URL, post.heroImage)!] : undefined,
    })
  }

  return entries
}
