// app/case-studies/page.tsx
// Case-study index. Lists every published case study with an
// interactive filter bar (search, type, town, county) and sort control.
//
// Server-side paginates to keep HTML payload small. The client filter
// then refines within the current page slice — see the note in the
// template below for why.
//
// Metadata targets "builders merchant case studies" + town-level
// permutations. JSON-LD: CollectionPage, BlogPosting, BreadcrumbList
// and FAQPage.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { listCaseStudies, type CaseStudyPost } from '@/lib/blog/loader'
import { CaseStudyGrid } from '@/components/blog/CaseStudyGrid'
import { JsonLd } from '@/components/seo/JsonLd'
import { FaqSection } from '@/components/seo/FaqSection'
import { SITE_URL } from '@/lib/seo/company-seo'

// Page size for the case-studies index. 18 fits a 3-column lg grid in
// 6 rows (or 9 rows on a 2-column sm grid). Tuned to keep the HTML
// payload — 18 cards with srcsets + meta — under ~250 KB.
const PAGE_SIZE = 18

const FALLBACK_OG_IMAGE = `${SITE_URL}/opengraph-image`

function resolveOgImage(posts: readonly CaseStudyPost[]): string {
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
    Promise.resolve(listCaseStudies()),
  ])
  const ogImage = resolveOgImage(posts)

  const currentPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const isPaginated = currentPage > 1
  const title = isPaginated
    ? `Builders Merchant Case Studies | Page ${currentPage}`
    : 'Builders Merchant Case Studies'

  return {
    title: { absolute: title },
    description:
      'Real building-materials case studies from Star Hawk: extensions, loft conversions, self-builds, garden offices and commercial fit-outs across Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and West London.',
    keywords: [
      'builders merchant case studies',
      'building materials case studies',
      'builders merchant near me',
      'extension case study',
      'loft conversion case study',
      'self build materials supplier',
      'commercial fit out materials',
      'aggregate supply case study',
      'brick supply Berkshire',
      'timber merchant South East',
    ],
    alternates: { canonical: `${SITE_URL}/case-studies` },
    // Paginated views are thin duplicates of page 1 — keep them out
    // of the index, but still let crawlers follow links to detail pages.
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
        ? `Builders Merchant Case Studies | Page ${currentPage} | Star Hawk`
        : 'Builders Merchant Case Studies | Star Hawk',
      description:
        'Real building-materials case studies from Star Hawk: extensions, loft conversions, self-builds and more, delivered across 20+ towns.',
      url: `${SITE_URL}/case-studies`,
      type: 'website',
      siteName: 'Star Hawk Builders Merchant',
      locale: 'en_GB',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'Star Hawk Builders Merchant case studies',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: isPaginated
        ? `Builders Merchant Case Studies | Page ${currentPage} | Star Hawk`
        : 'Builders Merchant Case Studies | Star Hawk',
      description:
        'Real building-materials case studies from Star Hawk: extensions, loft conversions, self-builds and more, delivered across 20+ towns.',
      images: [ogImage],
    },
  }
}

export default async function CaseStudiesIndex({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const [{ page: pageParam }, allPosts] = await Promise.all([
    searchParams,
    Promise.resolve(listCaseStudies()),
  ])

  const totalPosts = allPosts.length
  const totalPages = Math.max(1, Math.ceil(totalPosts / PAGE_SIZE))
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const currentPage = Math.min(requestedPage, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const posts = allPosts.slice(pageStart, pageEnd)
  const towns = Array.from(new Set(allPosts.map((p) => p.town)))

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/case-studies#collection`,
    name: 'Builders merchant case studies',
    description:
      'A growing library of case studies showing how Star Hawk Builders Merchant supplies materials for real projects across Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and West London.',
    url: `${SITE_URL}/case-studies`,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Star Hawk Builders Merchant',
      url: SITE_URL,
    },
    hasPart: allPosts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE_URL}/case-studies/${p.slug}`,
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
        name: 'Case studies',
        item: `${SITE_URL}/case-studies`,
      },
    ],
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.answer,
      },
    })),
  }

  return (
    <>
      <JsonLd id="ld-case-studies-collection" data={collectionJsonLd} />
      <JsonLd id="ld-case-studies-breadcrumb" data={breadcrumbJsonLd} />
      <JsonLd id="ld-case-studies-faq" data={faqJsonLd} />

      {/* Hero band */}
      <section className="relative isolate overflow-hidden bg-foreground text-background">
        {/* Background photo — forklift carrying bricks at sunset, to
            reinforce "real building projects being supplied". Sits
            behind a dark gradient so the heading stays legible. */}
        <Image
          src="/hero-3-4kgen.webp"
          alt="Real building project case studies supplied by Star Hawk Builders Merchant"
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
              Case studies
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            How we supply real building projects across the South East.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/85 sm:text-lg">
            Every project below was supplied by Star Hawk Builders Merchant, from
            foundation aggregates to the last fixing. Use the filters to explore by
            project type, town or county.
          </p>

          {/* Stats row */}
          <div className="mt-8 flex flex-wrap gap-4">
            <StatCard value={String(allPosts.length)} label="Case studies" />
            <StatCard value={String(towns.length)} label="Towns covered" />
            <StatCard value="2017" label="Established" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        {totalPosts === 0 ? (
          <p className="text-center text-muted-foreground">
            No case studies published yet. Check back soon.
          </p>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {pageStart + 1}–{Math.min(pageEnd, totalPosts)} of {totalPosts} case studies
                {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}.
              </p>
              <p className="text-xs text-muted-foreground">
                Tip: filters refine the current page. Use pagination to see more.
              </p>
            </div>
            <CaseStudyGrid posts={posts} />
            {totalPages > 1 && (
              <Pagination currentPage={currentPage} totalPages={totalPages} />
            )}
          </>
        )}

        {/* FAQ section */}
        <section aria-labelledby="case-studies-faq-heading" className="mt-20 border-t border-border pt-12">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              FAQ
            </span>
          </div>
          <h2
            id="case-studies-faq-heading"
            className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
          >
            Common questions about our case studies
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Quick answers about how Star Hawk supplies building materials for real
            projects across the South East.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-xl border border-border bg-card p-5 open:ring-1 open:ring-primary/20"
              >
                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 font-semibold text-foreground">
                  {f.question}
                  <span
                    aria-hidden
                    className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* FAQ — 3 questions matching the most common case-study search
            queries. Renders visible content + FAQPage JSON-LD. */}
        <section className="border-t border-border py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <FaqSection
              heading="Builders merchant case studies FAQs"
              items={[
                {
                  question: 'Where can I see real building projects you have supplied?',
                  answer: 'Every case study on this page documents a real project we supplied — extension, new build, renovation or commercial. We list the materials supplied, the quantities and the rough build cost so you can compare to your own project.',
                },
                {
                  question: 'How long does a typical home extension take?',
                  answer: 'A single-storey rear extension on a typical semi takes 8-12 weeks from breaking ground to completion. A two-storey extension takes 14-20 weeks. The longest phase is always groundworks and foundation curing — 4-6 weeks alone.',
                },
                {
                  question: 'What trade pricing can I expect on bulk orders?',
                  answer: 'Trade-counter pricing on aggregates, cement and steel is usually 20-30% below builder rate. For regular trade customers we offer 30-day terms and dedicated counter staff — see our trade account page.',
                },
              ]}
            />
          </div>
        </section>
      </div>
    </>
  )
}

function StatCard({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-sm">
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider text-white/60">{label}</div>
    </div>
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
  const hrefFor = (page: number) =>
    page === 1 ? '/case-studies' : `/case-studies?page=${page}`

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
      aria-label="Case studies pagination"
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

const faqs = [
  {
    question: 'What types of building projects do your case studies cover?',
    answer:
      'Our case studies cover extensions, loft conversions, self-builds, new builds, garden offices, commercial fit-outs, renovations, refurbishments, re-roofs, garage conversions, barn conversions and driveways across Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and West London.',
  },
  {
    question: 'Can I see materials supplied for a specific project type?',
    answer:
      'Yes. Use the project type filter above to narrow case studies by extension, loft conversion, self-build, commercial fit-out or any other category. Each case study lists the exact building materials supplied.',
  },
  {
    question: 'Which towns do Star Hawk Builders Merchant deliver to?',
    answer:
      'We deliver building materials to towns across the South East including Slough, Reading, Maidenhead, High Wycombe, Bracknell, Camberley, Farnborough, Basingstoke, Oxford, Bicester, Guildford and many more.',
  },
  {
    question: 'Are the projects on this page real customer jobs?',
    answer:
      'Yes. Every case study documents a real building project supplied by Star Hawk Builders Merchant, from foundation aggregates and bricks to timber, insulation and finishing materials.',
  },
  {
    question: 'How can I request the same materials for my project?',
    answer:
      'Browse the case study closest to your project type or town, then use the product links within the article or visit our shop to add materials to your quote list. You can also contact us for trade pricing and same-day delivery advice.',
  },
  {
    question: 'Do you supply both trade and domestic customers?',
    answer:
      'Yes. We support trade builders, developers and domestic customers across the South East. Trade account customers benefit from preferential pricing and dedicated delivery scheduling.',
  },
]
