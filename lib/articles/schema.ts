// lib/articles/schema.ts
// JSON-LD generators for advice / blog article pages.

import 'server-only'
import type { BlogArticle } from './loader'
import { loadCompanyForBlog } from '@/lib/blog/schema'

export { loadCompanyForBlog }

/**
 * Build the BlogPosting JSON-LD object for an advice article.
 *
 * Reference: https://schema.org/BlogPosting
 */
export async function blogPostingJsonLd(post: BlogArticle): Promise<unknown> {
  const company = await loadCompanyForBlog()
  const url = `${company.url}/blog/${post.slug}`
  const imageUrl = post.heroImage.startsWith('http')
    ? post.heroImage
    : `${company.url}${post.heroImage}`

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    url,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: 'en-GB',
    image: [imageUrl],
    author: {
      '@type': 'Organization',
      name: post.author,
      url: company.url,
    },
    publisher: {
      '@type': 'Organization',
      name: company.name,
      url: company.url,
      logo: {
        '@type': 'ImageObject',
        url: `${company.url}/logo-square.webp`,
      },
    },
    articleSection: post.category,
    keywords: post.tags.join(', '),
    wordCount: post.body.trim().split(/\s+/).length,
    timeRequired: `PT${Math.max(1, Math.round(post.body.trim().split(/\s+/).length / 220))}M`,
  }
}

/**
 * FAQPage JSON-LD. Google's rich-result test treats empty answers
 * as warnings, so we strip whitespace and skip empty items.
 */
export function faqJsonLd(post: BlogArticle): unknown | null {
  if (post.faqs.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  }
}

/** BreadcrumbList for the post (Home › Blog › {Post Title}). */
export async function breadcrumbJsonLd(post: BlogArticle): Promise<unknown> {
  const company = await loadCompanyForBlog()
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: company.url,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${company.url}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${company.url}/blog/${post.slug}`,
      },
    ],
  }
}
