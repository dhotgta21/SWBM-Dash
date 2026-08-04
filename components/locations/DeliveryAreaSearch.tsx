// components/locations/DeliveryAreaSearch.tsx
// Real-time searchable delivery-area finder. Renders the full delivery
// network (~300 towns) grouped by delivery hub, filtered as the user
// types. Replaces the previous static chip strip which became unreadable
// past ~30 items.
//
// Server-side renders every area as a <li> (so the full list is still in
// the page HTML for SEO and AI engines). The client component just toggles
// the hidden state of each item based on the search query, which means
// no JS hydration of the data — keeps the bundle tiny.

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import type { DeliveryArea, DeliveryHub } from '@/lib/delivery-areas'
import { DELIVERY_HUB_LABELS } from '@/lib/delivery-areas'
import { telHref } from '@/lib/company'

interface DeliveryAreaSearchProps {
  /** Every delivery area in the network. Server-rendered for SEO. */
  readonly areas: ReadonlyArray<DeliveryArea>
  /** Slug of the town the visitor is currently viewing — highlighted/excluded. */
  readonly currentSlug?: string
  /** Trade-counter phone to show in the empty-state CTA. */
  readonly phone?: string
}

export function DeliveryAreaSearch({ areas, currentSlug, phone }: DeliveryAreaSearchProps) {
  const [query, setQuery] = useState('')

  // Group by hub once (stable order, hub from the source-of-truth enum).
  const grouped = useMemo(() => {
    const map = new Map<DeliveryHub, DeliveryArea[]>()
    for (const a of areas) {
      if (a.slug === currentSlug) continue
      const list = map.get(a.hub) ?? []
      list.push(a)
      map.set(a.hub, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
    return Array.from(map.entries())
      .map(([hub, list]) => ({ hub, towns: list }))
      .sort((a, b) => a.hub.localeCompare(b.hub))
  }, [areas, currentSlug])

  const q = query.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  const totalTowns = grouped.reduce((sum, g) => sum + g.towns.length, 0)
  const visibleTowns = grouped.reduce(
    (sum, g) => sum + g.towns.filter((t) => matches(t.name)).length,
    0,
  )

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            Find your delivery area
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? `${visibleTowns} of ${totalTowns} towns match “${query}”`
              : `${totalTowns} towns across ${grouped.length} delivery hubs`}
          </p>
        </div>
        <div className="relative sm:w-80">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your town…"
            aria-label="Search delivery areas"
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-9 text-sm text-foreground placeholder:text-placeholder focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {visibleTowns === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
          We don&apos;t list “{query}” as a standard delivery area yet.
          <br />
          {phone ? (
            <>
              Call the trade counter on{' '}
              <Link
                href={telHref(phone)}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                {phone}
              </Link>{' '}
              — if you&apos;re within 50 miles of our Iver yard we&apos;ll arrange a slot.
            </>
          ) : (
            <>
              Call the trade counter — if you&apos;re within 50 miles of our Iver yard
              we&apos;ll arrange a slot.
            </>
          )}
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          {grouped.map(({ hub, towns }) => {
            const visibleInHub = towns.filter((t) => matches(t.name))
            if (q && visibleInHub.length === 0) return null
            return (
              <div key={hub}>
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {DELIVERY_HUB_LABELS[hub]}
                </h4>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {towns.map((area) => (
                    <li key={area.slug} hidden={!matches(area.name)}>
                      <Link
                        href={`/locations/${area.slug}`}
                        className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                      >
                        {area.name}
                        <span className="sr-only"> — delivery information</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
