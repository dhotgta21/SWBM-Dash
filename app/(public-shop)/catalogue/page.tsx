// app/(public-shop)/catalogue/page.tsx
// Google Merchant / Shopping friendly product catalogue. Every active product
// is rendered as a real HTML link on the default "All" tab so crawlers can
// scan the full catalogue without executing JavaScript. Category tabs are
// server-rendered links to ?category=<slug>, making each filtered view its own
// crawlable URL. Paginated via ?page=N so the HTML payload stays light on
// mobile (each page renders PAGE_SIZE products instead of all of them).

import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react'
import { listPublicProducts, listPublicCategories } from '@/lib/public-products'
import { loadSeoConfig, canonical as canonicalUrl, applyTemplate } from '@/lib/seo/company-seo'
import { productMatchesSearch } from '@/lib/search'
import { PublicProductCard } from '@/components/shop/PublicProductCard'
import { CategoryGrid } from '@/components/landing/CategoryGrid'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { JsonLd } from '@/components/seo/JsonLd'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string; page?: string }>
}

// Number of products per page. 24 fits a 3-column lg grid in 8 rows
// (or 12 rows on a 2-column sm grid) and keeps the HTML payload under
// ~150 KB even with full image srcsets. Tune up only if Lighthouse
// mobile numbers drop.
const PAGE_SIZE = 24

const CATALOG_FAQS = [
  {
    q: 'What is included in the Star Hawk product catalogue?',
    a: 'The catalogue covers aggregates, cement, bricks, blocks, timber, sheet materials, plasterboard, insulation, roofing, drainage, fixings, steel, lintels and tools. Every active line has its own product page with a trade-quote form.',
  },
  {
    q: 'Can I request a quote without creating an account?',
    a: 'Yes. Add the items and quantities you need to a quote list, enter your contact and delivery details, and submit. We reply the same business day with trade prices and a delivery slot.',
  },
  {
    q: 'Do you deliver catalogue items to my area?',
    a: 'We deliver across Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and Wiltshire. Core towns usually get same-day delivery on stock lines; outlying areas are next-day.',
  },
  {
    q: 'Are prices shown in the catalogue?',
    a: 'Most products show a unit and are priced on application because trade volumes vary. Submit a quote list and we will return a written quote with competitive trade pricing.',
  },
]

function buildCurrentCatalogPath(activeSlug?: string, query?: string, page?: number): string {
  const params = new URLSearchParams()
  if (activeSlug) params.set('category', activeSlug)
  if (query) params.set('q', query)
  if (page && page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `catalogue?${qs}` : 'catalogue'
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const [{ category: categoryParam, q, page: pageParam }, seo, categories] = await Promise.all([
    searchParams,
    loadSeoConfig(),
    listPublicCategories(),
  ])

  const activeSlug =
    typeof categoryParam === 'string' && categoryParam.toLowerCase() !== 'all'
      ? categoryParam
      : undefined
  const activeCategory = activeSlug ? categories.find((c) => c.slug === activeSlug) : undefined
  const query = typeof q === 'string' ? q.trim() : undefined
  const currentPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  let title = seo.catalog.title
  let description = seo.catalog.description

  if (activeCategory) {
    title = applyTemplate(seo.templates.categoryTitle, {
      category: activeCategory.name,
      site: seo.siteName,
    })
    description = applyTemplate(seo.templates.categoryDescription, {
      category: activeCategory.name.toLowerCase(),
      site: seo.siteName,
    })
  }

  if (query) {
    title = `${title} | Search results for "${query}"`
    description = `${description} Search results for "${query}".`
  }

  if (currentPage > 1) {
    title = `${title} | Page ${currentPage}`
  }

  // Canonical should never include the free-text search query or `?page=` —
  // both create thin, infinite near-duplicate URLs that waste crawl budget.
  const canonical = canonicalUrl(buildCurrentCatalogPath(activeCategory?.slug, undefined, undefined))

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    // Search-result pages are thin and query-specific: don't index them.
    // Same for any page > 1 — that's a paginated view, not a unique page.
    ...(query || currentPage > 1 ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical,
      images: [{ url: canonicalUrl('opengraph-image'), width: 1200, height: 630, alt: seo.siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [canonicalUrl('opengraph-image')],
    },
  }
}

export default async function CataloguePage({ searchParams }: PageProps) {
  const [{ category: categoryParam, q, page: pageParam }, products, categories, seo] = await Promise.all([
    searchParams,
    listPublicProducts(),
    listPublicCategories(),
    loadSeoConfig(),
  ])

  const activeSlug =
    typeof categoryParam === 'string' && categoryParam.toLowerCase() !== 'all'
      ? categoryParam
      : undefined
  const activeCategory = activeSlug ? categories.find((c) => c.slug === activeSlug) : undefined
  const query = typeof q === 'string' ? q.trim() : undefined

  let filtered = products

  if (activeCategory) {
    filtered = filtered.filter((p) => p.category === activeCategory.name)
  }

  if (query) {
    const lowerQuery = query.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        productMatchesSearch(p, query) ||
        (p.description && p.description.toLowerCase().includes(lowerQuery)) ||
        (p.category && p.category.toLowerCase().includes(lowerQuery)),
    )
  }

  // Paginate AFTER filtering so the URL `?page=N` reflects position
  // within the current filtered view, not the global product list.
  const totalFiltered = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
  const requestedPage = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
  const currentPage = Math.min(requestedPage, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageEnd = pageStart + PAGE_SIZE
  const paged = filtered.slice(pageStart, pageEnd)

  const catalogPath = buildCurrentCatalogPath(activeCategory?.slug, query)
  const catalogUrl = canonicalUrl(catalogPath)

  const breadcrumbItems = [
    {
      '@type': 'ListItem' as const,
      position: 1,
      name: 'Home',
      item: `${seo.siteUrl}/`,
    },
    {
      '@type': 'ListItem' as const,
      position: 2,
      name: 'Catalogue',
      item: canonicalUrl('catalogue'),
    },
  ]

  if (activeCategory) {
    breadcrumbItems.push({
      '@type': 'ListItem' as const,
      position: 3,
      name: activeCategory.name,
      item: catalogUrl,
    })
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  }

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: activeCategory
      ? `${activeCategory.name} stock lines`
      : `${seo.siteName} product catalogue`,
    // numberOfItems reflects the total filtered set so search engines
    // see the full collection, not just the current page slice.
    numberOfItems: totalFiltered,
    itemListElement: paged.map((product, index) => ({
      '@type': 'ListItem',
      position: pageStart + index + 1,
      name: product.name,
      url: canonicalUrl(`products/${encodeURIComponent(product.code)}`),
    })),
  }

  const collectionPageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: activeCategory
      ? `${activeCategory.name} for trade & DIY`
      : `${seo.siteName} product catalogue`,
    url: catalogUrl,
    description: activeCategory
      ? `Browse ${activeCategory.name.toLowerCase()} from ${seo.siteName}. Request a trade quote with same-day delivery across Greater London and the Home Counties.`
      : seo.catalog.description,
    mainEntity: itemListJsonLd,
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: CATALOG_FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbJsonLd, collectionPageJsonLd, faqJsonLd],
  }

  const pageHeading = activeCategory
    ? `${activeCategory.name} for trade & DIY`
    : 'Full product catalogue'

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <JsonLd id="ld-catalogue" data={jsonLd} />

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
            <Link
              href="/catalogue"
              className={activeCategory ? 'hover:text-foreground' : 'font-medium text-foreground'}
            >
              Catalogue
            </Link>
          </li>
          {activeCategory && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li>
                <span className="font-medium text-foreground">{activeCategory.name}</span>
              </li>
            </>
          )}
        </ol>
      </nav>

      <header className="mb-10">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Browse every line
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {pageHeading}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Search by name or code, filter by category, and add the lines you need to your quote.
          We&rsquo;ll come back the same business day with trade prices and delivery slots.
        </p>
      </header>

      <section aria-label="Shop by category" className="mb-14">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Shop by category
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {categories.length} categories &middot; {products.length} stock lines
            </p>
          </div>
          {activeCategory && (
            <Button asChild variant="outline" size="sm">
              <Link href="/catalogue" className="inline-flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Clear category filter
              </Link>
            </Button>
          )}
        </div>

        <div className="mt-6">
          <CategoryGrid
            rows={categories.map((c) => ({ name: c.name, productCount: c.productCount }))}
            activeName={activeCategory?.name}
          />
        </div>
      </section>

      <section aria-label="Search catalogue" className="mb-8">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                {activeCategory ? `${activeCategory.name} lines` : 'Browse every line'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Search the full range or refine within {activeCategory ? activeCategory.name.toLowerCase() : 'the catalogue'}
              </p>
            </div>
          </div>

          <form action="/catalogue" method="GET" className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end">
            {activeCategory && (
              <input type="hidden" name="category" value={activeCategory.slug} />
            )}
            {/* New search resets to page 1 — see the comment on
                Pagination below for the URL convention. */}
            <div className="relative flex-1">
              <label htmlFor="catalog-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="catalog-search"
                  name="q"
                  type="search"
                  placeholder="Product name, code or keyword..."
                  defaultValue={query ?? ''}
                  className="pl-9"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section aria-label="Product catalogue results">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              {totalFiltered === 0
                ? 'No stock lines found'
                : `${totalFiltered} stock line${totalFiltered === 1 ? '' : 's'}`}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {totalFiltered > 0 &&
              `Showing ${pageStart + 1}–${Math.min(pageEnd, totalFiltered)} of ${totalFiltered} stock lines${
                activeCategory ? ` in ${activeCategory.name}` : ''
              }${query ? ` for "${query}"` : ''}${
                totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ''
              }.`}
          </p>
        </div>

        {paged.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {paged.map((product) => (
              <PublicProductCard key={product.id} product={product} searchQuery={query} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No products match your search.{' '}
              <Link href="/catalogue" className="font-semibold text-primary hover:text-primary-hover">
                View the full catalogue
              </Link>
            </p>
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath={buildCurrentCatalogPath(activeCategory?.slug, query, undefined)}
          />
        )}
      </section>

      <section aria-labelledby="catalog-faq-heading" className="mt-16">
        <h2 id="catalog-faq-heading" className="text-2xl font-bold tracking-tight text-foreground">
          Catalogue FAQs
        </h2>
        <div className="mt-6 grid gap-4">
          {CATALOG_FAQS.map((faq, index) => (
            <details
              key={index}
              className="group rounded-xl border border-border bg-card px-5 py-4 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
                {faq.q}
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}

// Server-rendered pagination strip. Renders a compact 1 … 4 5 6 … 12 set
// of links with prev/next chevrons. Pure HTML — no client JS, so it works
// without hydration and the page stays crawlable.
//
// URL convention: each link is `<basePath>?page=N` where `basePath` is
// whatever the current filtered URL is without a `page` param. Page 1
// is intentionally NOT a link (it would duplicate the un-paginated URL).
function Pagination({
  currentPage,
  totalPages,
  basePath,
}: {
  readonly currentPage: number
  readonly totalPages: number
  readonly basePath: string
}) {
  const sep = basePath.includes('?') ? '&' : '?'
  const hrefFor = (page: number) => (page === 1 ? basePath : `${basePath}${sep}page=${page}`)

  // Build a windowed page list: first, …, current-1, current, current+1, …, last
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
      aria-label="Catalogue pagination"
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
