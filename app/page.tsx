// app/page.tsx
// Public marketing landing page for Demo Builder Merchant.
//
// Replaces the old behaviour of redirecting "/" → "/login" so the
// canonical site entry point is now a customer-facing showcase of the
// categories the merchant stocks. Authenticated users who land here
// still get sent straight to the dashboard — see the redirect below.
//
// Data flow:
//   1. Pulls distinct product categories + counts for the category grid.
//   2. Pulls company_settings (phone/email/address) for the contact
//      strip. Single-row table, always id = 1.
//   3. Composes section components. The page is wrapped in CartProvider
//      so visitors can build a quote list as they move from the landing
//      page into the quote builder.
//
// Caching strategy:
//   • Rendered dynamically so the per-request CSP nonce from proxy.ts
//     can be applied to Next.js framework scripts and the JSON-LD
//     <script> tags below. nonce-based CSP is incompatible with ISR —
//     see node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
//   • The DB-backed fragments (categories, company_settings, seo) are
//     cached server-side with `unstable_cache` and a 60 s revalidate,
//     so the per-request Supabase round-trips are skipped on warm
//     requests. The HTML still renders per-request to apply the nonce.
//   • Logged-in visitors are redirected to the right dashboard by
//     <AuthHomeRedirect />, a tiny client-side bootstrap that runs
//     after hydration. Reading cookies / validating the Supabase
//     session on the server would force the route into dynamic mode
//     anyway, so we keep that work off the critical path and let the
//     route be dynamic end-to-end. Logged-in visitors see the
//     marketing page flash for ~50ms before being redirected. That's
//     acceptable — the redirect is a convenience, not a security
//     boundary.
//

import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'
import { CartProvider } from '@/lib/cart/cart-context'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { SiteHeader } from '@/components/landing/SiteHeader'
import { AuthHomeRedirect } from '@/components/auth/AuthHomeRedirect'
import { Hero } from '@/components/landing/Hero'
import { TrustStrip } from '@/components/landing/TrustStrip'
import { CategoryGrid, type CategoryRow } from '@/components/landing/CategoryGrid'
import { QuoteCTA } from '@/components/landing/QuoteCTA'
import { AboutSection } from '@/components/landing/AboutSection'
import { loadCompany, getChannelForContext, filterChannelsByContext } from '@/lib/company'
import { ServicesSection } from '@/components/landing/ServicesSection'
import { DeliveryAreas } from '@/components/landing/DeliveryAreas'
import { DELIVERY_AREAS } from '@/lib/delivery-areas'
import { Faq, type FaqItem } from '@/components/landing/Faq'
import { ContactSection } from '@/components/landing/ContactSection'
import { SiteFooter } from '@/components/landing/SiteFooter'
import { FloatingCartButton } from '@/components/shop/FloatingCartButton'
import { ResourcesShowcase } from '@/components/landing/ResourcesShowcase'
import { LazyTestimonialsSection } from '@/components/testimonials/LazyTestimonialsSection'

import { listLocationTowns } from '@/lib/blog/loader'
import { listGuideHubCards } from '@/lib/guides/loader'
import { JsonLd } from '@/components/seo/JsonLd'
import { toOpeningHoursSpecification } from '@/lib/opening-hours'
import { isDemoMode, getDefaultSiteUrl } from '@/lib/demo/brand'
import { getActiveVerticalPack } from '@/lib/demo/verticals'
import { CATEGORY_META } from '@/components/landing/category-meta'

// Force-dynamic rendering so the per-request CSP nonce injected by
// proxy.ts is applied to Next.js framework scripts and the JSON-LD
// blocks below. nonce-based CSP is incompatible with static/ISR — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
//
// Auth-bound visitors are redirected by <AuthHomeRedirect />, a tiny
// client-side bootstrap that runs after hydration — see the comment
// block at the top of this file for why.
export const dynamic = 'force-dynamic'

// Primary public site URL. Used to build absolute URLs inside JSON-LD
// (canonical, schema.org @id, areaServed references, etc.). Falls back
// to the production domain if no env override is provided.
const SITE_URL = getDefaultSiteUrl()

// Default construction FAQs (production + construction demo pack).
// Demo vertical packs may replace these at render time.
const DEFAULT_FAQS: FaqItem[] = [
  {
    q: 'Do you deliver building materials to Slough?',
    a: 'Yes, we run our own delivery lorries across Slough and the rest of the SL postcode area. Stock lines are typically delivered same-day, bulk aggregates within 24 hours. Call the trade counter for a delivery slot.',
  },
  {
    q: 'What areas does the merchant cover?',
    a: 'We deliver across Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and Wiltshire. See our delivery area section above for the full town list. Core towns are typically same-day; outlying areas are next-day.',
  },
  {
    q: 'Can I open a trade account?',
    a: 'Yes, trade accounts can be opened in minutes and give you 30-day terms, dedicated counter staff and volume pricing on aggregates, cement and steel.',
  },
  {
    q: 'Do you stock aggregates by the tonne?',
    a: 'We stock sharp sand, ballast, gravel and Type 1 sub-base by the tonne, with off-load crane gear on our delivery lorries so the material is dropped exactly where you need it on site.',
  },
  {
    q: 'Do you cut timber and sheet materials while I wait?',
    a: 'Yes, bring your cutting list to the trade saw bench and we will cut CLS, carcassing timber, OSB, plywood and MDF to size while you wait.',
  },
]

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getCachedSeo()

  return {
    title: {
      absolute: seo.home.title,
    },
    description: seo.home.description,
    keywords: seo.home.keywords,
    alternates: {
      canonical: canonicalUrl(''),
    },
    openGraph: {
      title: seo.home.ogTitle,
      description: seo.home.ogDescription,
      type: 'website',
      url: canonicalUrl(''),
      images: [
        {
          url: canonicalUrl('opengraph-image'),
          width: 1200,
          height: 630,
          alt: `${seo.siteName} — ${seo.home.ogTitle}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.home.ogTitle,
      description: seo.home.ogDescription,
      images: [canonicalUrl('opengraph-image')],
    },
  }
}

interface CategoriesLoadResult {
  categories: CategoryRow[]
  error?: string
}

async function loadCategories(): Promise<CategoriesLoadResult> {
  // Public (anon) client reads the product catalogue. RLS now allows
  // public SELECT on products, so this works without a user session.
  let supabase
  try {
    supabase = createPublicClient()
  } catch (err) {
    console.error('loadCategories: missing public Supabase credentials', err)
    return {
      categories: [],
      error:
        'Supabase public credentials are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel.',
    }
  }

  let data: { category: string | null; is_active: boolean }[] | null = null
  let error: { message: string } | null = null
  try {
    // Do NOT filter on deleted_at here: many demo DBs were created from a
    // partial schema without that column, and PostgREST fails the whole query.
    // Soft-deleted rows should set is_active = false instead.
    const result = await supabase
      .from('products')
      .select('category, is_active')
      .eq('is_active', true)
      .not('category', 'is', null)

    data = result.data as { category: string | null; is_active: boolean }[] | null
    error = result.error
  } catch (err) {
    console.error('loadCategories: unexpected query failure', err)
    return {
      categories: [],
      // No hard error banner — homepage falls back to marketing categories
    }
  }

  if (error) {
    console.error('loadCategories: database error', error)
    // Return empty list without a user-facing error when the schema is incomplete.
    // The landing page still renders category cards from CATEGORY_META.
    return { categories: [] }
  }
  if (!data) return { categories: [] }

  const counts = new Map<string, number>()
  for (const row of data as { category: string | null; is_active: boolean }[]) {
    if (!row.category) continue
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }

  const categories = Array.from(counts.entries())
    .map(([name, productCount]) => ({ name, productCount }))
    .sort((a, b) => a.name.localeCompare(b.name))

  if (categories.length === 0) {
    // Diagnostics: if the filtered query returned nothing, log the raw
    // product state so we can tell whether the table is empty, products
    // are inactive, or categories are missing.
    const { count, error: countErr } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
    const total = countErr ? 'count-error' : count ?? 0
    console.warn(
      'loadCategories: no categories returned.',
      'filtered rows:', data.length,
      'total products:', total,
      countErr ?? ''
    )
    if (typeof total === 'number' && total > 0) {
      return {
        categories: [],
        error: `${total} product(s) exist but none are active with a category. Check the products table for is_active = true and a non-empty category.`,
      }
    }
  }

  return { categories }
}

// Server-side cached version of the categories query. Categories
// change infrequently (when products are added/removed in the
// dashboard), so a 60 s revalidate keeps the home page fast on
// repeat visits while staying fresh enough for the operator.
// `unstable_cache` dedupes concurrent requests on the same key, so a
// cold cache after expiry only triggers one Supabase query even
// under burst load.
const getCachedCategories = unstable_cache(
  loadCategories,
  ['home-categories'],
  { revalidate: 60, tags: ['products', 'home'] },
)

// Company info is even more stable than categories. Cache for 5 min
// so the contact strip on the home page is essentially free on warm
// requests. Bumped higher than categories because the operator edits
// it rarely and the row is tiny.
const getCachedCompany = unstable_cache(
  loadCompany,
  ['home-company'],
  { revalidate: 300, tags: ['company'] },
)

// SEO config rarely changes (the operator edits a JSON column a few
// times a year). 5 min revalidate.
const getCachedSeo = unstable_cache(
  loadSeoConfig,
  ['home-seo'],
  { revalidate: 300, tags: ['seo'] },
)


export default async function HomePage() {
  const [categoriesResult, company, seo, guideCards] = await Promise.all([
    getCachedCategories(),
    getCachedCompany(),
    getCachedSeo(),
    Promise.resolve(listGuideHubCards()),
  ])
  const locationSlugs = new Set(listLocationTowns().map((l) => l.slug))
  const { categories, error: categoriesError } = categoriesResult

  // Demo vertical pack drives hero/FAQ/category emphasis when DEMO_MODE is on.
  // Production keeps the classic construction landing copy.
  const vertical = getActiveVerticalPack()
  const demo = isDemoMode()
  const FAQS: FaqItem[] =
    demo && vertical.id !== 'construction'
      ? vertical.faqs.map((f) => ({ q: f.question, a: f.answer }))
      : DEFAULT_FAQS

  // Build landing grid rows. Always start from the marketing category list
  // (or active vertical pack), then attach live product counts from the DB.
  // That way a partial/empty products table never blanks the homepage.
  const focusNames =
    demo && vertical.categories.length > 0
      ? vertical.categories.filter((name) => CATEGORY_META.some((m) => m.name === name))
      : CATEGORY_META.map((m) => m.name)

  const countByName = new Map(categories.map((c) => [c.name, c.productCount]))
  let orderedCategories: CategoryRow[] = focusNames.map((name) => ({
    name,
    productCount: countByName.get(name) ?? 0,
  }))

  // Append any extra DB categories that have meta but are not in the focus list
  for (const c of categories) {
    if (!focusNames.includes(c.name) && CATEGORY_META.some((m) => m.name === c.name)) {
      orderedCategories.push(c)
    }
  }

  const homepagePhone =
    getChannelForContext(company.phones, 'homepage')?.value ||
    company.phone ||
    '01234 567 890'
  const homepageEmail =
    getChannelForContext(company.emails, 'homepage')?.value ||
    company.email ||
    'trade@starhawkbm.example'
  const headerPhone =
    getChannelForContext(company.phones, 'header')?.value || homepagePhone
  const contactPhones = filterChannelsByContext(company.phones, 'contactPage').map(
    (c) => c.value,
  )
  const contactEmails = filterChannelsByContext(company.emails, 'contactPage').map(
    (c) => c.value,
  )
  const footerPhones = filterChannelsByContext(company.phones, 'footer').map(
    (c) => c.value,
  )
  const footerEmails = filterChannelsByContext(company.emails, 'footer').map(
    (c) => c.value,
  )

  // Total stock-line count across every category. Used by the About
  // section stats row so the "Stock lines under one roof" figure stays
  // in lock-step with the categories rendered in the grid above.
  const totalProducts = orderedCategories.reduce(
    (sum, c) => sum + c.productCount,
    0,
  )

  // Build the LocalBusiness JSON-LD. The schema pulls NAP (Name,
  // Address, Phone) from the company_settings row when present, with a
  // safe fallback for the demo build. areaServed is the explicit list
  // of towns the merchant delivers to.
  const validStreetAddress =
    company.address.streetAddress && company.address.streetAddress !== 'Address on file'
      ? company.address.streetAddress
      : null
  const validPostalCode =
    company.address.postalCode && company.address.postalCode !== 'Address on file'
      ? company.address.postalCode
      : null

  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BuildingMaterialsStore',
    '@id': `${SITE_URL}/#business`,
    // Link to the Organization entity so the brand has a stable @id
    // that other schema can reference (and so Knowledge Panel signals
    // have a canonical target).
    parentOrganization: { '@id': `${SITE_URL}/#organization` },
    name: company.name,
    url: SITE_URL,
    telephone: homepagePhone,
    email: homepageEmail,
    image: `${SITE_URL}/logo-square.webp`,
    logo: `${SITE_URL}/logo-square.webp`,
    // Pull the description from Settings so the meta description and
    // the structured-data description never drift apart.
    description: seo.home.description,
    // Only emit priceRange when the operator has set it. Was a
    // hardcoded "££" placeholder before — Google can treat that as
    // misleading structured data.
    ...(seo.priceRange ? { priceRange: seo.priceRange } : {}),
    // paymentAccepted is an easy trust signal. Same-day invoice, card
    // on the trade counter, etc.
    paymentAccepted: 'Cash, Credit Card, Invoice',
    currenciesAccepted: 'GBP',
    address: {
      '@type': 'PostalAddress',
      addressLocality: company.address.addressLocality,
      addressRegion: company.address.addressRegion,
      addressCountry: 'GB',
      ...(validStreetAddress ? { streetAddress: validStreetAddress } : {}),
      ...(validPostalCode ? { postalCode: validPostalCode } : {}),
    },
    // areaServed is a county-level list (13 unique counties) rather than
    // the 935 individual towns. Google warns against >100 nodes in a
    // single JSON-LD block, and the granular town list bloats the home
    // page payload. The 935 individual town pages still exist at
    // /locations/[town] with their own LocalBusiness + Service schema
    // for the long-tail "delivery {town}" intent.
    areaServed: Array.from(
      new Set(DELIVERY_AREAS.map((a) => a.county).filter(Boolean))
    ).map((county) => ({
      '@type': 'AdministrativeArea',
      name: county,
      addressCountry: 'GB',
    })),
    openingHoursSpecification: toOpeningHoursSpecification(company.openingHours),
    sameAs: seo.sameAs.length > 0 ? seo.sameAs : undefined,
    ...(seo.geo
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: seo.geo.latitude,
            longitude: seo.geo.longitude,
          },
          // Use the actual Google Maps URL if available; otherwise fall back
          // to a coordinate search link.
          hasMap:
            seo.mapsUrl ??
            `https://www.google.com/maps/search/?api=1&query=${seo.geo.latitude},${seo.geo.longitude}`,
        }
      : {}),
  }

  // Brand-level Organization entity. Same as / different from the
  // LocalBusiness — Google's brand signal sits on Organization.
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: company.name,
    url: SITE_URL,
    logo: `${SITE_URL}/logo-square.webp`,
    description: seo.home.description,
    ...(seo.sameAs.length > 0 ? { sameAs: seo.sameAs } : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: homepagePhone,
      email: homepageEmail,
      contactType: 'sales',
      areaServed: { '@type': 'Country', name: 'United Kingdom' },
      availableLanguage: ['en-GB'],
    },
  }

  // Sanitise FAQ answers for JSON-LD: HTML entities can corrupt rich-result
  // snippets, so we decode the common ones and strip any stray tags.
  const decodeForJsonLd = (text: string) =>
    text
      .replace(/&rsquo;/g, '\u2019')
      .replace(/&lsquo;/g, '\u2018')
      .replace(/&rdquo;/g, '\u201D')
      .replace(/&ldquo;/g, '\u201C')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]*>/g, '')

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: decodeForJsonLd(f.a),
      },
    })),
  }

  // WebSite + SearchAction lets Google show a sitelinks search box under
  // the home page result. The search target is the public quote builder.
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: company.name,
    inLanguage: 'en-GB',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/quote?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  // BreadcrumbList for the home page (single-item is valid and helps Google
  // understand the site root).
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
    ],
  }

  return (
    <CartProvider>
      {/* Tiny client-side bootstrap. Renders nothing visible; only fires
          when the visitor has a Supabase session. Keeps the marketing
          page fully static since no server-side cookie read happens. */}
      <AuthHomeRedirect />
      <JsonLd id="ld-organization" data={organizationJsonLd} />
      <JsonLd id="ld-business" data={localBusinessJsonLd} />
      <JsonLd id="ld-faq" data={faqJsonLd} />
      <JsonLd id="ld-website" data={websiteJsonLd} />
      <JsonLd id="ld-breadcrumb" data={breadcrumbJsonLd} />
      <div className="flex min-h-full flex-col bg-background">
        <SiteHeader phone={headerPhone} />

        <main className="flex-1">
          <Hero
            phone={homepagePhone}
            email={homepageEmail}
            heroLead={demo ? vertical.heroLead : undefined}
            heroEmphasis={demo ? vertical.heroEmphasis : undefined}
            heroBody={demo ? vertical.heroBody : undefined}
          />
          <TrustStrip headline={demo ? vertical.trustHeadline : undefined} />

          <section
            id="categories"
            aria-labelledby="categories-heading"
            className="scroll-mt-20 py-20 lg:py-24"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    What we stock
                  </span>
                  <h2
                    id="categories-heading"
                    className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
                  >
                    {categories.length} categories. One yard.
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    From bulk aggregates by the tonne to the small bag of
                    nails you forgot on a Friday afternoon. Pull up, give us
                    a call, or send the take-off and we&rsquo;ll have it ready.
                  </p>
                </div>
                <Link
                  href="/catalogue"
                  className="self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Browse all products
                </Link>
              </div>

              {categoriesError && (
                <div className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                  {categoriesError}
                </div>
              )}

              <div className="mt-10">
                <CategoryGrid rows={orderedCategories} />
              </div>
            </div>
          </section>

        <QuoteCTA />
        <ResourcesShowcase guides={guideCards} />

        <AboutSection
          company={company}
          areas={DELIVERY_AREAS}
          totalProducts={totalProducts}
        />
        <ServicesSection />

        <DeliveryAreas areas={DELIVERY_AREAS} />
        <LazyTestimonialsSection />
        <Faq items={FAQS} />

        <ContactSection
          phones={contactPhones}
          emails={contactEmails}
          addressLines={company.addressLines}
        />
      </main>

      <SiteFooter
        companyName={company.name}
        year={new Date().getFullYear()}
        phones={footerPhones}
        emails={footerEmails}
        addressLines={company.addressLines}
        hours={company.hours}
        categories={categories}
        areas={DELIVERY_AREAS}
        sameAs={seo.sameAs}
        locationSlugs={locationSlugs}
      />
      <FloatingCartButton />
    </div>
  </CartProvider>
  )
}
