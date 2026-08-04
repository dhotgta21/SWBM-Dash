// lib/content/types.ts
// Shared base types for content that is authored in Markdown and rendered
// through the same pipeline (case studies and advice articles).
//
// Keeping the common shape here lets UI components accept either content type
// without knowing the concrete source.

export interface BasePost {
  /** Page title and H1. */
  readonly title: string
  /** Meta description / OG description. */
  readonly description: string
  /** URL-safe identifier. */
  readonly slug: string
  /** ISO 8601 publish date, e.g. "2026-06-29". */
  readonly date: string
  /** Absolute or root-relative hero image URL. */
  readonly heroImage: string
  /** Accessible alt text for the hero image. */
  readonly heroAlt: string
  /** Short summary used on cards and in meta descriptions. */
  readonly excerpt: string
  /** Topic keywords used for filters and JSON-LD. */
  readonly tags: readonly string[]
  /** Raw Markdown body after frontmatter is stripped. */
  readonly body: string
  /** Optional short video clip (path under /public). */
  readonly video?: string
}

export interface FaqItem {
  /** Question text. Becomes the FAQPage JSON-LD question. */
  readonly q: string
  /** Plain-text answer. Becomes the FAQPage JSON-LD answer. */
  readonly a: string
}
