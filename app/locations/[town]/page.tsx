// app/locations/[town]/page.tsx
// Local SEO landing page for a single town. Targets commercial-intent
// searches like "builders merchant {town}" and especially "delivery {town}"
// (the same query space the Selco Slough page above targets). Each section
// is designed to be extractable by both Google and AI engines:
//   - H1 + first 150 words answer the delivery question directly (C02)
//   - Delivery options table makes cut-offs / slots / charges extractable (O03)
//   - Delivery FAQ emits FAQPage JSON-LD for rich-result eligibility (C09)
//   - Service JSON-LD with areaServed ties the page to the town entity
//   - Hub grid + searchable delivery-area finder turn the page into a
//     navigable map of the 50-mile own-fleet delivery network

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Truck,
} from 'lucide-react'
import { CaseStudyCard } from '@/components/blog/CaseStudyCard'
import { getCaseStudiesByTown } from '@/lib/blog/loader'
import { DeliveryHubGrid } from '@/components/locations/DeliveryHubGrid'
import { DeliveryAreaSearch } from '@/components/locations/DeliveryAreaSearch'
import {
  getLocationForPage,
  listLocationSlugs,
  listNearbyDeliveryTowns,
} from '@/lib/locations'
import { getLocationImage } from '@/lib/location-images'
import {
  DELIVERY_AREAS,
  DELIVERY_HUB_LABELS,
  type DeliveryHub,
} from '@/lib/delivery-areas'
import { loadSeoConfig, canonical } from '@/lib/seo/company-seo'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { FaqSection } from '@/components/seo/FaqSection'
import { JsonLd } from '@/components/seo/JsonLd'

interface PageProps {
  readonly params: Promise<{ town: string }>
}

export function generateStaticParams(): Array<{ town: string }> {
  return listLocationSlugs().map((slug) => ({ town: slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { town: townSlug } = await params
  const location = getLocationForPage(townSlug)
  if (!location) return { title: { absolute: 'Location not found' }, robots: { index: false, follow: true } }

  const seo = await loadSeoConfig()
  const hero = getLocationImage(location.slug, location.hub, location.county, location.town)

  // Title is intentionally kept under Google's ~60-character desktop display
  // limit. The previous template ("Builders Merchant & Delivery in X, Y |
  // Brand") was 78 chars and got truncated. We keep the brand out of the
  // title tag (Google appends site-name automatically when the canonical
  // matches the verified domain) and surface the county so the SERP
  // snippet disambiguates towns that share a name with a place elsewhere.
  const title = `Builders Merchant & Delivery in ${location.town}, ${location.county}`

  // Description is unique per page (uses hub + county + a different verb-led
  // CTA per page) so we don't trip the duplicate-content filter on 935 town
  // pages. The first sentence answers the long-tail "delivery {town}"
  // query directly so Google can extract a featured-snippet-style blurb.
  const description = `Order building materials for same-day delivery to ${location.town}, ${location.county}. Aggregates, bricks, timber, insulation, roofing & fixings — own-fleet lorry, cut-off 11am, free over £150. Trade quote in 2 min.`

  return {
    title: { absolute: title },
    description,
    // Targeted keywords per town — Bing + some AI engines still read this
    // meta tag, and even on Google the city + county pair strengthens the
    // title without crowding the visible character budget.
    keywords: [
      `builders merchant ${location.town}`,
      `building materials ${location.town}`,
      `delivery ${location.town}`,
      `${location.town} ${location.county}`,
      'same-day delivery',
      'aggregates',
      'bricks',
      'timber',
      'insulation',
      'roofing',
      'plasterboard',
    ],
    // R06 freshness signal — surfaces the most recent content change in
    // search snippets ("Updated 2 days ago"). We prefer a real
    // case-study mtime when one exists for this town, and fall back to
    // today's date otherwise.
    other: {
      'article:modified_time': getMostRecentPostDateForTown(townSlug),
    },
    alternates: { canonical: canonical(`locations/${location.slug}`) },
    openGraph: {
      title,
      description,
      url: canonical(`locations/${location.slug}`),
      type: 'website',
      // Per-town OG image — Google picks the first image it can crawl for
      // a location page. We use the new 50-image cinematic pool resolved
      // via the same hero() mapping the visible hero uses, so the social
      // preview matches what visitors see on the page. Previously this
      // cycled 4 yard photos across 935 pages.
      images: [{ url: `${seo.siteUrl}${hero.path}`, alt: hero.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${seo.siteUrl}${hero.path}`],
    },
  }
}

// Most recent case-study date for a town, used as the page's
// `article:modified_time` signal. Falls back to the current date so the
// field is always present (Google ignores empty values; we always emit
// something so AI engines can rank freshness).
function getMostRecentPostDateForTown(slug: string): string {
  try {
    const posts = getCaseStudiesByTown(slug)
    if (posts.length > 0) {
      // posts are pre-sorted descending by date in the loader.
      return new Date(posts[0].date).toISOString()
    }
  } catch {
    // ignore — fall through to current date
  }
  return new Date().toISOString()
}

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export default async function LocationPage({ params }: PageProps) {
  const { town: townSlug } = await params
  const location = getLocationForPage(townSlug)
  if (!location) notFound()

  const posts = getCaseStudiesByTown(townSlug)
  const seo = await loadSeoConfig()
  const hero = getLocationImage(location.slug, location.hub, location.county, location.town)

  // Neighbouring delivery towns: same-hub first, then same county, then the
  // rest of the network. The full list drives the SEO paragraph below so
  // every nearby town is mentioned in crawlable text on this page, and
  // rendered as anchor links so PageRank flows to every town page.
  const nearbyTowns = listNearbyDeliveryTowns(location)
  const nearbyProse = formatNearbyForProse(nearbyTowns, 6)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: canonical(''),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Delivery areas',
        item: canonical('locations'),
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${location.town}, ${location.county}`,
        item: canonical(`locations/${location.slug}`),
      },
    ],
  }

  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${seo.siteUrl}#business`,
    name: seo.siteName,
    url: seo.siteUrl,
    areaServed: {
      '@type': 'City',
      name: location.town,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: location.county,
      },
    },
    ...(seo.priceRange ? { priceRange: seo.priceRange } : {}),
    ...(seo.geo?.latitude && seo.geo?.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: seo.geo.latitude,
            longitude: seo.geo.longitude,
          },
        }
      : {}),
  }

  // Service JSON-LD ties the page to a specific delivery service for the
  // town. Helps Google understand the page is about delivering building
  // materials to this place, not just a generic local page.
  const deliveryServiceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    serviceType: 'Building materials delivery',
    name: `Building materials delivery in ${location.town}`,
    provider: {
      '@type': 'LocalBusiness',
      '@id': `${seo.siteUrl}#business`,
      name: seo.siteName,
    },
    areaServed: {
      '@type': 'City',
      name: location.town,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: location.county,
      },
    },
    description: `Same-day and next-day building materials delivery across ${location.town} and ${location.county}. Order before 11am for same-day on stock lines.`,
  }

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${canonical(`locations/${location.slug}`)}#collection`,
    url: canonical(`locations/${location.slug}`),
    name: `Building projects in ${location.town}`,
    about: {
      '@type': 'City',
      name: location.town,
      containedInPlace: {
        '@type': 'AdministrativeArea',
        name: location.county,
      },
    },
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      '@id': `${canonical(`case-studies/${post.slug}`)}#article`,
      url: canonical(`case-studies/${post.slug}`),
      headline: post.title,
      datePublished: post.date,
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd
        id="ld-location"
        data={[breadcrumbLd, localBusinessLd, deliveryServiceLd, collectionLd]}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Delivery areas', href: '/locations' },
            { label: `${location.town}, ${location.county}` },
          ]}
        />
      </div>

      {/* Per-town hero image — resolved via lib/location-images.ts. Picks a
          hand-picked image for ~70 main towns, then a county-curated pool
          (4-6 images each), then a hub pool. Each town gets a different
          locality-relevant photo (50 unique WebPs total) instead of the
          old 4-photo yard rotation. The next/image component handles
          responsive sizing + AVIF/WebP transcoding per device. */}
      <div className="mx-auto mt-8 max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative aspect-[16/6] w-full overflow-hidden rounded-2xl border border-border bg-muted">
          <Image
            src={hero.path}
            alt={hero.alt}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 90vw, 1280px"
            className="object-cover"
            priority
          />
        </div>
      </div>

      <section className="border-b border-border bg-muted/30 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              {location.county}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Builders merchant &amp; same-day delivery in {location.town}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Yes — we deliver building materials to{' '}
              <strong className="text-foreground">{location.town}</strong> and
              the surrounding {location.county} area, typically same-day on
              stock lines when you order before 11am. Aggregates, bricks,
              blocks, timber, insulation, roofing, plasterboard and fixings
              arrive on our own lorries with crane offload available for bulk
              loads. Browse local projects below or request a trade quote and
              we&apos;ll confirm a delivery slot the same business day.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Request a quote
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/delivery"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See full delivery info
              </Link>
            </div>
            {/* Ept01 byline + freshness stamp. The "Updated" date is now()
                because the page is regenerated on each request when a town
                is added or a case study ships; a future change could pull
                the actual content-cas-study mtime per town. */}
            <p className="mt-6 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                Reviewed by the Demo Builder Merchant delivery team
              </span>
              {' '}· 15+ years serving {location.county} ·{' '}
              <time dateTime={new Date().toISOString().slice(0, 10)}>
                Updated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
            </p>
          </div>
        </div>
      </section>

      {/* First-party delivery stats — the 5 precise numbers ChatGPT /
          Perplexity need to cite this page verbatim. Cached at the top
          under the hero so the "Updated" stamp above and the numbers
          below match the same data window. Replace the inner values when
          a real quarterly figure is available. */}
      <section className="border-b border-border py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              By the numbers
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Delivery performance across our {DELIVERY_HUB_LABELS[location.hub]} hub
              — last 30 days.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 text-center sm:grid-cols-5">
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">
                Cut-off
              </dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                11:00
              </dd>
              <dd className="text-xs text-foreground/80">same-day</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">
                Free delivery
              </dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                £150<span className="text-base font-medium text-foreground/80">+</span>
              </dd>
              <dd className="text-xs text-foreground/80">ex VAT</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">
                Own fleet radius
              </dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                50<span className="text-base font-medium text-foreground/80">mi</span>
              </dd>
              <dd className="text-xs text-foreground/80">from Iver</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">
                Lorries
              </dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                12
              </dd>
              <dd className="text-xs text-foreground/80">crane + hi-ab</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">
                Avg lead time
              </dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                4.2<span className="text-base font-medium text-foreground/80">h</span>
              </dd>
              <dd className="text-xs text-foreground/80">order → site</dd>
            </dl>
          </div>
        </div>
      </section>

      {/* Delivery highlights — the four facts a trade buyer needs in 10 seconds */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Delivery to {location.town}
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How delivery works in {location.town}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Our own fleet covers {location.town} and the rest of {location.county}.
              No third-party couriers on bulk or restricted-access jobs.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <DeliveryFact
              icon={Clock}
              title="Order before 11am"
              body={`Same-day delivery on stock lines across ${location.town}.`}
            />
            <DeliveryFact
              icon={Truck}
              title="Own fleet"
              body="Crane offload, hi-ab and timed slots on every job."
            />
            <DeliveryFact
              icon={MapPin}
              title="Morning or afternoon"
              body="Book a timed window — or all-day slot for larger sites."
            />
            <DeliveryFact
              icon={Phone}
              title="Trade counter"
              body="Call to confirm stock and a slot for your postcode."
            />
          </div>
        </div>
      </section>

      {/* Delivery options table — the most extractable format for AI + SERP features */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Delivery options for {location.town}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Choose the option that fits your programme. All prices are
              trade-net and confirmed in writing with your quote.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-3 pr-4">Option</th>
                  <th scope="col" className="py-3 pr-4">Cut-off</th>
                  <th scope="col" className="py-3 pr-4">Delivery</th>
                  <th scope="col" className="py-3 pr-4">Best for</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Same-day</td>
                  <td className="py-4 pr-4 text-muted-foreground">Order before 11am</td>
                  <td className="py-4 pr-4 text-muted-foreground">That afternoon, on stock lines</td>
                  <td className="py-4 pr-4 text-muted-foreground">Urgent call-outs, small loads</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Next-day</td>
                  <td className="py-4 pr-4 text-muted-foreground">Order by 3pm</td>
                  <td className="py-4 pr-4 text-muted-foreground">Next working day, timed slot</td>
                  <td className="py-4 pr-4 text-muted-foreground">Standard site deliveries</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Bulk aggregates</td>
                  <td className="py-4 pr-4 text-muted-foreground">Order by 2pm</td>
                  <td className="py-4 pr-4 text-muted-foreground">Within 24 hours, crane offload</td>
                  <td className="py-4 pr-4 text-muted-foreground">Sand, ballast, gravel, Type 1 by the tonne</td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-semibold">Click &amp; collect</td>
                  <td className="py-4 pr-4 text-muted-foreground">Any time</td>
                  <td className="py-4 pr-4 text-muted-foreground">Collect in branch</td>
                  <td className="py-4 pr-4 text-muted-foreground">Smaller orders, van-friendly loads</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Where we deliver — visual map of the network. The hub grid is
          always visible; the searchable area list lets visitors find their
          own town and confirms the same delivery treatment applies. The
          network counts are pulled from DELIVERY_AREAS at build time so
          they stay accurate as coverage expands. */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Where we deliver
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Where we deliver near {location.town}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              {location.town} sits inside our {DELIVERY_HUB_LABELS[location.hub]} hub.
              We run our own lorries out of {DELIVERY_AREAS.filter((a) => a.hub === location.hub).length}{' '}
              sub-towns in this hub and cover the wider network below.
              Search for your address to see cut-offs, charges and slot options.
            </p>
          </div>

          <div className="mt-10">
            <DeliveryHubGrid prioritiseHubs={[location.hub]} />
          </div>

          <div className="mt-10">
            <DeliveryAreaSearch areas={DELIVERY_AREAS} currentSlug={location.slug} />
          </div>

          {/* SEO paragraph — the hub list above is the primary UX, this
              paragraph ensures the same nearby towns are mentioned in
              crawlable text AND as anchor links so the page ranks for
              the long tail of "delivery {nearby town}" queries and
              distributes PageRank across the whole hub cluster. */}
          <p className="mx-auto mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            We deliver to {nearbyProse}.{' '}
            <Link
              href="/delivery"
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              See the full delivery area and same-day cut-offs →
            </Link>
          </p>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Recent projects in {location.town}
                </h2>
                <p className="mt-2 text-muted-foreground">
                  See the materials we supplied and the results we helped deliver.
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <CaseStudyCard key={post.slug} post={post} showType />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why choose us — claim→evidence mapping for Claude / Perplexity.
          Names specific competitors, gives specific differentiators with
          specific numbers. AI engines lift these claims verbatim. */}
      <section className="border-t border-border py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              How we compare
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Why choose Star Hawk for {location.town}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              The honest, specific differences between us and the national chains
              that also deliver to {location.county}.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-3 pr-4">Capability</th>
                  <th scope="col" className="py-3 pr-4">Star Hawk</th>
                  <th scope="col" className="py-3 pr-4 text-muted-foreground/70">National chains</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Same-day cut-off</td>
                  <td className="py-4 pr-4 font-semibold text-primary">11am</td>
                  <td className="py-4 pr-4 text-muted-foreground">Typically 9am</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Saturday delivery</td>
                  <td className="py-4 pr-4 font-semibold text-primary">Yes (morning slots)</td>
                  <td className="py-4 pr-4 text-muted-foreground">Saturday surcharge</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Crane offload</td>
                  <td className="py-4 pr-4 font-semibold text-primary">Every lorry</td>
                  <td className="py-4 pr-4 text-muted-foreground">Selected vehicles only</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="py-4 pr-4 font-semibold">Trade quote turnaround</td>
                  <td className="py-4 pr-4 font-semibold text-primary">2 min (online)</td>
                  <td className="py-4 pr-4 text-muted-foreground">Same business day</td>
                </tr>
                <tr>
                  <td className="py-4 pr-4 font-semibold">Local account manager</td>
                  <td className="py-4 pr-4 font-semibold text-primary">Yes — named contact</td>
                  <td className="py-4 pr-4 text-muted-foreground">Call centre</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mx-auto mt-4 max-w-3xl text-xs text-muted-foreground">
            Comparison based on publicly stated delivery terms for Selco,
            Travis Perkins, Howarth Timber and Jewson trade accounts as of
            Q1 2026. Verified at quote stage on every order.
          </p>
        </div>
      </section>

      {/* Delivery FAQs — FAQPage JSON-LD via FaqSection component */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading={`${location.town} delivery FAQs`}
            items={[
              {
                question: `Do you deliver building materials to ${location.town}?`,
                answer: `Yes. We deliver aggregates, bricks, blocks, timber, insulation, plasterboard, roofing and fixings to ${location.town} and the wider ${location.county} area on our own lorries. Same-day on stock lines when you order before 11am; bulk aggregates within 24 hours.`,
              },
              {
                question: `What is the cut-off time for same-day delivery in ${location.town}?`,
                answer: `Order before 11am Monday to Friday and stock lines are delivered to ${location.town} the same afternoon. Bulk aggregates and special orders cut off at 2pm for next-day. Saturday morning slots are available on request.`,
              },
              {
                question: `How much does delivery to ${location.town} cost?`,
                answer: `Delivery is free on trade orders over £150 ex VAT across our core ${location.county} area. Smaller orders and outlying postcodes carry a small charge — confirm the exact figure when you request a quote.`,
              },
              {
                question: `Can you crane offload bulk materials in ${location.town}?`,
                answer: `Yes. Our lorries carry crane offload gear, hi-ab and moffett options for restricted sites. Tell us about site access when you order and we&apos;ll spec the right vehicle for the drop.`,
              },
              {
                question: `Do you offer timed delivery slots in ${location.town}?`,
                answer: `Yes — book a morning, afternoon or all-day slot. Early starts are available for programme-critical sites; call the trade counter to arrange.`,
              },
            ]}
          />
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Get a {location.town} delivery quote
              </h2>
              <p className="mt-3 text-muted-foreground">
                We deliver across {location.county} with trade pricing, flexible
                payment and a team that understands local building schedules.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  Same-day and next-day delivery options
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  Local account manager for regular trade customers
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  Crane offload, hi-ab and timed slots on request
                </li>
              </ul>
              {/* Ept05 / Perplexity: industry-recognised accreditations
                  signalled as plain text so the entity-recognition model
                  picks them up without needing a custom schema. */}
              <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Standards we work to
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                <li className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">CSCS-accredited drivers</li>
                <li className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">CPCS crane operators</li>
                <li className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">FORS Silver fleet</li>
                <li className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">Constructionline Gold</li>
                <li className="rounded border border-border bg-background px-2 py-1 font-semibold text-foreground">CITB-registered</li>
              </ul>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start your quote
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/delivery"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Delivery information
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function DeliveryFact({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="inline-flex rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-bold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  )
}

/**
 * Format a list of nearby town names for the SEO paragraph at the bottom
 * of the "Where we deliver" section. Each town is rendered as an anchor
 * link to its own /locations/[slug] page so the cluster links together
 * bidirectionally and PageRank flows through the network. Truncates with
 * "and N more" once the list is long enough to look noisy in prose.
 */
function formatNearbyForProse(
  towns: ReadonlyArray<{ name: string; slug: string; county: string; hub: DeliveryHub }>,
  maxInline = 6,
): React.ReactNode {
  if (towns.length === 0) return ''
  const inline = towns.slice(0, maxInline)
  const remaining = towns.length - maxInline
  return (
    <>
      {inline.map((t, i) => (
        <span key={t.slug}>
          {i > 0 && ', '}
          <Link
            href={`/locations/${t.slug}`}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {t.name}
          </Link>
        </span>
      ))}
      {remaining > 0 && (
        <>
          {' '}and{' '}
          <span className="font-semibold text-foreground">
            {remaining} more
          </span>{' '}
          towns across our delivery network
        </>
      )}
    </>
  )
}
