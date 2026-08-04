// app/locations/page.tsx
// Index of all delivery areas. Every /locations/[town] page links back to
// here, so this is the canonical hub for local-SEO crawl discovery.
//
// Shows both case-study towns (richer content, higher priority) and
// delivery-only towns (long-tail "delivery {town}" intent). Case-study
// towns are tagged with their project count so visitors can spot them.

import type { Metadata } from 'next'
import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { listLocationTowns } from '@/lib/blog/loader'
import { listLocationSlugs } from '@/lib/locations'
import {
  DELIVERY_AREAS,
  DELIVERY_HUB_LABELS,
} from '@/lib/delivery-areas'
import { canonical } from '@/lib/seo/company-seo'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { FaqSection } from '@/components/seo/FaqSection'
import { JsonLd } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: {
    absolute: 'Delivery Areas & Local Projects | Star Hawk Builders Merchant',
  },
  description:
    'See builders merchant delivery areas and local building projects near you. Same-day building materials across 900+ towns in the South East, Greater London, north Essex, north Kent, Sussex, Hampshire and Oxfordshire.',
  alternates: {
    canonical: canonical('locations'),
  },
  openGraph: {
    title: 'Delivery Areas & Local Projects | Star Hawk Builders Merchant',
    description:
      'Browse building materials delivery and recent projects across 900+ towns in the South East.',
    url: canonical('locations'),
    type: 'website',
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/hero-1-4kgen.webp`],
  },
}

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export default function LocationsIndexPage() {
  const caseStudyTowns = listLocationTowns()
  const projectCountBySlug = new Map(caseStudyTowns.map((t) => [t.slug, t.postCount]))

  // Every delivery town from the canonical list, sorted alphabetically.
  // This includes case-study towns AND delivery-only towns so the index
  // page links to every /locations/[town] page in the network.
  const allTowns = Array.from(new Set(listLocationSlugs()))
    .map((slug) => DELIVERY_AREAS.find((a) => a.slug === slug))
    .filter((a): a is NonNullable<typeof a> => a !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Count by hub for the "hero stats" strip at the top.
  const hubCounts = new Map<string, number>()
  for (const a of DELIVERY_AREAS) {
    hubCounts.set(a.hub, (hubCounts.get(a.hub) ?? 0) + 1)
  }
  const totalAreas = DELIVERY_AREAS.length
  const totalHubs = hubCounts.size

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Delivery areas' }]} />
      </div>
      <section className="border-b border-border bg-muted/30 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Delivery areas &amp; local projects
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Browse building materials delivery and recent projects by town. We
              supply trade and domestic customers across {totalAreas} towns and{' '}
              {totalHubs} delivery hubs in the South East, Greater London, north
              Essex, north Kent, Sussex, Hampshire and Oxfordshire. All
              deliveries run on our own lorries out of the Iver yard.
            </p>
          </div>
        </div>
      </section>

      {/* Hero stats strip — gives Google a quick structured summary of the
          page's scope, and gives visitors a confidence signal that the
          network is large. */}
      <section className="border-b border-border py-8 sm:py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ul className="grid grid-cols-2 gap-6 text-center sm:grid-cols-4">
            <li>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                {totalAreas}+
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Delivery areas
              </p>
            </li>
            <li>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                {totalHubs}
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Delivery hubs
              </p>
            </li>
            <li>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                50mi
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Own-fleet radius
              </p>
            </li>
            <li>
              <p className="text-2xl font-bold text-foreground sm:text-3xl">
                11am
              </p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Same-day cut-off
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                All delivery areas
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {allTowns.length} towns across the network. Case-study towns
                show recent local projects; delivery-only towns cover the same
                service area with delivery FAQs and slot info.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {allTowns.map((area) => {
              const projectCount = projectCountBySlug.get(area.slug) ?? 0
              return (
                <Link
                  key={area.slug}
                  href={`/locations/${area.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {area.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {area.county}
                      </p>
                    </div>
                  </div>
                  {projectCount > 0 ? (
                    <span
                      className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                      title={`${projectCount} local project${projectCount === 1 ? '' : 's'}`}
                    >
                      {projectCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Hub legend — quick visual map of which hub each town falls under.
          This is also internal-link-dense, so it helps spread PageRank
          across the whole hub cluster. */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Browse by delivery hub
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Our {totalHubs} hubs each run their own lorry routes out of Iver,
            anchored on a major city.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {Array.from(hubCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([hub, count]) => (
                <li key={hub}>
                  <Link
                    href={`/locations/${
                      DELIVERY_AREAS.find((a) => a.hub === hub)?.slug ?? 'slough'
                    }`}
                    className="block rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm"
                  >
                    <p className="font-bold text-foreground">
                      {DELIVERY_HUB_LABELS[hub as keyof typeof DELIVERY_HUB_LABELS]}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {count} sub-towns in this hub
                    </p>
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      </section>

      {/* FAQ section — 4 long-tail questions that match the queries
          visitors land on the index for. Each renders as both visible
          content AND a FAQPage JSON-LD via FaqSection, so Google can
          pull these into rich snippets for the index. */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading="Delivery areas — common questions"
            items={[
              {
                question: 'Which areas do you deliver building materials to?',
                answer: `We deliver across ${totalAreas} towns grouped into ${totalHubs} delivery hubs — Slough, High Wycombe, Reading, Guildford, Basingstoke, Oxford, Swindon, City of London, Luton, Chelmsford, Maidstone, Brighton and Southampton. Every town has its own /locations page with delivery FAQs, slot times and pricing.`,
              },
              {
                question: 'How quickly can you deliver to my town?',
                answer: 'Same-day on stock lines when you order before 11am, in any town within 25 miles of our Iver yard. Outlying towns up to 50 miles are next-day for stock and within 24 hours for bulk aggregates. Each /locations/[town] page shows the exact cut-off for that area.',
              },
              {
                question: 'Is there a minimum order for free delivery?',
                answer: 'Free delivery on trade orders over £150 ex VAT across our core counties. Smaller orders and outlying postcodes carry a small charge — confirm the exact figure when you request a quote.',
              },
              {
                question: 'Can I book a timed delivery slot?',
                answer: 'Yes — book a morning, afternoon or all-day slot on every delivery. Early starts are available for programme-critical sites; call the trade counter to arrange.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
