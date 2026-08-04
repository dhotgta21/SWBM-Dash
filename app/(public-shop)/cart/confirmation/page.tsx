// app/(public-shop)/cart/confirmation/page.tsx
// Public thank-you page after a quote or order has been submitted.
// Rendered server-side from the search params so the URL is
// shareable / bookmarkable — the user can refresh and see the same
// reference number. The `kind` query param selects the success
// narrative (quote vs. order) so the steps shown actually match the
// flow the customer just kicked off.

import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CheckCircle2,
  ArrowRight,
  Mail,
  Phone,
  Clock,
  FileSignature,
  ShoppingCart,
} from 'lucide-react'
import { loadCompany, telHref, mailtoHref } from '@/lib/company'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'

export const dynamic = 'force-dynamic'

type ConfirmationKind = 'quote' | 'order'

export async function generateMetadata({ searchParams }: {
  searchParams: Promise<{ ref?: string | string[]; kind?: string | string[] }>
}): Promise<Metadata> {
  const seo = await loadSeoConfig()
  const params = await searchParams
  const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind
  const kind: ConfirmationKind = rawKind === 'order' ? 'order' : 'quote'
  const isOrder = kind === 'order'
  const title = isOrder
    ? `Order received | ${seo.siteName}`
    : `Quote request received | ${seo.siteName}`
  const description = isOrder
    ? 'Your order has been submitted. We\u2019ll call to confirm and take payment.'
    : 'Your quote request has been submitted.'
  const url = canonicalUrl('cart/confirmation')
  const image = canonicalUrl('opengraph-image')

  return {
    title: {
      absolute: title,
    },
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${seo.siteName} — ${title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    robots: { index: false, follow: false },
  }
}

interface PageProps {
  searchParams: Promise<{ ref?: string | string[]; kind?: string | string[] }>
}

export default async function ConfirmationPage({ searchParams }: PageProps) {
  const params = await searchParams
  const refRaw = Array.isArray(params.ref) ? params.ref[0] : params.ref
  const reference = refRaw?.trim() ?? ''
  const rawKind = Array.isArray(params.kind) ? params.kind[0] : params.kind
  const kind: ConfirmationKind = rawKind === 'order' ? 'order' : 'quote'
  const isOrder = kind === 'order'

  let companyName = 'Demo Builder Merchant'
  let companyEmail: string | null = null
  let companyPhone: string | null = null

  if (reference) {
    try {
      const company = await loadCompany()
      companyName = company.name
      companyEmail = company.email
      companyPhone = company.phone
    } catch {
      // Confirmation still works without contact details — we just
      // hide the email / phone bits.
    }
  }

  // Three-step narrative the customer sees after submitting.
  //
  // For quotes: review → email written quote → customer confirms.
  // For orders: call to confirm stock → take payment over phone →
  // book delivery. Same status pipeline on the back end; only the
  // wording differs from the customer's POV.
  const steps = isOrder
    ? [
        'Our trade counter reviews your list and confirms stock for your delivery area.',
        'We call you to take card payment over the phone and schedule a delivery slot.',
        'Once payment is in, your order is released to the yard and we email a paid invoice.',
      ]
    : [
        `The ${companyName} trade counter reviews your list, confirms stock and adjusts any prices we need to quote you on.`,
        'We email you a written quote, usually the same business day, with a delivery slot for your area.',
        'You reply to confirm and we book the delivery, or you collect from the yard.',
      ]

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm sm:p-12">
        <div
          className={
            'mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ' +
            (isOrder ? 'bg-primary/10 text-primary' : 'bg-success-muted text-success')
          }
        >
          {isOrder ? (
            <ShoppingCart className="h-9 w-9" />
          ) : (
            <CheckCircle2 className="h-9 w-9" />
          )}
        </div>

        <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {isOrder ? <ShoppingCart className="h-3.5 w-3.5" /> : <FileSignature className="h-3.5 w-3.5" />}
          {isOrder ? 'Order' : 'Quote'}
        </span>

        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {isOrder ? 'We\u2019ve got your order.' : 'We\u2019ve got your request.'}
        </h1>

        {reference ? (
          <p className="mt-3 text-base text-muted-foreground">
            Your reference number is{' '}
            <span className="font-mono font-bold text-foreground">{reference}</span>.
            Keep it handy if you call or email us.
          </p>
        ) : (
          <Alert className="mt-6 text-left">
            <AlertDescription>
              Your {isOrder ? 'order' : 'request'} was submitted but we
              don&rsquo;t have a reference number to display. Check your
              email for the confirmation.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-8 grid gap-3 rounded-xl border border-border bg-background p-5 text-left">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What happens next
          </h2>
          <ol className="space-y-3 text-sm text-foreground">
            {steps.map((body, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {idx + 1}
                </span>
                <span>{body}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-6">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            Mon&ndash;Fri 7am&ndash;5pm &middot; Sat 8am&ndash;12pm
          </span>
        </div>

        {(companyEmail || companyPhone) && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 text-sm sm:flex-row sm:gap-6">
            {companyEmail && (
              <a
                href={mailtoHref(companyEmail)}
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4" />
                {companyEmail}
              </a>
            )}
            {companyPhone && (
              <a
                href={telHref(companyPhone)}
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4" />
                {companyPhone}
              </a>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/quote">
            <span className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover">
              Browse more lines
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
