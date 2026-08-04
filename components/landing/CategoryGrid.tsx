// components/landing/CategoryGrid.tsx
// Renders the marketing catalogue grid. Each card pulls its image,
// icon and blurb from CATEGORY_META so that anything missing in the DB
// is silently skipped (no broken cards on the public site).
//
// Two modes:
//   * Default (no `onSelect`) — each card is a real <Link> to its
//     crawlable category page (/quote/[slug]). Used on the landing
//     page and the public /catalogue page so visitors can keep browsing
//     and search engines can index individual category URLs.
//   * With `onSelect` — each card becomes a button that calls the
//     callback with the category name. Used inside the /quote page
//     shell so the customer can drill into a category without leaving
//     the page (preserves the in-page quote flow). Pressing Enter or
//     Space activates the button, so keyboard users still navigate
//     cleanly.
//
// `activeName` highlights a single card with a primary ring — used by
// /catalogue when a ?category=<slug> filter is present so the visitor
// can see which line they are currently browsing.

import Image from 'next/image'
import Link from 'next/link'
import { metaFor } from './category-meta'
import { slugifyCategory } from '@/lib/public-products'

export interface CategoryRow {
  name: string
  productCount: number
}

interface CategoryGridProps {
  rows: CategoryRow[]
  /**
   * When provided, cards become buttons and call this handler instead of
   * navigating. The category's display name is passed so the parent can
   * look up products and metadata without re-slugifying.
   */
  onSelect?: (categoryName: string) => void
  /**
   * When set, the card with this name gets a primary outline so the
   * visitor can see which category is currently filtered. Only applies
   * to the default <Link> mode (no `onSelect`).
   */
  activeName?: string
}

export function CategoryGrid({ rows, onSelect, activeName }: CategoryGridProps) {
  // Dedupe by category name, drop any unknown names, and preserve the
  // curated order from CATEGORY_META so the grid reads consistently
  // even when the DB returns a different order.
  const seen = new Set<string>()
  const cards = rows
    .map((row) => {
      const meta = metaFor(row.name)
      return meta ? { meta, productCount: row.productCount } : null
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .filter((c) => {
      if (seen.has(c.meta.name)) return false
      seen.add(c.meta.name)
      return true
    })

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Our category list is being updated. Please check back shortly or send
        us your take-off for a written quote.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ meta, productCount }) => {
        const Icon = meta.icon
        const isActive = activeName === meta.name
        const cardClassName = [
          'group relative flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '',
        ]
          .filter(Boolean)
          .join(' ')

        const overlay = (
          <>
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              <Image
                src={`/categories/${meta.slug}.webp`}
                alt={`${meta.name}: ${meta.blurb} from Star Hawk Builders Merchant`}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-sm backdrop-blur">
                <Icon className="h-3.5 w-3.5 text-primary" />
                {productCount} {productCount === 1 ? 'line' : 'lines'}
              </div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="text-lg font-semibold text-foreground">{meta.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {meta.blurb}
              </p>
              <div className="mt-4 flex justify-center">
                <span className="inline-flex w-fit items-center justify-center rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                  Browse {meta.name.toLowerCase()}
                </span>
              </div>
            </div>
          </>
        )

        if (onSelect) {
          return (
            <button
              key={meta.name}
              type="button"
              onClick={() => onSelect(meta.name)}
              className={cardClassName}
              aria-label={`Browse ${meta.name}`}
              aria-current={isActive ? 'true' : undefined}
            >
              {overlay}
            </button>
          )
        }

        const href = `/quote/${slugifyCategory(meta.name)}`
        return (
          <Link
            key={meta.name}
            href={href}
            className={cardClassName}
            aria-current={isActive ? 'true' : undefined}
          >
            {overlay}
          </Link>
        )
      })}
    </div>
  )
}