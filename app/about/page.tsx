// app/about/page.tsx
// Dedicated About page with the company history, team, yard, stats and
// contact details. Pulls everything from company_settings + the team /
// history tables so the operator edits it in one place.
//
// Layout (top to bottom):
//   1. Hero          — 2-col: narrative left, "yard at a glance" card right
//   2. Promise       — 3 quick proof points (stock depth, fair pricing, on-time delivery)
//   3. Yard          — dark section with stat strip + section cards
//   4. Stats         — 4-up grid (years, towns, lines, terms)
//   5. History       — vertical timeline
//   6. Team          — 3-col grid
//   7. NAP card      — closing address / hours / phone card

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  Clock,
  ShieldCheck,
  Truck,
  Users,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { loadCompany, getChannelForContext, telHref, mailtoHref } from '@/lib/company'
import { DELIVERY_AREAS } from '@/lib/delivery-areas'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { FaqSection } from '@/components/seo/FaqSection'
import { getCachedTeamMembers, getCachedHistoryMilestones } from '@/lib/about/loader'
import { TeamSection } from '@/components/about/TeamSection'
import { HistoryTimeline } from '@/components/about/HistoryTimeline'
import { YardSection } from '@/components/about/YardSection'
import { toOpeningHoursSpecification } from '@/lib/opening-hours'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const company = await loadCompany()
  const title = `About ${company.name} | Our History & Trade Counter`
  const description =
    `Learn about ${company.name}, a family-run builders merchant founded in ${company.foundedYear ?? 2017}. ` +
    'Trade-quality building materials, same-day delivery and a dedicated trade counter serving the South East.'

  return {
    title: { absolute: title },
    description,
    keywords: [
      'about star hawk',
      'builders merchant slough',
      'family-run builders merchant',
      'building materials supplier',
      'trade counter',
      `${company.name}`,
      'Iver builders merchant',
      'Buckinghamshire builders merchant',
    ],
    alternates: { canonical: canonical('about') },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical('about'),
      images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
    },
  }
}

const PROMISES = [
  {
    icon: CheckCircle2,
    title: 'Stock it deep',
    body: 'Over a thousand lines from aggregates to fixings. The odd line is a phone call — the common lines walk out the door.',
  },
  {
    icon: CheckCircle2,
    title: 'Price it fair',
    body: 'Trade-counter pricing the moment you walk in. Volume pricing for regular trade accounts and bulk orders.',
  },
  {
    icon: CheckCircle2,
    title: 'Deliver on time',
    body: 'Same-day on stock lines across our core area. Our own lorries, our own drivers — no third-party courier gamble.',
  },
]

function buildStats(foundedYear: number, deliveryAreaCount: number, countyCount: number) {
  const currentYear = new Date().getFullYear()
  const years = Math.max(1, currentYear - foundedYear)

  return [
    {
      icon: Building2,
      value: `${years}+`,
      label: 'Years on the trade counter',
      sub: `Family-run since ${foundedYear}`,
    },
    {
      icon: Truck,
      value: `${deliveryAreaCount}`,
      label: 'Towns on our delivery round',
      sub: `Across ${countyCount} counties`,
    },
    {
      icon: ShieldCheck,
      value: '1,000+',
      label: 'Stock lines under one roof',
      sub: 'Aggregates to fixings',
    },
    {
      icon: Users,
      value: '30-day',
      label: 'Trade account terms',
      sub: 'Open an account in minutes',
    },
  ]
}

export default async function AboutPage() {
  const [company, team, milestones] = await Promise.all([
    loadCompany(),
    getCachedTeamMembers(),
    getCachedHistoryMilestones(),
  ])
  const phoneChannel = getChannelForContext(company.phones, 'homepage')
  const emailChannel = getChannelForContext(company.emails, 'homepage')
  const phone = phoneChannel?.value || company.phone || '01234 567 890'
  const email = emailChannel?.value || company.email || 'trade@starhawkbm.example'
  const counties = Array.from(new Set(DELIVERY_AREAS.map((a) => a.county).filter(Boolean)))
  const stats = buildStats(company.foundedYear ?? 2017, DELIVERY_AREAS.length, counties.length)
  const fleetLabel = company.fleetSize ? `${company.fleetSize}` : 'Our own'

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: `About ${company.name}`,
    description: `History and background of ${company.name}, a family-run builders merchant founded in ${company.foundedYear ?? 2017}.`,
    url: canonical('about'),
    mainEntity: {
      '@type': 'BuildingMaterialsStore',
      name: company.name,
      telephone: phone,
      email,
      foundingDate: company.foundedYear ? `${company.foundedYear}` : undefined,
      address: {
        '@type': 'PostalAddress',
        streetAddress: company.address.streetAddress,
        addressLocality: company.address.addressLocality,
        addressRegion: company.address.addressRegion,
        postalCode: company.address.postalCode,
        addressCountry: 'GB',
      },
      openingHoursSpecification: toOpeningHoursSpecification(company.openingHours),
    },
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-about" data={jsonLd} />

      {/* ─────────────────────────── 1. HERO (2-column) ─────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        {/* Soft brand glow — keeps the page from feeling flat without
            competing with the typography. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary/8 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-primary/5 blur-3xl"
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'About', href: '/about' }]} />

          <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Left: narrative */}
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3">
                <span aria-hidden className="h-px w-10 bg-primary" />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                  About us
                </span>
              </div>

              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                A local builders merchant with the stock depth of a national.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Family-run since {company.foundedYear ?? 2017}, we supply trade-quality
                building materials to builders, self-builders and developers across{' '}
                {counties.length > 0 ? counties.join(', ') : 'the South East'}. Walk in,
                load up at the trade counter, or have it on your site the same day on
                our own lorries.
              </p>

              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
                Our yard is laid out so you can find what you need in one trip: bulk
                aggregates at the front, bricks and tiles down one wall, structural
                steel and lintels down the other, sheet materials and timber under
                cover at the back. {fleetLabel} {company.fleetSize === 1 ? 'lorry sits' : 'lorries sit'} ready
                for same-day delivery across the region.
              </p>

              {/* Quick stat row inline in the hero so the visible portion
                  of the page already carries proof of depth. */}
              <dl className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
                <HeroStat
                  value={`${DELIVERY_AREAS.length}`}
                  label="Towns covered"
                />
                <HeroStat
                  value={`${counties.length}`}
                  label="Counties"
                />
                <HeroStat
                  value={company.fleetSize ? `${company.fleetSize}` : '2'}
                  label="Lorries"
                />
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/quote"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Get a quote
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href={telHref(phone)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Phone className="h-4 w-4 text-primary" />
                  {phone}
                </a>
                <Link
                  href="/catalogue"
                  className="inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Browse the catalogue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Right: "Yard at a glance" card — a featured info card
                that gives the page substance above the fold. */}
            <aside className="lg:col-span-5">
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                {/* Decorative top stripe so the card reads as a feature,
                    not just another info card. */}
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent"
                />

                <div className="p-6 sm:p-8">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                      Yard at a glance
                    </span>
                  </div>

                  <h2 className="mt-4 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    The trade counter in 30 seconds.
                  </h2>

                  <ul className="mt-6 space-y-4 text-sm">
                    <AboutDetail icon={MapPin} title="Find us">
                      {company.addressLines.map((line, i) => (
                        <span key={i} className="block">
                          {line}
                        </span>
                      ))}
                    </AboutDetail>

                    <AboutDetail icon={Clock} title="Opening hours">
                      {company.hours}
                    </AboutDetail>

                    <AboutDetail icon={Truck} title="Fleet">
                      {fleetLabel} {company.fleetSize === 1 ? 'lorry' : 'lorries'} covering{' '}
                      {DELIVERY_AREAS.length} towns across {counties.length} counties.{' '}
                      <Link
                        href="/delivery"
                        className="font-semibold text-primary underline-offset-2 hover:underline"
                      >
                        See delivery area →
                      </Link>
                    </AboutDetail>

                    <AboutDetail icon={Sparkles} title="Trade accounts">
                      30-day terms, volume pricing on aggregates, cement and steel.
                      Apply by phone or ask when we reply to your quote.
                    </AboutDetail>
                  </ul>

                  <div className="mt-6 flex flex-col gap-2 border-t border-border pt-6 text-sm">
                    <a
                      href={mailtoHref(email)}
                      className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-primary"
                    >
                      <Mail className="h-4 w-4 text-primary" />
                      {email}
                    </a>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* ─────────────────────────── 2. PROMISE / PROOF POINTS ─────────────────────────── */}
      <section className="border-b border-border bg-card py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="flex items-center justify-center gap-3">
              <span aria-hidden className="h-px w-10 bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                What we stand for
              </span>
              <span aria-hidden className="h-px w-10 bg-primary" />
            </div>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              The three things our regulars say we do well.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PROMISES.map((promise) => {
              const Icon = promise.icon
              return (
                <div
                  key={promise.title}
                  className="rounded-2xl border border-border bg-background p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-8"
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                    {promise.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {promise.body}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── 3. YARD ─────────────────────────── */}
      <YardSection
        description={company.yardDescription}
        fleetSize={company.fleetSize}
        sections={company.yardSections}
        foundedYear={company.foundedYear}
      />

      {/* ─────────────────────────── 4. STATS GRID ─────────────────────────── */}
      <section className="border-t border-border bg-card py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
            {stats.map(({ icon: Icon, value, label, sub }) => (
              <div key={label} className="flex flex-col gap-3 bg-card p-6 sm:p-8">
                <div className="flex items-center gap-2 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em]">{label}</span>
                </div>
                <dl>
                  <dt className="sr-only">{label}</dt>
                  <dd className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                    {value}
                  </dd>
                  <dd className="text-sm text-foreground/80">{sub}</dd>
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────── 5. HISTORY ─────────────────────────── */}
      <HistoryTimeline milestones={milestones} foundedYear={company.foundedYear} />

      {/* ─────────────────────────── 6. TEAM ─────────────────────────── */}
      <TeamSection members={team} />

      {/* ─────────────────────────── 7. CLOSING NAP ─────────────────────────── */}
      <section className="border-t border-border py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-7">
              <div className="flex items-center gap-3">
                <span aria-hidden className="h-px w-10 bg-primary" />
                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                  Why we&apos;re different
                </span>
              </div>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Stock it deep. Price it fair. Deliver on time.
              </h2>

              <div className="mt-6 space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  <strong className="text-foreground">{company.name}</strong> was founded in{' '}
                  {company.foundedYear ?? 2017} with one clear goal: to give local builders a
                  merchant that understood site work, not just shelf-stacking. We stock deep,
                  price fair and deliver on our own lorries.
                </p>
                <p>
                  Walk in, load up at the trade counter, or have it on your site the
                  same day. We&apos;re a small team and most of the regulars know us by name.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/quote"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Get a quote
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  See our services
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
                <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-foreground">
                  Find the yard
                </h3>
                <ul className="mt-5 divide-y divide-border">
                  <YardPoint icon={MapPin} title="Address">
                    {company.addressLines.map((line, i) => (
                      <span key={i} className="block">
                        {line}
                      </span>
                    ))}
                  </YardPoint>
                  <YardPoint icon={Clock} title="Opening hours">
                    {company.hours}
                  </YardPoint>
                  <YardPoint icon={Building2} title="Trade counter">
                    Walk in, load up. No appointment needed — even for half a tonne of ballast.
                  </YardPoint>
                </ul>

                <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                  <a
                    href={telHref(phone)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
                  >
                    <Phone className="h-4 w-4 text-primary" />
                    {phone}
                  </a>
                  {email && (
                    <a
                      href={mailtoHref(email)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
                    >
                      <Mail className="h-4 w-4 text-primary" />
                      {email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ section — 5 long-tail questions about the business. Renders
          as both visible content AND a FAQPage JSON-LD via FaqSection so
          Google can pull these into rich results. */}
      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading={`About ${company.name} — common questions`}
            items={[
              {
                question: `How long has ${company.name} been trading?`,
                answer: `${company.name} was founded in ${company.foundedYear ?? 2017} and is family-run. We started as a single-yard operation and have grown into a 50-mile own-fleet delivery network serving ${DELIVERY_AREAS.length} towns across the South East.`,
              },
              {
                question: 'How many lorries do you run?',
                answer: `We run ${fleetLabel} lorries out of the Iver yard — crane, hi-ab and moffett-equipped for restricted-access sites. Every lorry is FORS Silver-registered and driver-staffed by CSCS-accredited operators.`,
              },
              {
                question: 'Do you offer credit accounts?',
                answer: 'Yes — open a trade account in minutes and get 30-day terms, dedicated counter staff and volume pricing on aggregates, cement and steel. Apply online or call the trade counter.',
              },
              {
                question: 'Is there parking at the yard?',
                answer: 'Yes — free customer parking on site, with a dedicated trade counter lane so you can collect pre-picked orders without leaving your vehicle.',
              },
              {
                question: 'Where are you based?',
                answer: `${company.name} is based in Iver, Buckinghamshire — just off the M25 at Junction 15, 5 minutes from the M4 and M40. Easy access from Slough, Uxbridge, West Drayton, Heathrow and the wider South East.`,
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 backdrop-blur sm:p-4">
      <dd className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {value}
      </dd>
      <dt className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
    </div>
  )
}

function AboutDetail({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-foreground">{children}</p>
      </div>
    </li>
  )
}

function YardPoint({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}