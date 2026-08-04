// app/guides/page.tsx
// Resources hub. Pulls every piece of editorial content — how-to
// guides, advice articles and real project case studies — into one
// page so visitors can find what they need without hopping routes.
// Each sub-collection keeps a "View all" link to its dedicated index
// for the full filterable experience (/blog, /case-studies).
//
// Visual rules:
//   - Hero uses the same dark gradient + background photo pattern as
//     BlogHero so the three resources indexes feel like one surface.
//   - Guide cards use GuideCard, which mirrors ArticleCard and
//     CaseStudyCard pixel-for-pixel (16:10 hero, badge overlay,
//     category eyebrow, title, excerpt, "Read X" CTA).
//   - The guides section is fully filterable on-page via GuidesGrid
//     (search, category, difficulty, sort) — no more scrolling
//     through 12+ guides looking for the right one.
//
// Forces dynamic rendering so the per-request CSP nonce (set by
// proxy.ts) is applied to JSON-LD and any inline scripts — same
// reason the sibling /blog and /case-studies indexes do the same.

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Newspaper, Sparkles } from 'lucide-react'
import { listArticles } from '@/lib/articles/loader'
import { listCaseStudies } from '@/lib/blog/loader'
import { listGuides } from '@/lib/guides/loader'
import { ArticleCard } from '@/components/blog/ArticleCard'
import { CaseStudyCard } from '@/components/blog/CaseStudyCard'
import { GuidesGrid } from '@/components/blog/GuidesGrid'
import { JsonLd } from '@/components/seo/JsonLd'
import { SITE_URL } from '@/lib/seo/company-seo'

// How many advice / case-study cards to preview per sub-section.
// Chosen to fill a 3-column grid without bloating the HTML payload.
// Visitors tap "View all" for the full filterable index.
const PREVIEW_COUNT = 3

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: 'Building Resources Hub | Guides, Advice & Case Studies | Demo Builder Merchant' },
  description:
    'Step-by-step how-to guides, plain-English building advice, and real project case studies from Demo Builder Merchant. Everything you need to plan, budget and run a building project.',
  keywords: [
    'builders merchant resources',
    'building guides',
    'building advice',
    'builders merchant case studies',
    'how to build a block wall',
    'how to lay a patio',
    'building project planning',
    'self build advice',
  ],
  alternates: { canonical: `${SITE_URL}/guides` },
  authors: [{ name: 'Demo Builder Merchant', url: SITE_URL }],
  category: 'construction',
  openGraph: {
    title: 'Building Resources Hub | Demo Builder Merchant',
    description:
      'How-to guides, building advice and real project case studies — every piece of editorial content from Demo Builder Merchant in one place.',
    url: `${SITE_URL}/guides`,
    type: 'website',
    siteName: 'Demo Builder Merchant',
    locale: 'en_GB',
    images: [
      {
        url: `${SITE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Demo Builder Merchant resources hub',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Building Resources Hub | Demo Builder Merchant',
    description:
      'How-to guides, building advice and real project case studies — every piece of editorial content from Demo Builder Merchant in one place.',
    images: [`${SITE_URL}/opengraph-image`],
  },
}

export default async function GuidesHubPage() {
  // Pull all three feeds in parallel — they're independent filesystem reads.
  const [guides, articles, caseStudies] = await Promise.all([
    Promise.resolve(listGuides()),
    Promise.resolve(listArticles()),
    Promise.resolve(listCaseStudies()),
  ])

  const previewArticles = articles.slice(0, PREVIEW_COUNT)
  const previewCaseStudies = caseStudies.slice(0, PREVIEW_COUNT)
  const caseStudyTowns = Array.from(new Set(caseStudies.map((p) => p.town)))

  // JSON-LD — declare the hub as a CollectionPage that has-parts
  // every guide, article and case study. Each sub-collection also
  // gets its own `isPartOf` link so search engines can reconstruct
  // the parent/child relationships.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/guides#collection`,
    name: 'Building resources — guides, advice and case studies',
    description:
      'Every piece of editorial content from Demo Builder Merchant: how-to guides, plain-English building advice and real project case studies.',
    url: `${SITE_URL}/guides`,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Demo Builder Merchant',
      url: SITE_URL,
    },
    hasPart: [
      ...guides.map((g) => ({
        '@type': 'HowTo',
        name: g.title,
        url: `${SITE_URL}/guides/${g.slug}`,
        description: g.description,
      })),
      ...articles.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${SITE_URL}/blog/${p.slug}`,
        datePublished: p.date,
        description: p.excerpt,
        image: p.heroImage.startsWith('http') ? p.heroImage : `${SITE_URL}${p.heroImage}`,
      })),
      ...caseStudies.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: `${SITE_URL}/case-studies/${p.slug}`,
        datePublished: p.date,
        description: p.excerpt,
        image: p.heroImage.startsWith('http') ? p.heroImage : `${SITE_URL}${p.heroImage}`,
      })),
    ],
  }

  return (
    <>
      <JsonLd id="ld-resources-hub" data={jsonLd} />

      {/* Hero band — dark gradient over a real warehouse photo so the
          hub lands with the same visual weight as the home page. Photo
          is the same one used on the home page hero (hero-2-4kgen) so
          the brand feels continuous across surfaces. */}
      <section className="relative isolate overflow-hidden bg-foreground text-background">
        {/* Background photo */}
        <Image
          src="/hero-2-4kgen.webp"
          alt="Step-by-step building guides and how-to resources from Demo Builder Merchant"
          fill
          sizes="100vw"
          priority
          quality={75}
          className="object-cover opacity-50"
        />
        {/* Gradient overlay — keeps the heading legible no matter
            what part of the photo is behind it. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/70 to-foreground/95"
        />
        {/* Soft primary glow on the right so the eyebrow + heading
            feel like they belong to the brand rather than a stock
            template. Kept very subtle so the photo still reads. */}
        <div
          aria-hidden="true"
          className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-24 lg:pt-36">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              Resources
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Building guides, advice &amp; real projects.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/85 sm:text-lg">
            Step-by-step how-to guides, plain-English building advice and
            case studies from real projects we have supplied. Search,
            filter by category or difficulty, and find the resource
            that matches the job in front of you.
          </p>

          {/* Stats row — shows the breadth of the library and links
              to each sub-index. */}
          <div className="mt-8 flex flex-wrap gap-4">
            <StatCard value={String(guides.length)} label="How-to guides" />
            <StatCard value={String(articles.length)} label="Advice articles" />
            <StatCard value={String(caseStudies.length)} label="Case studies" />
            <StatCard value={String(caseStudyTowns.length)} label="Towns covered" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        {/* Section 1: How-to guides — fully filterable on this page so
            visitors can search by keyword, narrow to a category, or
            pick by difficulty without bouncing to another route. */}
        <SectionHeading
          eyebrow="How-to guides"
          title="Step-by-step guides."
          description="In-depth, structured walkthroughs for the jobs we get asked about most. Search by keyword or filter by category and difficulty."
          viewAllHref="/guides"
          viewAllLabel="All how-to guides"
        />

        {guides.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-muted-foreground">
              No how-to guides published yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <GuidesGrid guides={guides} />
          </div>
        )}

        {/* Section 2: Latest advice — first three posts from /blog.
            The full interactive filter grid (search + category +
            sort) lives at /blog — here we just preview the most
            recent and link through. */}
        {articles.length > 0 && (
          <section className="mt-20" aria-labelledby="resources-advice-heading">
            <SectionHeading
              id="resources-advice-heading"
              eyebrow="Latest advice"
              title="Plain-English answers to common questions."
              description="Practical articles for first-time homeowners, self-builders and trade customers. Browse the full library for search and category filters."
              viewAllHref="/blog"
              viewAllLabel="All advice articles"
              icon={<Newspaper className="h-4 w-4 text-primary" aria-hidden="true" />}
            />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {previewArticles.map((post) => (
                <ArticleCard key={post.slug} post={post} />
              ))}
            </div>
            <div className="mt-6">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                See all {articles.length} articles
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* Section 3: Recent projects — first three case studies from
            /case-studies. Same rationale as advice: full filterable
            grid lives at /case-studies. */}
        {caseStudies.length > 0 && (
          <section className="mt-20" aria-labelledby="resources-case-studies-heading">
            <SectionHeading
              id="resources-case-studies-heading"
              eyebrow="Recent projects"
              title="Real projects, supplied by us."
              description="Every project below was supplied by Demo Builder Merchant — from foundation aggregates to the last fixing. Use the filters at the full index to explore by type, town or county."
              viewAllHref="/case-studies"
              viewAllLabel="All case studies"
              icon={<Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />}
            />
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {previewCaseStudies.map((post) => (
                <CaseStudyCard key={post.slug} post={post} showType />
              ))}
            </div>
            <div className="mt-6">
              <Link
                href="/case-studies"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                See all {caseStudies.length} case studies
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        )}

        {/* Bottom CTA — gives the visitor a clear next step after
            browsing the library. Especially useful for trade
            customers looking to start a quote. */}
        <section className="mt-24 overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                Ready to plan your project?
              </h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Pull together a materials list and request a trade price
                in minutes. Most local deliveries are next-working-day.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/quote"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Build a quote
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                Talk to the yard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}

// Reusable "section intro" block — keeps the visual rhythm identical
// across each of the three sub-sections. `id` is forwarded to the
// heading so the wrapping <section> can be aria-labelledby it.
function SectionHeading({
  eyebrow,
  title,
  description,
  viewAllHref,
  viewAllLabel,
  icon,
  id,
}: {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly viewAllHref: string
  readonly viewAllLabel: string
  readonly icon?: React.ReactNode
  readonly id?: string
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            {eyebrow}
          </span>
        </div>
        <h2
          id={id}
          className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      <Link
        href={viewAllHref}
        className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary transition-transform hover:translate-x-0.5 sm:inline-flex"
      >
        {viewAllLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
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