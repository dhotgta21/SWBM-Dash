// app/(public-shop)/quote/page.tsx
// Public quote page. Visitors land here to build a material list for
// pricing & delivery. The page is composed of three pieces:
//
//   1. Server-rendered header + SEO metadata (title/description,
//      canonical, OG come from the (public-shop) layout)
//   2. <DeliveryChecker /> banner — answers the first question any
//      quote-builder has ("do you even deliver to me?") before they
//      invest ten minutes adding lines to the list. Originally lived
//      under /tools/delivery-checker but that's the wrong home for a
//      serviceability check; it belongs wherever the visitor is
//      committing to an order.
//   3. <QuoteShell /> — a client component that owns two tabs:
//        - Search products (the existing search-first QuoteBuilder)
//        - Browse catalogue (the marketing photo-tile CategoryGrid)
//      The "Your quote" rail sits on the right and stays visible in
//      either tab, so customers never lose track of what they have.
//   4. JSON-LD for an ItemList of all catalogue lines (still crawlable)
//      plus the FAQ list.
//
// The Marketing pathname stays /quote so existing bookmarks and search
// engine rankings are preserved.

import { ChevronRight, Truck } from 'lucide-react'
import { QuoteShell } from '@/components/shop/QuoteShell'
import { BreadcrumbNav } from '@/components/shop/BreadcrumbNav'
import { DeliveryChecker } from '@/components/landing/DeliveryChecker'
import { listPublicCategories, listPublicProducts } from '@/lib/public-products'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

const SHOP_FAQS = [
  {
    q: 'How do I get a quote on building materials?',
    a: 'Search by product name or code, add the quantities you need to your quote list, and submit your contact details. We come back the same business day with trade prices and delivery slots.',
  },
  {
    q: 'Do you price match other builders merchants?',
    a: 'We review every quote on its merits. For regular trade accounts and bulk orders, we are competitive on price across aggregates, bricks, timber, insulation and steel.',
  },
  {
    q: 'How fast can you deliver?',
    a: 'Stock lines are typically same-day across Greater London, Berkshire, Buckinghamshire and Surrey. Outlying towns and bulk aggregates are usually next-day.',
  },
  {
    q: 'Can I open a trade account?',
    a: 'Yes. Trade accounts give you 30-day terms, dedicated counter staff and volume pricing. Apply by phone, email or ask when we reply to your quote.',
  },
]

export default async function ShopPage() {
  const [categories, products, seo] = await Promise.all([
    listPublicCategories(),
    listPublicProducts(),
    loadSeoConfig(),
  ])

  const quoteUrl = canonicalUrl('quote')

  // BreadcrumbList: Home › Get a quote.
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
        item: quoteUrl,
      },
    ],
  }

  // ItemList of every catalogue line. Each entry points at its crawlable
  // category page, which is what we want Google to discover and index.
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Building material catalogue',
    numberOfItems: categories.length,
    itemListElement: categories.map((category, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: category.name,
      url: canonicalUrl(`quote/${category.slug}`),
    })),
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SHOP_FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbJsonLd, itemListJsonLd, faqJsonLd],
  }

  const totalLines = categories.reduce((sum, c) => sum + c.productCount, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <JsonLd id="ld-quote" data={jsonLd} />

      <BreadcrumbNav items={[{ label: 'Home', href: '/' }, { label: 'Get a quote' }]} />

      <header className="mb-10">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Get a quote
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Get a quote on building materials.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Search by product name or code, browse the catalogue, add the
          quantities you need, and send the list through. We&rsquo;ll come
          back the same business day with trade prices and delivery slots
          for your area.
        </p>
        {categories.length > 0 && (
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            {categories.length} catalogue lines &middot; {totalLines}+ stock products
          </p>
        )}
      </header>

      {categories.length > 0 ? (
        <>
          {/* Delivery checker banner — answers "do we even deliver to
              you?" before the visitor invests time adding lines. */}
          <section
            id="delivery-checker"
            aria-labelledby="delivery-checker-heading"
            className="mb-10 scroll-mt-24"
          >
            <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start lg:gap-10">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                  Delivery
                </div>
                <h2
                  id="delivery-checker-heading"
                  className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
                >
                  Check we deliver to your postcode.
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Type your site postcode and we&rsquo;ll show same-day or
                  next-day availability and the estimated delivery charge
                  before you build your list.
                </p>
                <p className="mt-4 text-xs font-medium text-muted-foreground">
                  Or jump to the{' '}
                  <a
                    href="/delivery"
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    full delivery information
                  </a>{' '}
                  for cut-off times, vehicle sizes and access notes.
                </p>
              </div>
              <DeliveryChecker variant="inline" />
            </div>
          </section>

          <QuoteShell categories={categories} products={products} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Our catalogue is being updated. Please check back shortly or send
          us your take-off for a written quote.
        </div>
      )}

      <section className="mt-16 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          How to get a trade quote in three steps
        </h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Search or browse',
              text: 'Look up a product by name or code, or browse the catalogue by category. Every stock line has its own page with descriptions, unit pricing and a quantity calculator where it helps.',
            },
            {
              step: '2',
              title: 'Add quantities',
              text: 'Enter the quantity you need for each line. Use the built-in calculators for bricks, blocks, mortar, concrete, plaster, insulation, timber, aggregates and steel to avoid over-ordering.',
            },
            {
              step: '3',
              title: 'Send your list',
              text: 'Submit your contact details and site postcode. We come back the same business day with trade prices, stock confirmation and a delivery slot for your area.',
            },
          ].map((item) => (
            <li key={item.step} className="flex flex-col">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                {item.step}
              </span>
              <h3 className="mt-3 font-semibold text-foreground">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-16 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Why builders choose Demo Builder Merchant</h2>
          <ul className="mt-5 space-y-3 text-muted-foreground">
            {[
              'Same-day delivery on stock lines across Greater London, Berkshire, Buckinghamshire and Surrey',
              'Trade counter open to accounts and walk-in customers with expert advice',
              'Volume pricing and 30-day terms for regular trade accounts',
              'Named scheduler for commercial and larger domestic projects',
              'Own fleet of lorries, so delivery slots are controlled in-house',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Not sure what you need?</h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            If you have architect drawings, a builder&apos;s schedule or just a list of dimensions, send
            it through and we will build the material list for you. We can suggest alternatives,
            highlight where wastage is worth adding, and flag any items that need a longer lead time.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            You can also call the trade counter, visit the yard, or open a trade account for faster
            quoting and 30-day payment terms.
          </p>
        </div>
      </section>

      <section aria-labelledby="shop-faq-heading" className="mt-16">
        <h2 id="shop-faq-heading" className="text-2xl font-bold tracking-tight text-foreground">
          Quote FAQs
        </h2>
        <div className="mt-6 grid gap-4">
          {SHOP_FAQS.map((faq, index) => (
            <details
              key={index}
              className="group rounded-2xl border border-border bg-card px-5 py-4 open:shadow-sm"
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
