// app/(public-shop)/cart/page.tsx
// Full cart view. Reads the cart from localStorage on mount and
// renders the line items with edit-quantity + remove controls. The
// "Request a quote" CTA submits via the server action on
// /cart/checkout (we forward to it as a normal navigation).

import type { Metadata } from 'next'
import { CartView } from '@/components/shop/CartView'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadSeoConfig()

  return {
    title: {
      absolute: seo.cart.title,
    },
    description: seo.cart.description,
    alternates: {
      canonical: canonicalUrl('cart'),
    },
    openGraph: {
      title: seo.cart.title,
      description: seo.cart.description,
      type: 'website',
      url: canonicalUrl('cart'),
      images: [
        {
          url: canonicalUrl('opengraph-image'),
          width: 1200,
          height: 630,
          alt: `${seo.siteName} — ${seo.cart.title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.cart.title,
      description: seo.cart.description,
      images: [canonicalUrl('opengraph-image')],
    },
    robots: { index: false, follow: false },
  }
}

export default function CartPage() {
  return <CartView />
}
