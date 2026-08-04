// app/privacy/page.tsx
// Public privacy policy. Kept deliberately short and in plain English
// because the merchant is a small UK business — most visitors want to
// know what data is collected and how to get in touch, not a 30-page
// legal novel. The copy below is a starting point the operator should
// review with a legal professional before publishing.

import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/landing/SiteHeader'
import { SITE_URL } from '@/lib/seo/company-seo'
import { loadPublicCompanyChrome } from '@/lib/public-company'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Star Hawk Builders Merchant collects, uses and protects your personal data when you use our website or open a trade account.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  openGraph: {
    title: 'Privacy Policy | Star Hawk Builders Merchant',
    description:
      'How Star Hawk Builders Merchant collects, uses and protects your personal data.',
    url: `${SITE_URL}/privacy`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy | Star Hawk Builders Merchant',
    description:
      'How Star Hawk Builders Merchant collects, uses and protects your personal data.',
  },
}

const SECTIONS = [
  {
    title: 'Who we are',
    body: 'Star Hawk Builders Merchant is a UK builders merchant. References to "we", "us" or "our" mean Star Hawk Builders Merchant Ltd. Contact details appear at the bottom of this page.',
  },
  {
    title: 'What information we collect',
    body: 'We collect personal information you give us when you open a trade account, request a quote, sign in to the client portal or contact the trade counter. This typically includes your name, business name, email, phone number, delivery address and invoice history.',
  },
  {
    title: 'How we use your information',
    body: 'We use your information to provide quotes, fulfil deliveries, send invoices and statements, maintain your trade account and respond to enquiries. We do not sell your data, and we do not share it with third parties for marketing.',
  },
  {
    title: 'Cookies and analytics',
    body: 'Our website uses a small number of strictly necessary cookies to keep you signed in and remember your quote cart. We may use privacy-friendly analytics to understand which categories and towns visitors browse most. You can disable cookies in your browser settings at any time.',
  },
  {
    title: 'How long we keep your data',
    body: 'We keep account and invoice records for at least six years to comply with HMRC record-keeping requirements. Marketing enquiries are deleted within 12 months if no account is opened.',
  },
  {
    title: 'Your rights',
    body: 'Under the UK GDPR you have the right to access, correct or request deletion of your personal data, and to object to processing or request portability. Email or call the trade counter to make a request and we will respond within one calendar month.',
  },
  {
    title: 'Changes to this policy',
    body: 'We update this page when our practices change. The "Last updated" date below reflects the most recent revision.',
  },
]

export default async function PrivacyPage() {
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
              Privacy Policy
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Plain-English summary of how we handle your personal data
              when you use this website, open a trade account or contact
              the trade counter.
            </p>
          </div>
        </section>

        <section className="py-12 sm:py-16">
          <div className="mx-auto max-w-3xl space-y-10 px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-border bg-muted/40 p-6 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Your data in brief
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-foreground/80">
                <li>We only collect the information we need to quote, deliver and invoice you.</li>
                <li>We never sell your personal data or share it for marketing.</li>
                <li>Invoice records are kept for six years to comply with HMRC rules.</li>
                <li>You can ask to see, correct or delete your data at any time.</li>
                <li>We use only essential cookies and privacy-friendly analytics.</li>
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
                Questions about your data?
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Call the trade counter or email us and we will point you
                to the right person.
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
