// app/delivery/page.tsx
// Delivery information page: coverage, cut-off times, vehicle types and
// restricted-access guidance. Targets "delivery" and "same-day" searches.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Truck, Clock, MapPin, Phone, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { FaqSection } from '@/components/seo/FaqSection'
import { DeliveryAreaSearch } from '@/components/locations/DeliveryAreaSearch'
import { DELIVERY_AREAS } from '@/lib/delivery-areas'
import { loadCompany, getChannelForContext, telHref } from '@/lib/company'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: { absolute: 'Delivery Information | Same-Day Materials' },
  description:
    'Same-day and next-day delivery of building materials across 935+ towns. Crane offload, hi-ab and timed slots. Free over £150 ex VAT.',
  keywords: [
    'builders merchant delivery',
    'same day delivery building materials',
    'building materials delivery',
    'aggregates delivery',
    'crane offload delivery',
    'timed delivery slots',
    'Iver yard delivery',
    'trade delivery Slough',
  ],
  alternates: { canonical: canonical('delivery') },
  openGraph: {
    title: 'Delivery Information | Same-Day Materials',
    description:
      'Same-day and next-day building material delivery across 935+ towns in the South East. Crane offload, hi-ab and timed slots.',
    url: canonical('delivery'),
    type: 'website',
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

export default async function DeliveryPage() {
  const company = await loadCompany()
  const phone = getChannelForContext(company.phones, 'homepage')?.value || company.phone || '01753 555 012'
  const counties = Array.from(new Set(DELIVERY_AREAS.map((a) => a.county)))

  // Service JSON-LD marks the page as a service hub rather than a
  // generic WebPage. `areaServed` is a county-level list (same
  // trade-off as the home page — 935 cities blows up the JSON-LD
  // payload and Google warns against >100 nodes per block).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: 'Building materials delivery',
    serviceType: 'Building materials delivery',
    description: 'Same-day and next-day building material delivery across 935+ towns in the South East. Crane offload, hi-ab and timed slots. Free over £150 ex VAT.',
    url: canonical('delivery'),
    areaServed: counties.map((county) => ({
      '@type': 'AdministrativeArea',
      name: county,
      addressCountry: 'GB',
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-delivery" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Delivery', href: '/delivery' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Delivery
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Building materials delivered when you need them.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Same-day on stock lines across our core area. Next-day for
              outlying towns and bulk aggregates.
            </p>
          </div>
        </div>
      </section>

      {/* By the numbers — 5 precise stats ChatGPT / Perplexity pick up
          as quotable facts. Cached at the top of the page under the
          hero so the numbers are above the fold. */}
      <section className="border-b border-border py-10 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              By the numbers
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Delivery performance across the 50-mile own-fleet network.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-x-6 gap-y-8 text-center sm:grid-cols-5">
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">Cut-off</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">11:00</dd>
              <dd className="text-xs text-foreground/80">same-day</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">Free delivery</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">£150<span className="text-base font-medium text-foreground/80">+</span></dd>
              <dd className="text-xs text-foreground/80">ex VAT</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">Own fleet radius</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">50<span className="text-base font-medium text-foreground/80">mi</span></dd>
              <dd className="text-xs text-foreground/80">from Iver</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">Towns</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">935+</dd>
              <dd className="text-xs text-foreground/80">13 hubs</dd>
            </dl>
            <dl>
              <dt className="text-xs font-medium uppercase tracking-wider text-foreground/80">Avg lead time</dt>
              <dd className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">4.2<span className="text-base font-medium text-foreground/80">h</span></dd>
              <dd className="text-xs text-foreground/80">order → site</dd>
            </dl>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard icon={Clock} title="Same-day cut-off">
              Order before 11am for same-day delivery on stock lines across
              Greater London, Berkshire, Buckinghamshire and Surrey.
            </InfoCard>
            <InfoCard icon={Truck} title="Own fleet">
              Our own lorries mean we control the schedule. No third-party
              couriers for bulk or restricted-access jobs.
            </InfoCard>
            <InfoCard icon={MapPin} title="Timed slots">
              Book morning, afternoon or all-day slots. Early starts available
              for programme-critical sites.
            </InfoCard>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What we can deliver
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  'Bulk aggregates by the tonne — sharp sand, ballast, gravel, Type 1',
                  'Bricks, blocks, cement and mortar materials',
                  'Timber, sheet materials and engineered wood',
                  'Insulation, plasterboard, roofing and steel',
                  'Drainage, DPC, fixings and landscaping supplies',
                  'Crane-offload, hi-ab and moffett deliveries on request',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Areas we cover
              </h2>
              <p className="mt-4 text-muted-foreground">
                We deliver across {counties.length} counties and {DELIVERY_AREAS.length} towns,
                anchored on our Iver yard. Core towns are typically same-day;
                outlying areas are next-day.
              </p>
              <div className="mt-6">
                <DeliveryAreaSearch areas={DELIVERY_AREAS} phone={phone} />
              </div>
            </div>
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Need to book a delivery slot?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Call the trade counter or build a quote online and we&apos;ll confirm availability.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={telHref(phone)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  <Phone className="h-4 w-4" />
                  Call us
                </a>
                <Link
                  href="/quote"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Get a quote
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Delivery checklist
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80 sm:text-base">
              A few minutes of preparation keeps your delivery on schedule and
              avoids redelivery charges.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                'Order stock lines before 11am for same-day delivery.',
                'Confirm site access: gate width, turning space and offload area.',
                'Book crane, hi-ab or moffett offload if the drop point is not tail-lift accessible.',
                'Let us know about site restrictions, timed closures or required PPE.',
                'Have someone available to sign the delivery note and check the load.',
                'For loose aggregates, make sure the drop zone is clear of parked vehicles and overhead cables.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-foreground/80">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <FaqSection
            heading="Delivery FAQs"
            items={[
              {
                question: 'What time do I need to order by for same-day delivery?',
                answer:
                  'Orders placed before 11am on stock lines are typically delivered same-day across our core coverage area. Bulk aggregates and special orders may be next-day.',
              },
              {
                question: 'Do you deliver to building sites?',
                answer:
                  'Yes. We deliver directly to site with our own lorries. Crane-offload, hi-ab and moffett options are available where access is tight.',
              },
              {
                question: 'Can I book a timed delivery slot?',
                answer:
                  'Yes. We offer morning, afternoon and all-day slots. Early starts are available for programme-critical sites.',
              },
              {
                question: 'What areas do you cover?',
                answer:
                  'We deliver across Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire and Wiltshire. Core towns are usually same-day; outlying areas are next-day.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="inline-flex rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</p>
    </div>
  )
}
