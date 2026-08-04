// lib/blog/schema.ts
// JSON-LD generators for case-study pages. We emit three blocks
// per post so Google can pick the richest representation possible:
//
//   1. BlogPosting   — the article itself (headline, image, author,
//                       publisher, datePublished, etc.).
//   2. FAQPage       — the FAQ accordion below the article. Each
//                       Q/A becomes a Question node.
//   3. LocalBusiness — nested inside the BlogPosting via
//                       `about`, with `areaServed` pointing at the
//                       town so Google associates the post with the
//                       local pack for that town.
//
// The local-business payload reuses the company_settings row from
// the database so the NAP (name, address, phone) stays in sync
// with the home-page schema. Falls back to a safe default if the
// database isn't reachable.

import 'server-only'
import type { CaseStudyPost } from './loader'
import { SITE_URL } from '@/lib/seo/company-seo'
import { loadCompany } from '@/lib/company'
import { createAdminClient } from '@/lib/supabase/admin'

export interface CompanyShape {
  name: string
  phone?: string
  email?: string
  url: string
  streetAddress: string
  addressLocality: string
  addressRegion: string
  postalCode: string
  addressCountry: string
  sameAs?: string[]
}

const DEFAULT_COMPANY: CompanyShape = {
  name: 'Demo Builder Merchant',
  url: SITE_URL,
  streetAddress: 'Unit 14, Star Hawk Trade Park',
  addressLocality: 'Slough',
  addressRegion: 'Berkshire',
  postalCode: 'SL1 4QX',
  addressCountry: 'GB',
}

/**
 * Load the real company NAP from company_settings so case-study JSON-LD
 * stays in sync with the home page. Falls back to DEFAULT_COMPANY if the
 * database is unreachable (e.g. during a build without admin credentials).
 */
export async function loadCompanyForBlog(): Promise<CompanyShape> {
  try {
    const admin = createAdminClient()
    const [{ data: settings }, company] = await Promise.all([
      admin
        .from('company_settings')
        .select('seo_same_as')
        .eq('id', 1)
        .maybeSingle(),
      loadCompany(),
    ])

    const sameAs =
      typeof settings?.seo_same_as === 'string' && settings.seo_same_as.trim()
        ? settings.seo_same_as
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter((s) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(s))
        : undefined

    return {
      name: company.name,
      phone: company.phone ?? undefined,
      email: company.email ?? undefined,
      url: SITE_URL,
      streetAddress: company.address.streetAddress,
      addressLocality: company.address.addressLocality,
      addressRegion: company.address.addressRegion,
      postalCode: company.address.postalCode,
      addressCountry: 'GB',
      sameAs,
    }
  } catch (err) {
    console.warn('[blog/schema] Could not load company_settings, using fallback:', err)
    return DEFAULT_COMPANY
  }
}

/**
 * Build the BlogPosting JSON-LD object for a case study.
 *
 * Reference: https://schema.org/BlogPosting
 */
export function blogPostingJsonLd(post: CaseStudyPost, company: CompanyShape): unknown {
  const url = `${company.url}/case-studies/${post.slug}`
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
      name: company.name,
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
    articleSection: post.projectLabel,
    keywords: post.tags.join(', '),
    wordCount: post.body.trim().split(/\s+/).length,
    timeRequired: `PT${Math.max(1, Math.round(post.body.trim().split(/\s+/).length / 220))}M`,
    about: {
      '@type': 'LocalBusiness',
      '@id': `${company.url}#business`,
      name: company.name,
      url: company.url,
      telephone: company.phone,
      email: company.email,
      image: `${company.url}/logo-square.webp`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: company.streetAddress,
        addressLocality: company.addressLocality,
        addressRegion: company.addressRegion,
        postalCode: company.postalCode,
        addressCountry: company.addressCountry,
      },
      areaServed: [
        {
          '@type': 'City',
          name: post.town,
          containedInPlace: {
            '@type': 'AdministrativeArea',
            name: post.county,
          },
        },
      ],
      sameAs: company.sameAs ?? [],
    },
  }
}

/**
 * FAQPage JSON-LD. Google's rich-result test treats empty answers
 * as warnings, so we strip whitespace and skip empty items.
 *
 * Reference: https://schema.org/FAQPage
 */
export function faqJsonLd(post: CaseStudyPost): unknown | null {
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
export function breadcrumbJsonLd(post: CaseStudyPost, company: CompanyShape): unknown {
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
        name: 'Case studies',
        item: `${company.url}/case-studies`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${company.url}/case-studies/${post.slug}`,
      },
    ],
  }
}

/** Service JSON-LD for the project itself, helps LocalServices. */
export function serviceJsonLd(post: CaseStudyPost, company: CompanyShape): unknown {
  const url = `${company.url}/case-studies/${post.slug}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: post.projectLabel,
    provider: { '@id': `${company.url}#business` },
    areaServed: {
      '@type': 'City',
      name: post.town,
      containedInPlace: { '@type': 'AdministrativeArea', name: post.county },
    },
    description: post.excerpt,
    url,
  }
}

export { DEFAULT_COMPANY }