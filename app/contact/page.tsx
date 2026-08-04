// app/contact/page.tsx
// Dedicated Contact page with phone, email, address, opening hours and an
// embedded map. NAP is sourced from company_settings to stay in sync.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Phone, Mail, MapPin, Clock, ArrowRight } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { loadCompany, filterChannelsByContext, telHref, mailtoHref } from '@/lib/company'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { FaqSection } from '@/components/seo/FaqSection'
import { toOpeningHoursSpecification } from '@/lib/opening-hours'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const company = await loadCompany()
  const title = `Contact ${company.name} | Trade Counter & Delivery Enquiries`
  const description =
    `Contact ${company.name} by phone, email or visit the trade counter. ` +
    'Get a quote, check stock or book a delivery slot across Greater London and the Home Counties.'

  return {
    title: { absolute: title },
    description,
    keywords: [
      'contact builders merchant',
      'trade counter slough',
      'phone builders merchant',
      `${company.name} contact`,
      'same-day delivery enquiries',
      'Iver builders merchant',
      'Buckinghamshire builders merchant',
      'building materials quote',
    ],
    alternates: { canonical: canonical('contact') },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonical('contact'),
      images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
    },
  }
}

export default async function ContactPage() {
  const company = await loadCompany()
  const contactPhones = filterChannelsByContext(company.phones, 'contactPage')
  const contactEmails = filterChannelsByContext(company.emails, 'contactPage')
  const primaryPhone = contactPhones[0]?.value || company.phone || '01234 567 890'
  const primaryEmail = contactEmails[0]?.value || company.email || 'trade@starhawkbm.example'

  const address = company.addressLines.join(', ')
  const hasRealAddress =
    !company.addressLines.includes('Address on file. Contact us for details.') &&
    company.addressLines.length > 0
  const mapQuery = hasRealAddress ? address : 'United Kingdom'
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=${hasRealAddress ? 15 : 6}&ie=UTF8&iwloc=&output=embed`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: `Contact ${company.name}`,
    description: `Contact details for ${company.name}.`,
    url: canonical('contact'),
    mainEntity: {
      '@type': 'BuildingMaterialsStore',
      name: company.name,
      telephone: contactPhones.map((c) => c.value),
      email: contactEmails.map((c) => c.value),
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
      <JsonLd id="ld-contact" data={jsonLd} />

      {/* Hero */}
      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Contact', href: '/contact' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Talk to us
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Need a price, a stock check, or a delivery slot?
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              The fastest answer is usually a quick phone call to the trade counter.
              For a written quote, email your take-off and we&apos;ll come back to you.
            </p>
          </div>
        </div>
      </section>

      {/* Contact cards */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="inline-flex w-fit rounded-xl bg-primary/10 p-3 text-primary">
                <Phone className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">Phone</h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Call the trade counter during opening hours for stock checks,
                prices and same-day delivery slots.
              </p>
              <div className="mt-6 space-y-2">
                {contactPhones.length > 0 ? (
                  contactPhones.map((channel) => (
                    <a
                      key={channel.id}
                      href={telHref(channel.value)}
                      className="flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
                    >
                      {channel.value}
                      {channel.label && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">({channel.label})</span>
                      )}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No phone number configured.</span>
                )}
              </div>
            </div>

            <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="inline-flex w-fit rounded-xl bg-primary/10 p-3 text-primary">
                <Mail className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">Email</h2>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Send your take-off, cutting list or drawings and we&apos;ll reply with
                a written quote the same business day.
              </p>
              <div className="mt-6 space-y-2">
                {contactEmails.length > 0 ? (
                  contactEmails.map((channel) => (
                    <a
                      key={channel.id}
                      href={mailtoHref(channel.value, 'Quote / stock enquiry from website')}
                      className="flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
                    >
                      {channel.value}
                      {channel.label && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">({channel.label})</span>
                      )}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No email address configured.</span>
                )}
              </div>
            </div>

            <ContactCard
              icon={Clock}
              title="Opening hours"
              action={{ href: '#find-us', label: 'Find us on the map' }}
            >
              {company.hours}
            </ContactCard>
          </div>

          {/* Map + address */}
          <div
            id="find-us"
            className="mt-12 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          >
            <div className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Visit the yard
                </span>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Find the trade counter
                </h2>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  Walk in, load up. No appointment needed — even for half a tonne
                  of ballast. Free customer parking is available at the yard.
                </p>

                <address className="not-italic mt-8 space-y-4 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="leading-relaxed">
                      {company.addressLines.map((line, i) => (
                        <span key={i} className="block">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div className="leading-relaxed">{company.hours}</div>
                  </div>
                </address>

                <div className="mt-8">
                  <Link
                    href="/quote"
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                  >
                    Get a quote
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border bg-white">
                <iframe
                  title="Demo Builder Merchant location"
                  src={mapSrc}
                  width="100%"
                  height="320"
                  style={{ border: 0, filter: 'grayscale(15%) contrast(1.02)' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick quote guide — helps customers send useful information. */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              How to get a fast quote
            </h2>
            <p className="mt-3 text-base leading-relaxed text-foreground/80">
              The more detail you send, the faster we can turn your enquiry
              into a firm price. Include these details if you can:
            </p>
            <ul className="mt-6 space-y-3 text-foreground/80">
              {[
                'Dimensions, plans or a cutting list — even hand-drawn notes help.',
                'Product grade or specification, e.g. C25 concrete, FSC timber, engineering brick.',
                'Delivery postcode plus any site access constraints (narrow lanes, crane offload, restricted hours).',
                'Your required date and whether the job is programme-critical.',
                'Photos of the existing build or site if you are matching materials.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <a
                href={mailtoHref(primaryEmail, 'Quote request from website')}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Email your take-off
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ section — common questions about the trade counter. Renders
          as both visible content AND a FAQPage JSON-LD so Google can
          pull these into rich results for "trade counter {town}". */}
      <section className="border-t border-border py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <FaqSection
            heading="Trade counter FAQs"
            items={[
              {
                question: 'What are the trade counter opening hours?',
                answer: 'The trade counter opens Monday to Friday with early starts available for trade customers. Saturday morning slots are available on request. Phone ahead to confirm stock on a specific line.',
              },
              {
                question: 'Is there parking at the trade counter?',
                answer: 'Yes — free customer parking on site, with a dedicated trade counter lane so you can collect pre-picked orders without leaving your vehicle.',
              },
              {
                question: 'Can I place a same-day order by phone?',
                answer: 'Yes. Call the trade counter, confirm stock on the lines you need and we will arrange a same-day delivery slot if you order before 11am. Saturday morning slots are also bookable by phone.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}

function ContactCard({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  action: { href: string; label: string }
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="inline-flex w-fit rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {children}
      </p>
      <a
        href={action.href}
        className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
      >
        {action.label}
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}
