// lib/blog/loader.ts
// Loader for case-study Markdown files.
//
// Each post lives at content/case-studies/{slug}.md and uses
// frontmatter for SEO-critical metadata (title, description, slug,
// town, project type, date, hero image, video, FAQs, related links).
// The Markdown body is rendered by `lib/blog/render.ts` with
// auto-linking of material keywords to product pages.
//
// Why filesystem at build time?
//   - Static export: no DB hit per request, no auth required.
//   - Diff-friendly for editors / git history.
//   - Trivially extendable (drop a new .md, restart, done).
//
// This module is server-only because it uses Node `fs` and reads
// from the project root at build/render time.

import 'server-only'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

export type ProjectType =
  | 'extension'
  | 'loft-conversion'
  | 'self-build'
  | 'new-build'
  | 'garden-office'
  | 'commercial'
  | 'renovation'
  | 'outbuilding'
  | 'refurbishment'
  | 'reroof'
  | 'garage-conversion'
  | 'barn-conversion'
  | 'driveway'

export interface CaseStudyFaq {
  /** Question text. Becomes the FAQPage JSON-LD question. */
  readonly q: string
  /** Plain-text answer. Becomes the FAQPage JSON-LD answer. */
  readonly a: string
}

export interface CaseStudyMaterial {
  /** Display name, e.g. "Portland Cement 25kg". */
  readonly name: string
  /** Product URL (preferred) or category URL. */
  readonly href: string
  /** Quantity supplied, e.g. "60 bags" or "12 tonnes". */
  readonly quantity: string
}

export interface CaseStudyFrontmatter {
  readonly title: string
  readonly description: string
  readonly slug: string
  /** Canonical town name, e.g. "Slough". */
  readonly town: string
  /** Slug for the town, used in URL paths and tags. */
  readonly townSlug: string
  /** UK county, e.g. "Berkshire". */
  readonly county: string
  /** UK postcode district(s), e.g. ["SL1", "SL2"]. */
  readonly postcodes: readonly string[]
  /** Type of project — drives the related-posts logic and JSON-LD. */
  readonly projectType: ProjectType
  /** Human-readable project type label, e.g. "Two-storey rear extension". */
  readonly projectLabel: string
  /** Fictional client / company name (per user instruction). */
  readonly client: string
  /** ISO date string, e.g. "2026-05-14". */
  readonly date: string
  /** Approximate build duration, e.g. "14 weeks". */
  readonly duration: string
  /** Path to the hero image (e.g. "/case-studies/slough-hero.webp"). */
  readonly heroImage: string
  /** Alt text for the hero image. Include town + project type. */
  readonly heroAlt: string
  /** Optional short video clip (path under /public). */
  readonly video?: string
  /** Auto-generated video prompt used to create the clip. */
  readonly videoPrompt?: string
  /** Short summary used on index cards and meta description. */
  readonly excerpt: string
  /** Material list rendered as a structured bullet block in the post. */
  readonly materials: readonly CaseStudyMaterial[]
  /** FAQ items rendered as accordion + FAQPage JSON-LD. */
  readonly faqs: readonly CaseStudyFaq[]
  /** Slugs of related case studies (other towns). */
  readonly related: readonly string[]
  /** Tags for index-page filters. */
  readonly tags: readonly string[]
}

export interface CaseStudyPost extends CaseStudyFrontmatter {
  /** Raw Markdown body, with frontmatter stripped. */
  readonly body: string
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'case-studies')

let cachedPosts: CaseStudyPost[] | undefined

function readAll(): CaseStudyPost[] {
  if (cachedPosts) return cachedPosts
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))

  const posts: CaseStudyPost[] = files.map((file) => {
    const full = path.join(CONTENT_DIR, file)
    const raw = fs.readFileSync(full, 'utf-8')
    const { data, content } = matter(raw)
    const fm = data as Partial<CaseStudyFrontmatter>

    // Defensive parsing — fail loudly so missing frontmatter doesn't
    // silently render a broken page.
    const required: (keyof CaseStudyFrontmatter)[] = [
      'title',
      'description',
      'slug',
      'town',
      'townSlug',
      'county',
      'postcodes',
      'projectType',
      'projectLabel',
      'client',
      'date',
      'duration',
      'heroImage',
      'heroAlt',
      'excerpt',
      'materials',
      'faqs',
      'related',
      'tags',
    ]
    for (const k of required) {
      if (fm[k] === undefined || fm[k] === null) {
        throw new Error(`[blog] ${file}: missing frontmatter field "${k}"`)
      }
    }

    return {
      ...(fm as CaseStudyFrontmatter),
      body: content,
    }
  })

  // Newest first.
  posts.sort((a, b) => (a.date < b.date ? 1 : -1))
  cachedPosts = posts
  return posts
}

/** All posts, newest first. */
export function listCaseStudies(): CaseStudyPost[] {
  return readAll()
}

/** Lookup a single post by slug. */
export function getCaseStudy(slug: string): CaseStudyPost | undefined {
  return readAll().find((p) => p.slug === slug)
}

/** Slugs for `generateStaticParams`. */
export function listCaseStudySlugs(): string[] {
  return readAll().map((p) => p.slug)
}

/** Distinct values for a field, used to render index filters. */
export function listCaseStudyFacets<K extends keyof CaseStudyFrontmatter>(
  field: K,
): Array<CaseStudyFrontmatter[K]> {
  const seen = new Set<CaseStudyFrontmatter[K]>()
  for (const p of readAll()) seen.add(p[field])
  return Array.from(seen)
}

/** Distinct towns with their slugs and counties, for location landing pages. */
export interface LocationTown {
  readonly town: string
  readonly slug: string
  readonly county: string
  readonly postCount: number
}

export function listLocationTowns(): LocationTown[] {
  const map = new Map<string, LocationTown>()
  for (const p of readAll()) {
    const existing = map.get(p.townSlug)
    if (existing) {
      map.set(p.townSlug, { ...existing, postCount: existing.postCount + 1 })
    } else {
      map.set(p.townSlug, { town: p.town, slug: p.townSlug, county: p.county, postCount: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.town.localeCompare(b.town))
}

/** All posts for a given town slug. */
export function getCaseStudiesByTown(townSlug: string): CaseStudyPost[] {
  return readAll().filter((p) => p.townSlug === townSlug)
}

/** Look up a location by its URL slug. */
export function getLocationTown(townSlug: string): LocationTown | undefined {
  return listLocationTowns().find((l) => l.slug === townSlug)
}