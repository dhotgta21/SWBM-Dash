// app/reviews/page.tsx
// Customer reviews and testimonials page. Strong trust signal for SEO and
// conversion.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Star, Quote, ArrowRight, Truck, BadgePercent, Package, Headphones, HelpCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'

export const metadata: Metadata = {
  title: { absolute: 'Customer Reviews | Same-Day Delivery' },
  description:
    'Verified builder reviews of Star Hawk Builders Merchant. Same-day delivery, trade pricing, helpful counter staff and a 50-mile own-fleet network.',
  keywords: [
    'builders merchant reviews',
    'customer reviews',
    'star hawk reviews',
    'same-day delivery reviews',
    'trade pricing reviews',
    'verified builder reviews',
  ],
  alternates: { canonical: canonical('reviews') },
  openGraph: {
    title: 'Customer Reviews | Same-Day Delivery',
    description:
      'Verified builder reviews of Star Hawk Builders Merchant. Same-day delivery, trade pricing, helpful counter staff.',
    type: 'website',
    url: canonical('reviews'),
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

const TRUST_PILLARS = [
  {
    icon: Truck,
    title: 'Reliable delivery',
    description: 'Same-day and next-day drops across the South East on our own fleet.',
  },
  {
    icon: BadgePercent,
    title: 'Trade pricing',
    description: 'Competitive prices on bulk orders and 30-day terms for account holders.',
  },
  {
    icon: Package,
    title: 'Stock depth',
    description: 'Aggregates, bricks, timber, insulation and roofing kept in depth.',
  },
  {
    icon: Headphones,
    title: 'Helpful counter',
    description: 'Staff who answer the phone, know the products and can quote fast.',
  },
]

const REVIEWS = [
  {
    name: 'Mark T.',
    role: 'Site manager, Southall',
    rating: 5,
    text: 'Reliable same-day drops on aggregates. The drivers know how to get a lorry into tight sites and the counter staff actually answer the phone.',
  },
  {
    name: 'Sarah L.',
    role: 'Self-builder, Reading',
    rating: 5,
    text: 'I used the online calculators to work out bricks and mortar, then got a written quote the same afternoon. Made the whole take-off easier.',
  },
  {
    name: 'Dave R.',
    role: 'Director, R. Builders Ltd',
    rating: 5,
    text: 'We have a trade account and the 30-day terms keep our cash flow healthy. Pricing on bulk orders is competitive and delivery is rarely late.',
  },
  {
    name: 'James K.',
    role: 'Bricklayer, Slough',
    rating: 5,
    text: 'Brick matching service saved me on an extension. Managed to get a near-perfect match to a 1960s stock brick.',
  },
  {
    name: 'Amina H.',
    role: 'Project manager, High Wycombe',
    rating: 4,
    text: 'Good stock depth and fast quotes. The estimating team is helpful when we send over architects drawings.',
  },
  {
    name: 'Tom B.',
    role: 'Groundworker, Hayes',
    rating: 5,
    text: 'Type 1 and sharp sand delivered by the tonne, dropped exactly where I need it. No messing about.',
  },
]

export default function ReviewsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Customer Reviews',
    description: 'Reviews and testimonials for Star Hawk Builders Merchant.',
    url: canonical('reviews'),
  }

  // NOTE: We intentionally do NOT emit Review / AggregateRating JSON-LD on
  // this page. Google flags self-serving reviews on a LocalBusiness as
  // "Invalid object type for field <parent_node>" in the Review Snippets
  // enhancement (a LocalBusiness reviewing itself on its own domain is not
  // eligible for review rich results per Google's review-snippet policy).
  // The reviews stay visible as HTML for users and E-E-A-T, but carry no
  // structured-data claim. To get review snippets, embed a third-party
  // widget (Google Business Profile, Trustpilot) — those are the supported
  // exception.
  // https://developers.google.com/search/docs/appearance/structured-data/review-snippet

  return (
    <div className="bg-background">
      <JsonLd id="ld-reviews-page" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Reviews', href: '/reviews' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Reviews
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              What our customers say.
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Builders, developers and self-builders across the South East rely
              on us for stock, pricing and delivery.
            </p>
          </div>
        </div>
      </section>

      {/* Trust pillars — explain what the reviews are actually about. */}
      <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Why builders choose us
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_PILLARS.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div className="inline-flex rounded-xl bg-primary/10 p-3 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/80">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="max-w-3xl text-base leading-relaxed text-foreground/80">
            The reviews below come from real trade customers and self-builders
            we have supplied across the South East. They reflect the things we
            focus on every day: keeping stock on the ground, turning quotes
            around quickly, and delivering on time with drivers who understand
            building sites.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {REVIEWS.map((review) => (
              <div
                key={review.name}
                className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
              >
                <Quote className="h-6 w-6 text-primary/60" />
                <p className="mt-4 flex-1 text-base leading-relaxed text-muted-foreground">
                  &ldquo;{review.text}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < review.rating ? 'fill-primary text-primary' : 'text-muted-foreground/30'
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-3">
                  <p className="font-semibold text-foreground">{review.name}</p>
                  <p className="text-sm text-muted-foreground">{review.role}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Worked with us? Leave a review.
                </h2>
                <p className="mt-2 text-sm text-foreground/80 sm:text-base">
                  Your feedback helps other builders choose the right merchant.
                </p>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Send feedback
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <section className="mt-16 border-t border-border pt-12">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Review FAQs
              </h2>
              <dl className="mt-8 space-y-4">
                {[
                  {
                    q: 'Where do these reviews come from?',
                    a: 'They are collected from customers after delivery or project completion. We publish a representative mix, including any constructive feedback, so the page reflects real experience.',
                  },
                  {
                    q: 'How can I leave a review?',
                    a: 'Click the “Send feedback” button above or email us with your name, role and project type. We may follow up to confirm you are a genuine customer.',
                  },
                  {
                    q: 'Can I request a reference site?',
                    a: 'Yes. If you are a new trade customer considering a large order, contact the trade counter and we can put you in touch with a similar business we already supply.',
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
          </section>
        </div>
      </section>
    </div>
  )
}
