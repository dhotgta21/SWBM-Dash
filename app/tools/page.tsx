// app/tools/page.tsx
// Public hub for the useful tools on the site: material calculators,
// unit converters.
//
// Only true tools live here (calculators, converters). The
// "Delivery checker" used to sit in this grid but it's a serviceability
// check, not a calculator — it belongs on the /quote page (so customers
// know we deliver to them before they invest time building a quote
// list), not lumped in with the calculators. The /tools/delivery-checker
// route redirects to /quote for any existing backlinks.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Sparkles, HelpCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { TOOLS } from '@/lib/tools/data'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    absolute: 'Tools & Calculators | Material Estimators',
  },
  description:
    'Free building material calculators. Estimate quantities for bricks, blocks, mortar, concrete, plaster, insulation, roofing, timber and steel lintels.',
  keywords: [
    'building material calculator',
    'brick calculator',
    'concrete calculator',
    'mortar calculator',
    'plaster calculator',
    'tile calculator',
    'builders calculator',
    'free calculator',
  ],
  alternates: { canonical: canonical('tools') },
  openGraph: {
    title: 'Tools & Calculators | Material Estimators',
    description:
      'Free calculators for bricks, blocks, concrete, mortar, plaster, insulation, roofing, timber, aggregates, screed, sheet materials and steel lintels.',
    type: 'website',
    url: canonical('tools'),
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

const TRUST = [
  'No sign-up',
  'Saves to your clipboard',
  'Works on every device',
  'Trade-counter reviewed',
]

const FAQS = [
  {
    question: 'Are the calculators free to use?',
    answer:
      'Yes. Every calculator and converter on this page is free. There is no sign-up and no limit on how many times you can use them.',
  },
  {
    question: 'How accurate are the results?',
    answer:
      'Figures are based on standard UK trade rules of thumb and manufacturer coverage rates. Always add the recommended wastage allowance and double-check critical quantities with your engineer or architect.',
  },
  {
    question: 'Can I save or share my calculation?',
    answer:
      'You can copy the result or add materials directly to your quote list. From there you can request a written trade price by email or phone.',
  },
  {
    question: 'Do the calculators work on mobile?',
    answer:
      'Yes. Every tool is responsive and works on phones, tablets and desktops, so you can estimate quantities while on site.',
  },
  {
    question: 'What if the material I need is not listed?',
    answer:
      'Send your take-off to the trade counter. We can price specialist materials, confirm coverage rates and turn your estimate into a delivered quote.',
  },
]

export default function ToolsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Tools & Calculators | Star Hawk Builders Merchant',
    description:
      'Free building material calculators and unit converters from Star Hawk Builders Merchant.',
    url: canonical('tools'),
    hasPart: TOOLS.map((tool) => ({
      '@type': 'WebPage',
      name: tool.title,
      url: canonical(tool.href.replace(/^\//, '')),
      description: tool.description,
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-tools" data={jsonLd} />

      {/* Hero */}
      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Tools & calculators
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Online tools for builders and self-builders.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Free calculators and converters for every job on site. Pick one, type your
              numbers, add the result to your quote list — done.
            </p>

            {/* Trust strip — answers "is this a real tool?" instantly. */}
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-muted-foreground">
              {TRUST.map((label) => (
                <li key={label} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Tool cards */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((tool) => {
              const Icon = tool.icon
              return (
                <Link
                  key={tool.slug}
                  href={tool.href}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg sm:p-8"
                >
                  {/* Header row — icon left, popular badge right. Keeps them
                      on the same baseline so the card doesn't have an
                      empty pocket of top space and a floating badge. */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="inline-flex shrink-0 rounded-xl bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    {tool.popular && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Popular
                      </span>
                    )}
                  </div>
                  <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {tool.title}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {tool.description}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                    {tool.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* FAQ — adds content depth and FAQPage schema to the hub. */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Calculator FAQs
            </h2>
            <dl className="mt-8 space-y-4">
              {FAQS.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <dt className="flex items-start gap-3 text-base font-semibold text-foreground">
                    <HelpCircle
                      className="h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
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
      <JsonLd
        id="ld-tools-faq"
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQS.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }}
      />

      {/* Bottom CTA — concrete value, not "contact us". */}
      <section className="border-t border-border bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-border bg-card p-8 shadow-sm sm:flex-row sm:p-10">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Need a quantity we don&apos;t calculate yet?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Send your take-off and we&apos;ll quote it directly — usually within the hour during trade hours.
                No call needed for a written price.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/quote"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Build a quote list
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                Contact the trade counter
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}