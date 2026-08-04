// app/blog/page.tsx
// Advice / blog index. Lists every published advice article with an
// interactive search and category filter.
//
// Server-side paginates to keep HTML payload small. The client filter
// then refines within the current page slice — see the note in the
// template below for why.
//
// JSON-LD: CollectionPage, BlogPosting, BreadcrumbList.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listArticles, type BlogArticle } from '@/lib/articles/loader'
import { ArticleGrid } from '@/components/blog/ArticleGrid'
import { JsonLd } from '@/components/seo/JsonLd'
import { FaqSection } from '@/components/seo/FaqSection'
import { SITE_URL } from '@/lib/seo/company-seo'

// Page size for the blog index. 12 fits a 3-column lg grid in 4 rows
// (or 6 rows on a 2-column sm grid). Tuned to keep the HTML payload
// — 12 cards with srcsets + meta — under ~180 KB.
const PAGE_SIZE = 12

const FALLBACK_OG_IMAGE = `${SITE_URL}/opengraph-image`

function resolveOgImage(posts: readonly BlogArticle[]): string {
  const latestHero = posts[0]?.heroImage
  if (latestHero) {
    return latestHero.startsWith('http') ? latestHero : `${SITE_URL}${latestHero}`
  }
  return FALLBACK_OG_IMAGE
}

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const [{ page: pageParam }, posts] = await Promise.all([
    searchParams,
    Promise.resolve(listArticles()),
  ])
  const ogImage = resolveOgImage(posts)

  const currentPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const isPaginated = currentPage > 1
  const title = isPaginated
    ? `Building Advice & Guides | Page ${currentPage}`
    : 'Building Advice & Guides | Star Hawk Blog'

  return {
    title: { absolute: title },
    description:
      'Practical building advice for first-time homeowners, self-builders and trade customers. Learn how to plan a project, choose materials and avoid cowboy builders.',
    keywords: [
      'building advice',
      'first time homeowner guide',
      'how to avoid cowboy builders',
      'builders merchant advice',
      'self build guide',
      'home extension advice',
      'building materials guide',
      'project planning tips',
      'builders merchant blog',
    ],
    alternates: { canonical: `${SITE_URL}/blog` },
    robots: isPaginated
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        },
    authors: [{ name: 'Star Hawk Builders Merchant', url: SITE_URL }],
    category: 'construction',
    openGraph: {
      title: isPaginated
        ? `Building Advice & Guides | Page ${currentPage} | Star Hawk Blog`
        : 'Building Advice & Guides | Star Hawk Blog',
      description:
        'Practical building advice for homeowners and trade customers across Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and West London.',
      url: `${SITE_URL}/blog`,
      type: 'website',
      siteName: 'Star Hawk Builders Merchant',
      locale: 'en_GB',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'Star Hawk Builders Merchant building advice and guides',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: isPaginated
        ? `Building Advice & Guides | Page ${currentPage} | Star Hawk Blog`
        : 'Building Advice & Guides | Star Hawk Blog',
      description:
        'Practical building advice for homeowners and trade customers across Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and West London.',
      images: [ogImage],
    },
  }
}

export default async function BlogIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const [{ page: pageParam }, allPosts] = await Promise.all([
    searchParams,
    Promise.resolve(listArticles()),
  ])

  const totalPosts = allPosts.length
  const totalPages = Math.max(1, Math.ceil(totalPosts / PAGE_SIZE))
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const currentPage = Math.min(requestedPage, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const posts = allPosts.slice(pageStart, pageEnd)

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/blog#collection`,
    name: 'Building advice and guides',
    description:
      'Practical building advice for first-time homeowners, self-builders and trade customers from Star Hawk Builders Merchant.',
    url: `${SITE_URL}/blog`,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Star Hawk Builders Merchant',
      url: SITE_URL,
    },
    // Structured data covers the full set so search engines see the
    // entire collection, not just the current page slice.
    hasPart: allPosts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.date,
      description: p.excerpt,
      image: p.heroImage.startsWith('http') ? p.heroImage : `${SITE_URL}${p.heroImage}`,
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_URL,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: `${SITE_URL}/blog`,
      },
    ],
  }

  return (
    <>
      <JsonLd id="ld-blog-collection" data={collectionJsonLd} />
      <JsonLd id="ld-blog-breadcrumb" data={breadcrumbJsonLd} />

      {/* Hero band */}
      <section className="relative isolate overflow-hidden bg-foreground text-background">
        {/* Background photo — flatbed delivery truck loaded with
            building materials. Reinforces "advice from people who
            actually deliver the stuff". Dark gradient keeps the
            heading legible. */}
        <Image
          src="/hero-4-4kgen.webp"
          alt="Practical building advice and guides from Star Hawk Builders Merchant"
          fill
          sizes="100vw"
          priority
          quality={75}
          className="object-cover opacity-50"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/70 to-foreground/95"
        />
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-24 lg:pt-36">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              Advice & guides
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Straightforward advice for your building project.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/85 sm:text-lg">
            Whether you are a first-time homeowner or a seasoned builder, our guides
            help you plan smarter, choose the right materials and avoid common pitfalls.
          </p>

          {/* Link back to case studies */}
          <div className="mt-8">
            <Link
              href="/case-studies"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
            >
              Looking for our project case studies? View them here →
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        {totalPosts === 0 ? (
          <p className="text-center text-muted-foreground">
            No articles published yet. Check back soon.
          </p>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {pageStart + 1}–{Math.min(pageEnd, totalPosts)} of {totalPosts} articles
                {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}.
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: search and category filter refine the current page. Use pagination to see more.
              </p>
            </div>
            <ArticleGrid posts={posts} />
            {totalPages > 1 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} />
            )}
          </>
        )}
      </div>

      {/* FAQ — 3 questions matching the most common blog-article search
          queries. Renders visible content + FAQPage JSON-LD. */}
      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading="Building advice FAQs"
            items={[
              {
                question: 'How do I avoid cowboy builders on a home extension?',
                answer: 'Verify CSCS cards, check public liability insurance (£2m minimum), ask for 3 recent local references, take written quotes from at least 3 builders, and never pay more than 25% up front. Our advice articles cover each of these checks in detail.',
              },
              {
                question: 'How long does a typical home extension take?',
                answer: 'A single-storey rear extension on a typical semi takes 8-12 weeks from breaking ground to completion. A two-storey extension takes 14-20 weeks. The longest phase is always groundworks and foundation curing — 4-6 weeks alone.',
              },
              {
                question: 'Should I buy building materials myself or let the builder?',
                answer: 'Most extension projects benefit from the homeowner sourcing the materials: trade-counter pricing on aggregates, bricks and timber is usually 20-30% below builder rate. The trade-off is time spent managing deliveries and check-ins. Our calculators and trade quotes can save you both ways.',
              },
            ]}
          />
        </div>
      </section>
    </>
  )
}

// Server-rendered pagination strip. Pure HTML — no client JS required.
// Page 1 is intentionally NOT linked (would duplicate the un-paginated
// URL). Windowed page list: 1, …, current-1, current, current+1, …, last.
function Pagination({
  currentPage,
  totalPages,
}: {
  readonly currentPage: number
  readonly totalPages: number
}) {
  const hrefFor = (page: number) => (page === 1 ? '/blog' : `/blog?page=${page}`)

  const pages: Array<number | 'gap'> = []
  const window = 1
  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= currentPage - window && p <= currentPage + window)
    ) {
      pages.push(p)
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap')
    }
  }

  return (
    <nav
      aria-label="Blog pagination"
      className="mt-10 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {currentPage > 1 ? (
            <Link
              href={hrefFor(currentPage - 1)}
              rel="prev"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-md border border-border bg-card/50 px-3 text-sm font-medium text-muted-foreground opacity-60"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </span>
          )}
        </li>
        {pages.map((p, i) =>
          p === 'gap' ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-2 text-sm text-muted-foreground">
              …
            </li>
          ) : p === currentPage ? (
            <li key={p}>
              <span
                aria-current="page"
                className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md bg-primary px-2 text-sm font-semibold text-primary-foreground"
              >
                {p}
              </span>
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                rel={p === currentPage - 1 ? 'prev' : p === currentPage + 1 ? 'next' : undefined}
                className="inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border border-border bg-card px-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {currentPage < totalPages ? (
            <Link
              href={hrefFor(currentPage + 1)}
              rel="next"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-md border border-border bg-card/50 px-3 text-sm font-medium text-muted-foreground opacity-60"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  )
}
