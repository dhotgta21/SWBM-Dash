// app/(public-shop)/quote/[slug]/page.tsx
// Public, crawlable category landing page. This is the SEO counterpart to
// the search-first QuoteBuilder on /quote: instead of every product hiding
// behind an interactive search widget (invisible to crawlers), each stock
// category gets its own indexable URL with server-rendered product lines,
// BreadcrumbList + ItemList structured data, and internal links to every
// sibling category. The "Add to quote" buttons reuse the same cart as the
// rest of the shop, so visitors can still build a quote list from here.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Calculator } from 'lucide-react'
import {
  listPublicProducts,
  listPublicCategories,
} from '@/lib/public-products'
import { loadSeoConfig, canonical as canonicalUrl, applyTemplate } from '@/lib/seo/company-seo'
import { getCategoryContent } from '@/lib/seo/category-content'
import { PublicProductCard } from '@/components/shop/PublicProductCard'
import { JsonLd } from '@/components/seo/JsonLd'
import {
  getCalculatorsForCategory,
  CALCULATOR_TYPE_LABELS,
  calculatorHref,
} from '@/lib/calculators/navigation'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const [categories, seo] = await Promise.all([
    listPublicCategories(),
    loadSeoConfig(),
  ])
  const category = categories.find((c) => c.slug === slug)

  // Unknown slug: don't index, but keep links followable so we don't waste
  // link equity if a stale external link points here.
  if (!category) {
    return {
      title: { absolute: 'Category not found' },
      robots: { index: false, follow: true },
    }
  }

  const title = applyTemplate(seo.templates.categoryTitle, {
    category: category.name,
    site: seo.siteName,
  })
  const description = applyTemplate(seo.templates.categoryDescription, {
    category: category.name.toLowerCase(),
    site: seo.siteName,
  })

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalUrl(`quote/${category.slug}`),
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl(`quote/${category.slug}`),
      images: [
        {
          url: canonicalUrl('opengraph-image'),
          width: 1200,
          height: 630,
          alt: `${seo.siteName} — ${category.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [canonicalUrl('opengraph-image')],
    },
  }
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { q } = await searchParams
  const searchQuery = typeof q === 'string' ? q.trim() : undefined
  const { slug } = await params
  const [categories, products, seo] = await Promise.all([
    listPublicCategories(),
    listPublicProducts(),
    loadSeoConfig(),
  ])

  const category = categories.find((c) => c.slug === slug)
  if (!category) notFound()

  const items = products.filter((p) => p.category === category.name)
  const siblings = categories.filter((c) => c.slug !== category.slug)

  const categoryUrl = canonicalUrl(`quote/${category.slug}`)

  // BreadcrumbList: Home › Get a quote › {Category}. Helps Google show a
  // clean trail in search results instead of a bare URL.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${seo.siteUrl}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Get a quote',
        item: canonicalUrl('quote'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: category.name,
        item: categoryUrl,
      },
    ],
  }

  // ItemList of the product lines on this page. Each entry now links to
  // its own product detail page so the catalogue is fully crawlable.
  // Definitional category content — already written in lib/seo/category-content.ts
  // but previously unused. Rendered visibly and as FAQPage JSON-LD for AI/answer
  // engines and Google's rich-result eligibility.
  const categoryContent = getCategoryContent(category.name)
  const relatedCalculators = getCalculatorsForCategory(category.name)

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${category.name} stock lines`,
    numberOfItems: items.length,
    itemListElement: items.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: product.name,
      url: canonicalUrl(`products/${encodeURIComponent(product.code)}`),
    })),
  }

  const collectionPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${category.name} for trade & DIY`,
    url: categoryUrl,
    description: categoryContent.intro,
    mainEntity: itemListJsonLd,
  }
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: categoryContent.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbJsonLd, collectionPageJsonLd, faqJsonLd],
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <JsonLd id="ld-category" data={jsonLd} />

      {/* Visible breadcrumb — mirrors the BreadcrumbList schema. */}
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link href="/quote" className="hover:text-foreground">
              Get a quote
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <span className="font-medium text-foreground">{category.name}</span>
          </li>
        </ol>
      </nav>

      <header className="mb-10">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {category.productCount} {category.productCount === 1 ? 'stock line' : 'stock lines'}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {category.name} for trade &amp; DIY.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {categoryContent.intro}
        </p>
      </header>

      {categoryContent.faqs.length > 0 && (
        <section aria-labelledby={`${slug}-faq-heading`} className="mb-12">
          <h2
            id={`${slug}-faq-heading`}
            className="text-lg font-semibold text-foreground"
          >
            Common questions about {category.name.toLowerCase()}
          </h2>
          <div className="mt-5 grid gap-4">
            {categoryContent.faqs.map((faq, index) => (
              <details
                key={index}
                className="group rounded-xl border border-border bg-card px-5 py-4 open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
                  {faq.q}
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      {items.length > 0 ? (
        <section aria-label={`${category.name} stock lines`}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((product) => (
              <PublicProductCard key={product.id} product={product} searchQuery={searchQuery} />
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            We&rsquo;re refreshing the {category.name.toLowerCase()} range. Send us your
            take-off and we&rsquo;ll quote it the same day.
          </p>
          <Link
            href="/quote"
            className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Search all products
          </Link>
        </div>
      )}

      {relatedCalculators.length > 0 && (
        <section aria-label="Related calculators" className="mt-16">
          <h2 className="text-lg font-semibold text-foreground">
            Estimate {category.name.toLowerCase()} quantities
          </h2>
          <p className="mt-2 text-sm text-foreground/80">
            Use our free calculators to work out how much you need before
            requesting a trade quote.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {relatedCalculators.map((type) => (
              <Link
                key={type}
                href={calculatorHref(type)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
              >
                <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
                {CALCULATOR_TYPE_LABELS[type]}
              </Link>
            ))}
          </div>
        </section>
      )}

      {siblings.length > 0 && (
        <section aria-label="Other categories" className="mt-16">
          <h2 className="text-lg font-semibold text-foreground">Browse other categories</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {siblings.map((sibling) => (
              <Link
                key={sibling.slug}
                href={`/quote/${sibling.slug}`}
                className="inline-flex items-center rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                {sibling.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {sibling.productCount}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
