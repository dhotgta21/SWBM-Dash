// app/services/page.tsx
// Trade services index. Surfaces the four specialist services with a
// strong hero, a clear 3-step process, clickable cards and a bottom CTA.
//
// JSON-LD: an ItemList wrapping the 4 Service entries (R03: comparison
// schema makes the page more likely to surface as a carousel / list
// rich result), a BreadcrumbList, and a FAQPage with the 3 most-
// searched service questions.

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight,
  Layers,
  ClipboardList,
  Truck,
  CreditCard,
  Phone,
  Mail,
  FileText,
  Search,
  CheckCircle2,
} from 'lucide-react'
import { SERVICES } from '@/lib/services/data'
import { loadCompany, getChannelForContext, telHref, mailtoHref } from '@/lib/company'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { FaqSection } from '@/components/seo/FaqSection'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'

export const metadata: Metadata = {
  title: {
    absolute: 'Trade Services | Brick Matching & Estimating',
  },
  description:
    'Trade services: brick matching, material estimating, site delivery and 30-day credit accounts for builders and developers across the South East.',
  keywords: [
    'brick matching service',
    'building materials estimating',
    'trade credit accounts',
    'site delivery builders merchant',
    'take-off estimating service',
    'builders merchant services',
    'south east building services',
  ],
  alternates: { canonical: canonical('services') },
  openGraph: {
    title: 'Trade Services | Brick Matching & Estimating',
    description:
      'Brick matching, take-off estimating, site delivery and trade credit accounts for builders and developers.',
    type: 'website',
    url: canonical('services'),
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

export const dynamic = 'force-dynamic'

async function getCompany() {
  try {
    return await loadCompany()
  } catch {
    return null
  }
}

const SERVICE_ICONS = {
  layers: Layers,
  'clipboard-list': ClipboardList,
  truck: Truck,
  'credit-card': CreditCard,
}

const STEPS = [
  {
    icon: FileText,
    title: 'Send your plans or sample',
    body: 'Upload drawings, schedules or a brick sample and tell us what you need.',
  },
  {
    icon: Search,
    title: 'We price and source',
    body: 'Our team quantities the job, finds the closest match and sends trade pricing.',
  },
  {
    icon: Truck,
    title: 'Delivered to site',
    body: 'We book a timed slot and deliver on our own lorries across the South East.',
  },
]

export default async function ServicesIndexPage() {
  const company = await getCompany()
  const phoneValue = getChannelForContext(company?.phones ?? [], 'homepage')?.value ?? company?.phone
  const phone = phoneValue ?? 'Call the trade counter'
  const phoneHref = phoneValue ? telHref(phoneValue) : 'tel:'
  const emailValue = getChannelForContext(company?.emails ?? [], 'homepage')?.value ?? company?.email
  const email = emailValue ?? 'trade@starhawkbm.com'
  const emailHref = mailtoHref(email, 'Trade services enquiry')

  // ItemList schema wrapping the 4 services so the page can surface as
  // a list / carousel rich result. The Service block on each list item
  // is what Google uses to populate "Brick matching near {town}".
  const servicesJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Trade services from Demo Builder Merchant',
    description: 'Four specialist trade services for builders and developers.',
    url: canonical('services'),
    itemListElement: SERVICES.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Service',
        name: s.title,
        description: s.description,
        provider: { '@type': 'Organization', name: 'Demo Builder Merchant' },
        areaServed: 'GB',
        url: canonical(`services/${s.slug}`),
      },
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-services" data={servicesJsonLd} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <Breadcrumbs items={[{ label: 'Services', href: '/services' }]} />
      </div>
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-foreground text-background">
        <div
          aria-hidden="true"
          className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-20 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex items-center justify-center gap-3">
              <span aria-hidden className="h-px w-10 bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                Trade services
              </span>
              <span aria-hidden className="h-px w-10 bg-primary" />
            </div>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Specialist services for builders & developers.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-white/75 sm:text-lg">
              Beyond the stock list: brick matching, take-off estimating, site delivery
              and trade credit accounts — all under one roof.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover"
              >
                Request a service
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href={phoneHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-base font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/10"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {phone}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-b border-border bg-card py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, idx) => (
              <div key={title} className="relative flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Step {idx + 1}
                  </p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight text-foreground">
                    {title}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service cards */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              What we offer
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Built to save time on site.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Tap any service to see exactly what is included, typical turnaround times
              and how to get started.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {SERVICES.map((service) => {
              const Icon = SERVICE_ICONS[service.icon]
              return (
                <Link
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg sm:p-8"
                >
                  <div>
                    <div className="inline-flex rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                      {service.shortTitle}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {service.description}
                    </p>

                    <ul className="mt-5 space-y-2">
                      {service.features.slice(0, 3).map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                    {service.cta.label}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 rounded-2xl border border-border bg-card p-8 shadow-sm sm:flex-row sm:p-10">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                Not sure which service you need?
              </h2>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Call the trade counter or send your enquiry and we will point you to the
                right service — or quote the materials directly.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Get a quote
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href={emailHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — 3 questions matching the 3 most-searched service queries.
          Renders visible content + FAQPage JSON-LD via FaqSection. */}
      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading="Trade services FAQs"
            items={[
              {
                question: 'How does the brick matching service work?',
                answer: 'Send a photo of the existing brickwork and we will match against our stocked range of 30+ UK brick manufacturers. We usually return a shortlist of 2-3 close matches within 24 hours, with sample panels available for trade customers.',
              },
              {
                question: 'How long does a take-off estimate take?',
                answer: 'A typical 3-bed extension take-off is returned in 2-3 working days. Larger commercial take-offs depend on scope — we will confirm the lead time on receipt. Estimates are written, with line-by-line quantities and current trade pricing.',
              },
              {
                question: 'Do you offer 30-day credit terms?',
                answer: 'Yes — open a trade account in minutes and get 30-day terms on aggregate, cement and steel. Credit decisions are usually same-business-day and the account is free of charge.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
