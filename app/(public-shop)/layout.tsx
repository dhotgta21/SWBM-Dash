// app/(public-shop)/layout.tsx
// Layout for the public quote + cart + checkout flow. Wraps every
// page in the CartProvider context so the floating cart widget stays
// in sync across navigation, and renders the shared ShopHeader.

import type { Metadata } from 'next'
import { CartProvider } from '@/lib/cart/cart-context'
import { ShopHeader } from '@/components/shop/ShopHeader'
import { ShopFooter } from '@/components/shop/ShopFooter'
import { FloatingCartButton } from '@/components/shop/FloatingCartButton'
import { loadPublicCompanyChrome } from '@/lib/public-company'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags
// used by the product/quote/cart pages underneath this layout.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadSeoConfig()

  return {
    title: {
      absolute: seo.shop.title,
    },
    description: seo.shop.description,
    alternates: {
      canonical: canonicalUrl('quote'),
    },
    openGraph: {
      title: seo.shop.title,
      description: seo.shop.description,
      type: 'website',
      url: canonicalUrl('quote'),
      images: [
        {
          url: canonicalUrl('opengraph-image'),
          width: 1200,
          height: 630,
          alt: `${seo.siteName} — ${seo.shop.title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.shop.title,
      description: seo.shop.description,
      images: [canonicalUrl('opengraph-image')],
    },
  }
}

export default async function PublicShopLayout({ children }: { children: React.ReactNode }) {
  const chrome = await loadPublicCompanyChrome()
  return (
    <CartProvider>
      <div className="flex min-h-full flex-col bg-background">
        <ShopHeader phone={chrome.phone} />
        <main className="flex-1 pt-24">{children}</main>
        <ShopFooter
          companyName={chrome.companyName}
          year={chrome.year}
          phone={chrome.phone}
          email={chrome.email}
          addressLines={chrome.addressLines}
          hours={chrome.hours}
        />
        <FloatingCartButton />
      </div>
    </CartProvider>
  )
}
