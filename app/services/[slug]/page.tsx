// app/services/[slug]/page.tsx
// Dedicated trade service landing page. Targets long-tail keywords like
// "brick matching service Berkshire" and supports the main commercial funnel.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check, HelpCircle, Layers, ClipboardList, Truck, CreditCard } from 'lucide-react'
import { getServiceBySlug, listServiceSlugs, SERVICES } from '@/lib/services/data'
import { loadCompany, getChannelForContext, telHref } from '@/lib/company'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { JsonLd } from '@/components/seo/JsonLd'

const SERVICE_ICONS = {
  layers: Layers,
  'clipboard-list': ClipboardList,
  truck: Truck,
  'credit-card': CreditCard,
}

interface PageProps {
  readonly params: Promise<{ slug: string }>
}

export function generateStaticParams(): Array<{ slug: string }> {
  return listServiceSlugs().map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) {
    return {
      title: { absolute: 'Service not found' },
      robots: { index: false, follow: true },
    }
  }

  return {
    title: { absolute: service.title },
    description: service.description,
    alternates: { canonical: canonicalUrl(`services/${service.slug}`) },
    openGraph: {
      title: service.title,
      description: service.description,
      url: canonicalUrl(`services/${service.slug}`),
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: service.title,
      description: service.description,
    },
  }
}

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export default async function ServicePage({ params }: PageProps) {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) notFound()

  const company = await loadCompany()
  const phone = getChannelForContext(company.phones, 'homepage')?.value || company.phone || '01753 555 012'

  const seo = await loadSeoConfig()
  const pageUrl = canonicalUrl(`services/${service.slug}`)
  const Icon = SERVICE_ICONS[service.icon]
  const otherServices = SERVICES.filter((s) => s.slug !== slug)

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: seo.siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Trade services', item: canonicalUrl('services') },
      { '@type': 'ListItem', position: 3, name: service.shortTitle, item: pageUrl },
    ],
  }

  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${pageUrl}#service`,
    name: service.shortTitle,
    description: service.description,
    provider: {
      '@type': 'LocalBusiness',
      '@id': `${seo.siteUrl}#business`,
      name: seo.siteName,
      url: seo.siteUrl,
    },
    areaServed: {
      '@type': 'GeoCircle',
      geoMidpoint: seo.geo?.latitude
        ? {
            '@type': 'GeoCoordinates',
            latitude: seo.geo.latitude,
            longitude: seo.geo.longitude,
          }
        : undefined,
      geoRadius: '50000',
    },
    url: pageUrl,
  }

  const faqLd = service.faqs.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: service.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      }
    : null

  return (
    <div className="bg-background">
      <JsonLd id="ld-service" data={faqLd ? [breadcrumbLd, serviceLd, faqLd] : [breadcrumbLd, serviceLd]} />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Breadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Trade services', href: '/services' },
            { label: service.shortTitle },
          ]}
        />
      </div>

      <section className="relative isolate overflow-hidden border-b border-border bg-foreground py-16 text-background sm:py-20 lg:py-24">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex rounded-2xl bg-white/10 p-4 text-primary backdrop-blur-sm">
              <Icon className="h-10 w-10" aria-hidden="true" />
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              {service.heading}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
              {service.intro}
            </p>
            <div className="mt-8">
              <Link
                href={service.cta.href}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {service.cta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                What you get
              </h2>
              <ul className="mt-6 space-y-4">
                {service.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                      <Check className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="pt-1 text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <aside className="rounded-2xl border border-border bg-muted/30 p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-foreground">
                Need {service.shortTitle.toLowerCase()}?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Call the trade counter or request a quote online. We cover
                Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire
                and Oxfordshire.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href={service.cta.href}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {service.cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href={telHref(phone)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Call {phone}
                </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Why use our {service.shortTitle.toLowerCase()} service?
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {service.benefits.map((benefit, index) => (
              <li
                key={index}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                  <Check className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="pt-1 text-foreground/90">{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-border py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {service.process.title || 'How it works'}
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {service.process.steps.map((step, index) => (
              <li
                key={index}
                className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-relaxed text-foreground/80">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {service.faqs.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Frequently asked questions
              </h2>
              <dl className="mt-8 space-y-4">
                {service.faqs.map((faq, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <dt className="flex items-start gap-3 text-base font-semibold text-foreground">
                      <HelpCircle className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      {faq.question}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-foreground/80">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}

      {otherServices.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Other trade services
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {otherServices.map((s) => {
                const OtherIcon = SERVICE_ICONS[s.icon]
                return (
                  <Link
                    key={s.slug}
                    href={`/services/${s.slug}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="inline-flex rounded-lg bg-primary/10 p-2.5 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <OtherIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{s.shortTitle}</p>
                      <p className="text-xs text-primary">Learn more</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
