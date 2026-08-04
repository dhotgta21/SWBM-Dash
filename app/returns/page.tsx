// app/returns/page.tsx
// Public returns policy. Summarises the merchant's returns process for
// trade counter and delivered sales. The operator should review the copy
// with a legal professional before publishing.

import type { Metadata } from 'next'
import { SiteHeader } from '@/components/landing/SiteHeader'
import { SITE_URL } from '@/lib/seo/company-seo'
import { loadPublicCompanyChrome } from '@/lib/public-company'

export const metadata: Metadata = {
  title: 'Returns Policy',
  description:
    'Demo Builder Merchant returns policy: 30-day returns with a valid invoice, provided goods are unopened, unused and undamaged.',
  alternates: { canonical: `${SITE_URL}/returns` },
  openGraph: {
    title: 'Returns Policy | Demo Builder Merchant',
    description:
      'Demo Builder Merchant returns policy: 30-day returns with a valid invoice, provided goods are unopened, unused and undamaged.',
    url: `${SITE_URL}/returns`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Returns Policy | Demo Builder Merchant',
    description:
      'Demo Builder Merchant returns policy: 30-day returns with a valid invoice, provided goods are unopened, unused and undamaged.',
  },
}

const SECTIONS = [
  {
    title: 'Returns window',
    body: 'You can return most goods within 30 days of purchase or delivery. After 30 days we may not be able to offer a refund or exchange, unless the item is faulty or not as described.',
  },
  {
    title: 'What you need',
    body: 'You must provide a valid invoice or proof of purchase so we can identify the original sale and process the return quickly. Returns without a valid invoice may be refused or delayed.',
  },
  {
    title: 'Condition of goods',
    body: 'Returned goods must be unopened, unused and undamaged, in their original packaging with all labels, seals and fittings intact. We cannot accept returns for items that have been opened, used, fitted, cut, mixed or damaged after delivery.',
  },
  {
    title: 'How to return',
    body: 'Bring the goods and your invoice to the trade counter, or contact us to arrange a collection. Collection charges may apply depending on the reason for the return and the value of the items.',
  },
  {
    title: 'Refunds',
    body: 'Once the goods are inspected and accepted, we will refund the original payment method or issue a credit to your trade account, whichever matches the original sale. Refunds are usually processed within 5 to 10 working days.',
  },
  {
    title: 'Items we cannot accept',
    body: 'We cannot accept returns for special-order, custom-cut, perishable, mixed, or clearance items unless they are faulty or not as described. Hazardous or regulated goods must be returned in compliance with current safety rules.',
  },
  {
    title: 'Faulty or incorrect goods',
    body: 'If an item is faulty, damaged in transit, or not what you ordered, please contact us as soon as possible. We will arrange a replacement, refund, or collection, including any reasonable return costs.',
  },
  {
    title: 'Questions',
    body: 'If you are unsure whether an item can be returned, call the trade counter or email us before opening or using it. We are happy to check the product and your invoice details first.',
  },
]

export default async function ReturnsPage() {
  const chrome = await loadPublicCompanyChrome()
  return (
    <div className="flex min-h-full flex-col bg-background">
      <SiteHeader phone={chrome.phone} />

      <main className="flex-1 pt-24 lg:pt-28">
        <section className="border-b border-border bg-card py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Legal
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Returns Policy
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Our returns process in plain English: 30 days, a valid invoice,
              and goods that are unopened, unused and undamaged.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl space-y-10 px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Returns at a glance
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li>Most goods can be returned within 30 days.</li>
                <li>Goods must be unopened, unused and undamaged with original packaging.</li>
                <li>You need a valid invoice or proof of purchase.</li>
                <li>Return to the trade counter or contact us to arrange collection.</li>
                <li>Custom-cut, special-order, mixed and clearance items usually cannot be returned.</li>
              </ul>
            </div>

            {SECTIONS.map(({ title, body }) => (
              <article key={title}>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </article>
            ))}

            <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
              <p className="text-sm font-semibold text-foreground">
                Need to arrange a return?
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Call the trade counter or email us with your invoice number and
                we will guide you through the next steps.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Last updated: this is a placeholder page. Replace with your
              reviewed policy before going live.
            </p>
          </div>
        </section>
      </main>

      <SiteFooterLite companyName={chrome.companyName} year={chrome.year} />
    </div>
  )
}

// Minimal footer for legal/info pages — same brand mark and NAP as the
// main footer but no nav, no categories. Keeps the page focused.
function SiteFooterLite({ companyName, year }: { companyName: string; year: number }) {
  return (
    <footer className="border-t border-border bg-foreground text-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>&copy; {year} {companyName}. All rights reserved.</p>
        <p>Builders merchant &mdash; Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire &amp; Wiltshire.</p>
      </div>
    </footer>
  )
}
