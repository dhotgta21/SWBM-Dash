// app/sustainability/page.tsx
// Eco-friendly and sustainable building materials page.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Leaf, Recycle, Truck, ArrowRight, CheckCircle2, HelpCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: { absolute: 'Sustainable Building Materials | Eco Supplies' },
  description:
    'Eco-friendly building materials: FSC timber, recycled aggregate, low-carbon insulation, EPD reporting. Trade supply across the South East.',
  keywords: [
    'sustainable building materials',
    'FSC timber',
    'recycled aggregate',
    'low-carbon insulation',
    'eco-friendly building supplies',
    'EPD reporting',
    'ISO 14001 builders merchant',
    'green building materials',
  ],
  alternates: { canonical: canonical('sustainability') },
  openGraph: {
    title: 'Sustainable Building Materials | Eco Supplies',
    description:
      'Eco-friendly building materials: FSC timber, recycled aggregate, low-carbon insulation, EPD reporting. Trade supply across the South East.',
    url: canonical('sustainability'),
    type: 'website',
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

export default function SustainabilityPage() {
  // 4 services wrapped in an ItemList so Google can pull the
  // sustainability offerings as rich results. The "ListItem" items
  // each carry a full Service block so the schema is self-describing.
  const services = [
    {
      name: 'FSC-certified timber',
      description: 'All carcassing, sheet and cladding timber is sourced from FSC-certified suppliers with chain-of-custody paperwork on request.',
      icon: 'leaf',
    },
    {
      name: 'Recycled aggregate',
      description: 'Crushed concrete, brick and reclaimed stone available as a direct substitute for primary Type 1 sub-base on most jobs.',
      icon: 'recycle',
    },
    {
      name: 'Low-carbon insulation',
      description: 'Sheep\'s wool, hemp, PIR and recycled-plasterboard insulation stocked alongside standard mineral wool. EPDs available on request.',
      icon: 'leaf',
    },
    {
      name: 'EPD reporting for trade',
      description: 'Environmental Product Declarations supplied for every stocked line on request — useful for BREEAM, LEED and Passivhaus projects.',
      icon: 'recycle',
    },
  ]
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Sustainable building materials services',
    description: 'Eco-friendly building materials and sustainable trade supplies.',
    url: canonical('sustainability'),
    itemListElement: services.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Service',
        name: s.name,
        description: s.description,
        provider: { '@type': 'Organization', name: 'Star Hawk Builders Merchant' },
        areaServed: 'GB',
      },
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-sustainability" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Sustainability', href: '/sustainability' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Sustainability
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Build better, waste less.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Eco-friendly and responsibly sourced building materials for
              modern, lower-carbon construction.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <InfoCard
              icon={Recycle}
              title="Recycled aggregates"
              description="Crushed concrete, recycled Type 1 and reclaimed ballast for fills, sub-bases and drainage."
            />
            <InfoCard
              icon={Leaf}
              title="Responsibly sourced timber"
              description="FSC and PEFC-certified carcassing, CLS, plywood and sheet materials."
            />
            <InfoCard
              icon={Truck}
              title="Lower-impact logistics"
              description="Efficient delivery routing and bulk drops to reduce lorry miles per tonne."
            />
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Need EPDs or chain-of-custody paperwork?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80 sm:text-base">
                  We can supply Environmental Product Declarations, FSC certificates
                  and recycled-content documentation for tender returns, BREEAM
                  and Passivhaus projects.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Request documentation
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              How we source responsibly
            </h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              We choose suppliers who can prove chain-of-custody for timber, recycled content for
              aggregates and third-party certification for insulation. That means FSC or PEFC
              paperwork for carcassing and sheet materials, EN standards for insulation performance,
              and crushed concrete gradings that match primary Type 1 for the right applications.
            </p>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Our buying team also looks at transport miles and packaging. Where possible we take
              bulk drops with less wrap, order full loads to reduce lorry movements, and return or
              recycle pallets. The result is a yard that can supply lower-impact materials without
              compromising the strength, durability or programme of a normal build.
            </p>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What we stock
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  'Recycled MOT Type 1 and 6F2 crushed concrete',
                  'Reclaimed and secondary aggregates',
                  'Low-carbon cement alternatives where available',
                  'FSC-certified timber and plywood',
                  'Insulation with high thermal performance',
                  'Drainage products made from recycled plastic',
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
                Why it matters
              </h2>
              <p className="mt-4 text-muted-foreground">
                Construction accounts for a significant share of UK material use
                and waste. Choosing recycled aggregates, certified timber and
                efficient insulation helps reduce embodied carbon, cut landfill
                and meet tighter building regulations.
              </p>
              <p className="mt-4 text-muted-foreground">
                Our team can help you specify lower-impact alternatives without
                compromising on strength, durability or programme.
              </p>

              <div className="mt-8">
                <Link
                  href="/quote"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Request a sustainable quote
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Sustainability FAQs
            </h2>
            <dl className="mt-8 space-y-4">
              {[
                {
                  q: 'Are your timber products certified?',
                  a: 'Yes. Our carcassing, sheet materials and cladding are sourced from FSC or PEFC-certified suppliers. Chain-of-custody certificates are available on request.',
                },
                {
                  q: 'Can recycled aggregate replace primary Type 1?',
                  a: 'Recycled MOT Type 1 and 6F2 crushed concrete are suitable for many sub-base, fill and hardstanding applications. We can advise when primary aggregate is required by specification.',
                },
                {
                  q: 'Do you supply EPDs?',
                  a: 'Environmental Product Declarations are available on request for stocked insulation, cement, timber and sheet-material lines.',
                },
                {
                  q: 'How do you reduce delivery emissions?',
                  a: 'We plan multi-drop routes, carry full loads where possible and use crane or hi-ab offload to reduce secondary handling and vehicle movements on site.',
                },
              ].map(({ q, a }, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <dt className="flex items-start gap-3 text-base font-semibold text-foreground">
                    <HelpCircle
                      className="h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {q}
                  </dt>
                  <dd className="mt-2 text-sm leading-relaxed text-foreground/80">
                    {a}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </div>
  )
}

function InfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="inline-flex rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
    </div>
  )
}
