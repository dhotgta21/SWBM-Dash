// app/(public-shop)/cart/checkout/page.tsx
// Quote request / order form. Collects contact + delivery details
// and the cart contents and submits them as a single quote_request
// with line items. The `kind` query param tells the form whether
// it's a quote (default) or an order. Server-side validation +
// abuse detection happens in lib/actions/quote-requests.ts.
//
// We wrap <CheckoutForm> in Suspense because useSearchParams forces
// a CSR boundary in Next 16; without it the build is fine but the
// form would briefly disable itself during client hydration. The
// fallback keeps the layout stable so the spinner doesn't reflow the
// two-column grid.

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CheckoutForm } from '@/components/shop/CheckoutForm'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { getTurnstileSiteKey } from '@/lib/turnstile'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadSeoConfig()
  const title = `Request a quote | ${seo.siteName}`
  const description = `Submit your cart to the ${seo.siteName} trade counter for a same-day written quote.`
  const url = canonicalUrl('cart/checkout')
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

export default async function CheckoutPage() {
  const turnstileSiteKey = await getTurnstileSiteKey()

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          Loading...
        </div>
      }
    >
      <CheckoutForm turnstileSiteKey={turnstileSiteKey} />
    </Suspense>
  )
}
