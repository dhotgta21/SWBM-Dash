// components/shop/InlineProductDetail.tsx
// Compact, in-page product detail panel used inside the /quote shell.
// Keeps the customer on the quote page instead of navigating away to
// /products/[code], so the catalogue state is never lost.
//
// Layout (left → right):
//   [Image]   | CODE · CATEGORY · BRAND
//             | Title
//             | Short description (truncated to ~200 chars)
//             | ┌── Action card (Unit · Price · Quantity · Calculator · Add) ──┐
//             | └────────────────────────────────────────────────────────────────┘
//             | Key features (compact pill row)
//             | Typical uses (compact pill row)
//
// Navigation is handled by the right-rail QuoteSidebar back button, which
// is context-aware: "Back to {Category}" in product detail, "Back to all
// categories" in the category product list. There is intentionally NO
// duplicate back button inside this panel.

'use client'

import Image from 'next/image'
import { Check, Package, Sparkles, Wrench } from 'lucide-react'
import { ProductPurchaseCard } from './ProductPurchaseCard'
import { cleanProductDescription } from '@/lib/seo/product-content'
import type { PublicProduct } from '@/lib/public-products'

interface InlineProductDetailProps {
  product: PublicProduct
}

const MAX_DESCRIPTION_CHARS = 200

function truncateDescription(text: string, max: number): string {
  if (text.length <= max) return text
  // Cut on the last sentence boundary before `max`, then fall back to hard cut.
  const slice = text.slice(0, max)
  const lastPeriod = slice.search(/[.!?]\s/)
  if (lastPeriod > 60) return slice.slice(0, lastPeriod + 1)
  const lastSpace = slice.lastIndexOf(' ')
  return `${slice.slice(0, lastSpace > 60 ? lastSpace : max).trimEnd()}…`
}

export function InlineProductDetail({ product }: InlineProductDetailProps) {
  const displayDescription = cleanProductDescription(product.description)
  const shortDescription = truncateDescription(displayDescription, MAX_DESCRIPTION_CHARS)
  const hasKeyFeatures = product.keyFeatures.length > 0
  const hasApplications = product.applications.length > 0

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted to-secondary">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={`${product.name}${product.category ? ` — ${product.category}` : ''} at Star Hawk Builders Merchant`}
              title={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-24 w-24 text-muted-foreground/40" strokeWidth={1.25} />
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {product.code}
            {product.category && ` · ${product.category}`}
            {product.brand && ` · ${product.brand}`}
          </p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {product.name}
          </h2>

          {shortDescription && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{shortDescription}</p>
          )}

          {/* Action area — Unit, Price, Quantity, Calculator, Add to quote */}
          <div className="mt-5">
            <ProductPurchaseCard product={product} />
          </div>

          {/* Key features & typical uses — compact, secondary, below the action */}
          {hasKeyFeatures && (
            <section aria-labelledby="key-features-heading" className="mt-6">
              <h3
                id="key-features-heading"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Key features
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {product.keyFeatures.map((feature, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <Check className="h-3 w-3 text-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasApplications && (
            <section aria-labelledby="typical-uses-heading" className="mt-4">
              <h3
                id="typical-uses-heading"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                Typical uses
              </h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {product.applications.map((application, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    {application}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}