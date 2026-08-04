// lib/articles/loader.ts
// Loader for advice / blog Markdown files.
//
// Each post lives at content/blog/{slug}.md and uses frontmatter for SEO
// metadata (title, description, slug, date, hero image, category, author,
// FAQs, related links). The Markdown body is rendered by `lib/blog/render.ts`
// with auto-linking of material keywords to product pages.
//
// This module is server-only because it uses Node `fs` and reads from the
// project root at build/render time.

import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import type { BasePost, FaqItem } from '@/lib/content/types'

export interface BlogArticleFrontmatter {
  readonly title: string
  readonly description: string
  readonly slug: string
  /** ISO date string, e.g. "2026-06-29". */
  readonly date: string
  /** Path to the hero image (e.g. "/blog/first-time-homeowner-hero.webp"). */
  readonly heroImage: string
  /** Alt text for the hero image. */
  readonly heroAlt: string
  /** Short summary used on index cards and meta description. */
  readonly excerpt: string
  /** Editorial category, e.g. "First-time buyers". */
  readonly category: string
  /** Author name. Defaults to "Star Hawk Builders Merchant" if omitted. */
  readonly author?: string
  /** FAQ items rendered as accordion + FAQPage JSON-LD. */
  readonly faqs: readonly FaqItem[]
  /** Slugs of related advice articles. */
  readonly related: readonly string[]
  /** Tags for index-page filters. */
  readonly tags: readonly string[]
}

export interface BlogArticle extends Omit<BlogArticleFrontmatter, 'author'>, BasePost {
  readonly author: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog')

let cachedPosts: BlogArticle[] | undefined

function readAll(): BlogArticle[] {
  if (cachedPosts) return cachedPosts
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))

  const posts: BlogArticle[] = files.map((file) => {
    const full = path.join(CONTENT_DIR, file)
    const raw = fs.readFileSync(full, 'utf-8')
    const { data, content } = matter(raw)
    const fm = data as Partial<BlogArticleFrontmatter>

    const required: (keyof BlogArticleFrontmatter)[] = [
      'title',
      'description',
      'slug',
      'date',
      'heroImage',
      'heroAlt',
      'excerpt',
      'category',
      'faqs',
      'related',
      'tags',
    ]
    for (const k of required) {
      if (fm[k] === undefined || fm[k] === null) {
        throw new Error(`[articles] ${file}: missing frontmatter field "${k}"`)
      }
    }

    return {
      ...(fm as BlogArticleFrontmatter),
      author: fm.author?.trim() || 'Star Hawk Builders Merchant',
      body: content,
    }
  })

  // Newest first.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1))
  cachedPosts = posts
  return posts
}

/** All advice articles, newest first. */
export function listArticles(): BlogArticle[] {
  return readAll()
}

/** Look up a single advice article by slug. */
export function getArticle(slug: string): BlogArticle | undefined {
  return readAll().find((p) => p.slug === slug)
}

/** Slugs for `generateStaticParams`. */
export function listArticleSlugs(): string[] {
  return readAll().map((p) => p.slug)
}

/** Distinct editorial categories. */
export function listCategories(): string[] {
  const seen = new Set<string>()
  for (const p of readAll()) seen.add(p.category)
  return Array.from(seen).sort()
}

/** Look up related articles by slug. */
export function getRelatedArticles(slugs: readonly string[]): BlogArticle[] {
  const all = readAll()
  const map = new Map(all.map((p) => [p.slug, p]))
  return slugs.map((s) => map.get(s)).filter((p): p is BlogArticle => p !== undefined)
}
