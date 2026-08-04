// app/trade-account/page.tsx
// Trade account application and benefits page.

import type { Metadata } from 'next'
import Link from 'next/link'
import { CreditCard, Clock, BadgePercent, Headphones, CheckCircle2, ArrowRight } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { FaqSection } from '@/components/seo/FaqSection'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: { absolute: 'Open a Trade Account | 30-Day Terms' },
  description:
    'Open a trade account in minutes. 30-day terms, trade pricing, dedicated account manager and fast credit decisions.',
  keywords: [
    'trade account',
    '30 day terms',
    'trade pricing',
    'builders merchant credit',
    'open trade account',
    'trade account builders merchant',
    'slough trade account',
  ],
  alternates: { canonical: canonical('trade-account') },
  openGraph: {
    title: 'Open a Trade Account | 30-Day Terms',
    description:
      'Open a trade account in minutes. 30-day terms, trade pricing, dedicated account manager and fast credit decisions.',
    type: 'website',
    url: canonical('trade-account'),
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

export default function TradeAccountPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Open a Trade Account',
    description: 'Trade account application and benefits for builders and developers.',
    url: canonical('trade-account'),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-trade-account" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Trade account', href: '/trade-account' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Trade customers
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Open a trade account today.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              30-day terms, trade pricing and a dedicated account manager who
              understands your workflow.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <BenefitCard
              icon={Clock}
              title="30-day terms"
              description="Monthly invoicing so you can keep cash flow smooth across jobs."
            />
            <BenefitCard
              icon={BadgePercent}
              title="Trade pricing"
              description="Volume discounts on aggregates, cement, steel and repeat orders."
            />
            <BenefitCard
              icon={Headphones}
              title="Dedicated support"
              description="Priority phone line and account manager who knows your sites."
            />
            <BenefitCard
              icon={CreditCard}
              title="Fast decisions"
              description="Quick online application with straightforward credit checks."
            />
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                What you get
              </h2>
              <ul className="mt-6 space-y-4">
                {[
                  '30-day monthly terms for qualifying trade customers',
                  'Preferential trade pricing on bulk and repeat orders',
                  'Dedicated account manager and priority phone line',
                  'Itemised monthly statements and credit-control support',
                  'Same-day and next-day delivery scheduling',
                  'Brick matching, estimating and site delivery services',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                How to apply
              </h2>
              <ol className="mt-6 space-y-6">
                {[
                  { step: '1', text: 'Fill in the application form with your company and contact details.' },
                  { step: '2', text: 'We run a quick credit check and confirm your limit.' },
                  { step: '3', text: 'Start ordering on account with 30-day terms.' },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                      {item.step}
                    </span>
                    <p className="text-muted-foreground">{item.text}</p>
                  </li>
                ))}
              </ol>

              <div className="mt-8">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                >
                  Apply for a trade account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-16 grid gap-12 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Who can apply
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80 sm:text-base">
                We accept applications from sole traders, partnerships, limited
                companies and larger development firms actively working in
                construction, property maintenance or civil engineering.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                {[
                  'UK-registered business or sole trader',
                  'Active construction, maintenance or development work',
                  'Two trade references or audited accounts for larger limits',
                  'Valid business bank details for direct debit or BACS',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                What happens after approval
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/80 sm:text-base">
                Once approved you can start ordering immediately on account. Your
                dedicated account manager will handle pricing, delivery
                scheduling and any queries as your jobs progress.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                {[
                  'Confirmed credit limit and 30-day payment terms',
                  'Itemised monthly statements by email or post',
                  'Priority phone line and named account manager',
                  'Trade pricing reviewed as your order volume grows',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <FaqSection
            heading="Trade account FAQs"
            items={[
              {
                question: 'Who can open a trade account?',
                answer:
                  'Sole traders, limited companies, partnerships and larger development firms can apply. We review each application on its merits.',
              },
              {
                question: 'How long does approval take?',
                answer:
                  'Most applications are reviewed within one business day once we have the required company and bank details.',
              },
              {
                question: 'What are the payment terms?',
                answer:
                  'Qualifying trade customers receive 30-day monthly terms with itemised statements.',
              },
              {
                question: 'Is there a minimum order?',
                answer:
                  'No. Trade account pricing applies to orders of all sizes, though volume discounts increase on larger and repeat orders.',
              },
            ]}
          />
        </div>
      </section>
    </div>
  )
}

function BenefitCard({
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
