// lib/guides/schema.ts
// JSON-LD generators for how-to guide pages.
//
// We emit two structured-data blocks per guide:
//   - HowTo            — the step-by-step procedure, derived from the
//                        guide's H2/H3 headings + paragraphs (treated
//                        as ordered steps).
//   - BlogPosting      — for rich-result eligibility with the same
//                        shape articles and case studies use.
//   - FAQPage          — same as the other content types.
//   - BreadcrumbList   — Home › Guides › {Slug}.
//
// References:
//   - https://schema.org/HowTo
//   - https://schema.org/BlogPosting

import 'server-only'
import type { GuidePost } from './loader'
import { SITE_URL } from '@/lib/seo/company-seo'

async function loadCompany() {
  // Pulled from the existing blog schema helper so we stay consistent
  // with the name/URL/logo the other content types use.
  const mod = await import('@/lib/blog/schema')
  return mod.loadCompanyForBlog()
}

/**
 * HowTo JSON-LD. Emits one `HowToStep` per H2 in the body — each H2
 * becomes a named step and its following paragraphs become the step
 * text. Keeps the markup minimal but enough for Google rich results.
 */
export function howToJsonLd(post: GuidePost, body: { h2: string[]; sections: Array<{ heading: string; paragraphs: string[] }> }): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${SITE_URL}/guides/${post.slug}#howto`,
    name: post.title,
    description: post.description,
    totalTime: post.duration,
    tool: [
      { '@type': 'HowToTool', name: 'Spirit level' },
      { '@type': 'HowToTool', name: 'Trowel' },
      { '@type': 'HowToTool', name: 'Wheelbarrow' },
    ],
    step: body.sections.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.heading,
      text: s.paragraphs.join(' ').slice(0, 500),
    })),
  }
}

/**
 * BlogPosting JSON-LD. Used by Google for article-style rich results
 * and to declare author/publisher for E-E-A-T.
 */
export async function guidePostingJsonLd(post: GuidePost): Promise<unknown> {
  const company = await loadCompany()
  const url = `${SITE_URL}/guides/${post.slug}`
  const imageUrl = post.heroImage.startsWith('http')
    ? post.heroImage
    : `${SITE_URL}${post.heroImage}`

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'en-GB',
    image: [imageUrl],
    author: { '@type': 'Organization', name: post.author, url: company.url },
    publisher: {
      '@type': 'Organization',
      name: company.name,
      url: company.url,
      logo: { '@type': 'ImageObject', url: `${company.url}/logo-square.webp` },
    },
    articleSection: post.category,
    keywords: post.tags.join(', '),
    wordCount: post.body.trim().split(/\s+/).length,
  }
}

/** FAQPage JSON-LD. Skips empty answers to avoid Google warnings. */
export function guideFaqJsonLd(post: GuidePost): unknown | null {
  if (post.faqs.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
}

/** BreadcrumbList JSON-LD for the guide. */
export async function guideBreadcrumbJsonLd(post: GuidePost): Promise<unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` },
      { '@type': 'ListItem', position: 3, name: post.title, item: `${SITE_URL}/guides/${post.slug}` },
    ],
  }
}

/**
 * Parse the Markdown body into H2 + paragraph sections so we can emit
 * HowTo JSON-LD and surface a "skim the steps" summary near the top
 * of the page.
 */
export function parseGuideSections(body: string): {
  h2: string[]
  sections: Array<{ heading: string; paragraphs: string[] }>
} {
  const lines = body.split('\n')
  const sections: Array<{ heading: string; paragraphs: string[] }> = []
  let current: { heading: string; paragraphs: string[] } | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      if (current) sections.push(current)
      current = { heading: line.slice(3).trim(), paragraphs: [] }
    } else if (current && line.length > 0) {
      // Strip basic Markdown formatting for the plain-text payload.
      current.paragraphs.push(
        line
          .replace(/^\*\*|^\*/, '')
          .replace(/\*\*|\*$/g, '')
          .replace(/^\-\s+/, '')
          .replace(/`([^`]+)`/g, '$1'),
      )
    }
  }
  if (current) sections.push(current)

  return { h2: sections.map((s) => s.heading), sections }
}
