// components/locations/DeliveryHubGrid.tsx
// Visual map of the delivery network. Renders one card per delivery hub
// with a count of sub-towns and the primary post town. The card is a
// link to the hub's /locations/[slug] page so visitors can deep-dive into
// any region of the network in one click.

import Link from 'next/link'
import { ArrowRight, MapPin } from 'lucide-react'
import {
  DELIVERY_AREAS,
  DELIVERY_HUB_LABELS,
  DELIVERY_HUB_SLUGS,
  type DeliveryHub,
} from '@/lib/delivery-areas'

interface DeliveryHubGridProps {
  /**
   * Optional list of hub slugs the visitor is most likely to be interested
   * in. When provided, these hubs render first; everything else follows in
   * the natural hub order. When omitted, all hubs are shown in enum order.
   */
  readonly prioritiseHubs?: ReadonlyArray<DeliveryHub>
}

export function DeliveryHubGrid({ prioritiseHubs }: DeliveryHubGridProps) {
  // Count towns per hub.
  const counts = new Map<DeliveryHub, number>()
  for (const a of DELIVERY_AREAS) {
    counts.set(a.hub, (counts.get(a.hub) ?? 0) + 1)
  }

  // Stable hub order — prioritise first if specified, then everything else.
  const allHubs = Object.keys(DELIVERY_HUB_LABELS) as DeliveryHub[]
  const ordered: DeliveryHub[] = prioritiseHubs && prioritiseHubs.length > 0
    ? [
        ...prioritiseHubs,
        ...allHubs.filter((h) => !prioritiseHubs.includes(h)),
      ]
    : allHubs

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordered.map((hub) => {
        const count = counts.get(hub) ?? 0
        const primarySlug = DELIVERY_HUB_SLUGS[hub]
        const previewTowns = DELIVERY_AREAS
          .filter((a) => a.hub === hub && a.slug !== primarySlug)
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 3)
          .map((a) => a.name)
        return (
          <Link
            key={hub}
            href={`/locations/${primarySlug}`}
            className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="inline-flex rounded-xl bg-primary/10 p-2.5 text-primary">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                {count} {count === 1 ? 'area' : 'areas'}
              </span>
            </div>
            <h3 className="mt-4 text-base font-bold tracking-tight text-foreground">
              {DELIVERY_HUB_LABELS[hub]}
            </h3>
            {previewTowns.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {previewTowns.join(' · ')}
                {count > previewTowns.length + 1 ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground/70">
                      and {count - previewTowns.length - 1} more
                    </span>
                  </>
                ) : null}
              </p>
            )}
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View hub
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}
