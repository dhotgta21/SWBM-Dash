// lib/guides/loader.ts
// Loader for how-to guide Markdown files.
//
// Each guide lives at content/guides/{slug}.md and uses frontmatter
// for SEO-critical metadata (title, description, slug, category,
// date, hero image, FAQs, related links, tags). The Markdown body
// is rendered through the same `lib/blog/render.ts` pipeline used by
// case studies and advice articles — including material auto-linking
// to product pages and town auto-linking to relevant case studies.
//
// Guides are intentionally scoped to step-by-step, evergreen how-to
// content (block walls, laying patios, etc.). Project-tailored write-
// ups and customer-facing case studies live in the case-studies
// content folder; opinionated, time-sensitive advice lives in blog.
//
// This module is server-only because it uses Node `fs` and reads
// from the project root at build/render time.

import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { BasePost, FaqItem } from '@/lib/content/types'

export interface GuideFrontmatter {
  readonly title: string
  readonly description: string
  readonly slug: string
  /** ISO date string, e.g. "2026-07-04". */
  readonly date: string
  /** Path to the hero image, e.g. "/guides/building-a-block-wall-hero.webp". */
  readonly heroImage: string
  /** Alt text for the hero image. */
  readonly heroAlt: string
  /** Short summary used on the hub cards and meta description. */
  readonly excerpt: string
  /** Editorial category, e.g. "Masonry" or "Landscaping". */
  readonly category: string
  /** Approximate working time, e.g. "1–2 days for a 3m run". */
  readonly duration: string
  /** Difficulty band: "beginner" | "intermediate" | "advanced". */
  readonly difficulty: 'beginner' | 'intermediate' | 'advanced'
  /** Trade price for the average project, e.g. "from £30 per m²". */
  readonly cost: string
  /** Author / brand. Defaults to "Star Hawk Builders Merchant". */
  readonly author?: string
  /** FAQ items rendered as accordion + FAQPage JSON-LD. */
  readonly faqs: readonly FaqItem[]
  /** Slugs of related guides. */
  readonly related: readonly string[]
  /** Tags for cross-linking, filters and JSON-LD. */
  readonly tags: readonly string[]
}

export interface GuidePost extends GuideFrontmatter, BasePost {
  readonly author: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'guides')

let cachedPosts: GuidePost[] | undefined

function readAll(): GuidePost[] {
  if (cachedPosts) return cachedPosts
  if (!fs.existsSync(CONTENT_DIR)) return []

  try {
    const files = fs
      .readdirSync(CONTENT_DIR)
      .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))

    const posts: GuidePost[] = []
    for (const file of files) {
      try {
        const full = path.join(CONTENT_DIR, file)
        const raw = fs.readFileSync(full, 'utf-8')
        const { data, content } = matter(raw)
        const fm = data as Partial<GuideFrontmatter>

        const required: (keyof GuideFrontmatter)[] = [
          'title',
          'description',
          'slug',
          'date',
          'heroImage',
          'heroAlt',
          'excerpt',
          'category',
          'duration',
          'difficulty',
          'cost',
          'faqs',
          'related',
          'tags',
        ]
        let valid = true
        for (const k of required) {
          if (fm[k] === undefined || fm[k] === null) {
            console.error(`[guides] ${file}: missing frontmatter field "${k}"`)
            valid = false
            break
          }
        }
        if (!valid) continue
        // Arrays must be real arrays so detail-page .map / .join never throw.
        if (!Array.isArray(fm.faqs) || !Array.isArray(fm.related) || !Array.isArray(fm.tags)) {
          console.error(`[guides] ${file}: faqs/related/tags must be arrays`)
          continue
        }

        posts.push({
          ...(fm as GuideFrontmatter),
          author: fm.author?.trim() || 'Star Hawk Builders Merchant',
          body: content,
        })
      } catch (err) {
        console.error(`[guides] skipped ${file}:`, err)
      }
    }

    // Newest first — keeps the hub recent at the top.
    posts.sort((a, b) => (a.date < b.date ? 1 : -1))
    cachedPosts = posts
    return posts
  } catch (err) {
    console.error('[guides] readAll failed:', err)
    cachedPosts = []
    return []
  }
}

/** All guides, newest first. */
export function listGuides(): GuidePost[] {
  return readAll()
}

/** Look up a single guide by slug. */
export function getGuide(slug: string): GuidePost | undefined {
  return readAll().find((p) => p.slug === slug)
}

/** Slugs for `generateStaticParams`. */
export function listGuideSlugs(): string[] {
  return readAll().map((p) => p.slug)
}

/** Distinct editorial categories. */
export function listGuideCategories(): string[] {
  const seen = new Set<string>()
  for (const p of readAll()) seen.add(p.category)
  return Array.from(seen).sort()
}

/** Look up related guides by slug. */
export function getRelatedGuides(slugs: readonly string[]): GuidePost[] {
  const all = readAll()
  const map = new Map(all.map((p) => [p.slug, p]))
  return slugs.map((s) => map.get(s)).filter((p): p is GuidePost => p !== undefined)
}

/** Tiny hub-card projection — keeps the import surface tight. */
export interface GuideHubCard {
  readonly slug: string
  readonly title: string
  readonly description: string
  readonly excerpt: string
  readonly category: string
  readonly duration: string
  readonly difficulty: GuidePost['difficulty']
  readonly heroImage: string
  readonly heroAlt: string
  readonly date: string
}

export function listGuideHubCards(): GuideHubCard[] {
  return readAll().map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    excerpt: p.excerpt,
    category: p.category,
    duration: p.duration,
    difficulty: p.difficulty,
    heroImage: p.heroImage,
    heroAlt: p.heroAlt,
    date: p.date,
  }))
}
