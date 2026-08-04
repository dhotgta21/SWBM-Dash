// components/shop/PublicProductCard.tsx
// Server-renderable product card used on the public quote flow. The
// "Add to quote" button is a client island inside it.
//
// Two modes:
//   * Default (no `onSelect`) — image and title link to the crawlable
//     product page (/products/[code]). Used on standalone category
//     and product pages so search engines can index individual URLs.
//   * With `onSelect` — image and title become buttons that call the
//     callback. Used inside the /quote shell so the customer can open a
//     product detail panel without leaving the page.
//
// `searchQuery` is optional. When set, the card looks for a variant option
// whose display text contains the query and links to the product page with
// `?size=<value>` so the variant selector opens with that size pre-selected.

import Image from 'next/image'
import Link from 'next/link'
import { Package } from 'lucide-react'
import { AddToCartButton } from './AddToCartButton'
import { cleanProductDescription } from '@/lib/seo/product-content'
import {
  type PublicProduct,
  findVariantMatchForQuery,
  buildProductUrlWithVariant,
} from '@/lib/public-products'
import { getEffectivePrice } from '@/lib/public-products/price'
import { cn } from '@/lib/utils'

interface PublicProductCardProps {
  product: PublicProduct
  /**
   * When provided, the card opens the product inline instead of linking to
   * the standalone product page.
   */
  onSelect?: (product: PublicProduct) => void
  /**
   * The query string the user typed in the search box. Used to deep-link
   * to a specific variant on the product page (`?size=...`) so the
   * consolidated product opens with the matching size pre-selected.
   */
  searchQuery?: string
}

export function PublicProductCard({ product, onSelect, searchQuery }: PublicProductCardProps) {
  const imageCommon =
    'relative aspect-[5/3] block w-full overflow-hidden bg-gradient-to-br from-muted to-secondary'

  // When the user searched for a specific size (e.g. "UB 127x76x13kg")
  // we want the link to deep-link into the matching variant rather than
  // the bare product page. Only used in the default (no onSelect) mode.
  const matchedVariant = searchQuery
    ? findVariantMatchForQuery(product, searchQuery)
    : undefined
  const detailHref = buildProductUrlWithVariant(product.code, matchedVariant)

  const display = getEffectivePrice(product)
  const isOnSale = display.kind === 'sale'

  const imageContent = (
    <>
      {product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={`${product.name}${product.category ? ` — ${product.category}` : ''} at Star Hawk Builders Merchant`}
          title={product.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Package className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.25} />
        </div>
      )}
      {isOnSale && display.state === 'live' && (
        <span
          className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow"
          aria-label={`On sale, save ${display.discountPercent} percent`}
        >
          −{display.discountPercent}% off
        </span>
      )}
      {isOnSale && display.state === 'clearance' && (
        <span
          className="absolute left-2 top-2 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow"
          aria-label="Clearance"
        >
          Clearance
        </span>
      )}
    </>
  )

  const priceChip =
    display.kind === 'sale' ? (
      <span className="font-semibold text-primary">
        £{display.effectivePrice.toFixed(2)}
        <span className="ml-1 text-[10px] font-normal text-muted-foreground line-through">
          £{display.originalPrice.toFixed(2)}
        </span>
      </span>
    ) : display.kind === 'fixed' ? (
      <span className="font-semibold text-primary">£{display.effectivePrice.toFixed(2)}</span>
    ) : display.kind === 'from' ? (
      <span className="font-semibold text-primary">from £{display.effectivePrice.toFixed(2)}</span>
    ) : (
      <span className="text-muted-foreground">price on application</span>
    )

  const cardClasses = cn(
    'group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
    isOnSale ? 'border-amber-300/60' : 'border-border'
  )

  return (
    <article className={cardClasses}>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(product)}
          className={`${imageCommon} text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
          aria-label={`View ${product.name}`}
        >
          {imageContent}
        </button>
      ) : (
        <Link
          href={detailHref}
          className={imageCommon}
        >
          {imageContent}
        </Link>
      )}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p
            className={cn(
              'text-[11px] font-semibold uppercase tracking-wide',
              isOnSale ? 'text-amber-700' : 'text-muted-foreground'
            )}
          >
            {product.code} &middot; per {product.unit.toLowerCase()}
            {isOnSale && display.label ? ` · ${display.label}` : null}
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold text-foreground">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(product)}
                className="text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {product.name}
              </button>
            ) : (
              <Link
                href={detailHref}
                className="hover:text-primary"
              >
                {product.name}
              </Link>
            )}
          </h3>
          {product.description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
              {cleanProductDescription(product.description)}
            </p>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between text-sm">{priceChip}</div>
        <div className="mt-auto flex items-center justify-end">
          <AddToCartButton
            productId={product.id}
            code={product.code}
            name={product.name}
            unit={product.unit}
            price={
              display.kind === 'quote'
                ? product.price > 0
                  ? product.price
                  : null
                : display.effectivePrice
            }
            originalPrice={isOnSale ? display.originalPrice : null}
            saleLabel={isOnSale ? display.label : null}
          />
        </div>
      </div>
    </article>
  )
}
