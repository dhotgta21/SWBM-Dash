// app/terms/page.tsx
// Public website terms. The site is informational plus a quote-builder;
// we don't sell directly online, so the terms are short. This is a
// starting point — replace with legal-reviewed copy before going live.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/landing/SiteHeader'
import { SITE_URL } from '@/lib/seo/company-seo'
import { loadPublicCompanyChrome } from '@/lib/public-company'

export const metadata: Metadata = {
  title: 'Website Terms',
  description:
    'Terms of use for the Star Hawk Builders Merchant website, including the public catalogue and quote builder.',
  alternates: { canonical: `${SITE_URL}/terms` },
  openGraph: {
    title: 'Website Terms | Star Hawk Builders Merchant',
    description:
      'Terms of use for the Star Hawk Builders Merchant website and quote builder.',
    url: `${SITE_URL}/terms`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Website Terms | Star Hawk Builders Merchant',
    description:
      'Terms of use for the Star Hawk Builders Merchant website and quote builder.',
  },
}

const SECTIONS = [
  {
    title: 'Using this website',
    body: 'This site is provided free of charge for general information about Star Hawk Builders Merchant, our stock categories, services and delivery area. You may browse, share links and submit quote requests through the quote builder. You agree not to misuse the site, attempt to disrupt it, or scrape its contents for commercial purposes.',
  },
  {
    title: 'Quotes and pricing',
    body: 'Any prices, stock counts or product information shown on this site are indicative only. Final pricing is confirmed in writing by the trade counter once we have reviewed your take-off, checked stock and scheduled delivery. A submitted quote list is not a binding contract until we issue a written quotation.',
  },
  {
    title: 'Trade accounts',
    body: 'Opening a trade account is subject to status, credit checks and our standard terms. Account holders receive 30-day payment terms by default. We may withdraw or amend trade terms at any time by written notice.',
  },
  {
    title: 'Intellectual property',
    body: 'All content on this site — including the Star Hawk brand mark, category imagery, photography and copy — is owned by Star Hawk Builders Merchant or our licensors and is protected by UK and international copyright laws.',
  },
  {
    title: 'Liability',
    body: 'We work hard to keep the information on this site accurate and up to date, but we do not guarantee that it is always complete or current. To the fullest extent permitted by law, we exclude liability for any indirect or consequential loss arising from your use of this site.',
  },
  {
    title: 'Governing law',
    body: 'These terms are governed by the laws of England and Wales. Any disputes will be handled by the courts of England and Wales.',
  },
]

export default async function TermsPage() {
  const chrome = await loadPublicCompanyChrome()
  return (
    <div className="flex min-h-full flex-col bg-background">
      <SiteHeader phone={chrome.phone} />

      <main className="flex-1 pt-24 lg:pt-28">
        <section className="border-b border-border bg-card py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"
            >
              <span aria-hidden>←</span> Back to home
            </Link>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Legal
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Website Terms
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              The terms on which you may use this website and submit
              quote requests through our public catalogue.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl space-y-10 px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Plain-English summary
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li>You can browse the site and request quotes free of charge.</li>
                <li>Online prices are indicative — final pricing is confirmed in writing.</li>
                <li>Trade accounts are subject to status and credit checks.</li>
                <li>All content is owned by Star Hawk Builders Merchant and protected by copyright.</li>
                <li>These terms are governed by English law.</li>
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

            <p className="text-xs text-muted-foreground">
              Last updated: this is a placeholder page. Replace with your
              reviewed terms before going live.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-foreground text-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>&copy; {chrome.year} {chrome.companyName}. All rights reserved.</p>
          <p>Builders merchant &mdash; Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, Oxfordshire &amp; Wiltshire.</p>
        </div>
      </footer>
    </div>
  )
}
