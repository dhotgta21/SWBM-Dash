// lib/locations.ts
// Unified location-page loader. A /locations/[town] page can be backed by
// one of two sources:
//
//   1. Case studies (lib/blog/loader.ts) — the town has at least one project
//      case study. Page gets a case studies section + all the SEO treatment.
//   2. Delivery areas (lib/delivery-areas.ts) — the town is in our delivery
//      round but doesn't yet have a case study. Page still gets the full
//      SEO treatment (delivery highlights, options table, nearby areas,
//      delivery FAQ, Service JSON-LD) so it ranks for "delivery {town}".
//
// Without this merge, delivery-only towns would 404 and we'd lose the long-
// tail search traffic for "delivery Datchet", "aggregates Burnham",
// "builders merchant Taplow" etc. — exactly the queries that win local SEO.

import { listLocationTowns, type LocationTown } from './blog/loader'
import { DELIVERY_AREAS, type DeliveryHub } from './delivery-areas'

export interface LocationPage extends LocationTown {
  /** Which delivery hub this town belongs to (drives cluster grouping). */
  hub: DeliveryHub
  /** True when the page has at least one case study to render. */
  hasCaseStudies: boolean
}

/**
 * Look up a town by URL slug. Case-study towns take precedence — they have
 * more content, so the page that gets built is the richer one. Delivery-only
 * towns are a fallback so the route still renders a useful page.
 */
export function getLocationForPage(slug: string): LocationPage | undefined {
  // 1. Case-study towns (more content, wins when both exist).
  const fromCaseStudies = listLocationTowns().find((l) => l.slug === slug)
  if (fromCaseStudies) {
    const fromDelivery = DELIVERY_AREAS.find((a) => a.slug === slug)
    return {
      ...fromCaseStudies,
      hub: fromDelivery?.hub ?? 'slough',
      hasCaseStudies: true,
    }
  }

  // 2. Delivery-only towns — get a proper /locations/[town] page even when
  //    no case study has been written yet.
  const fromDelivery = DELIVERY_AREAS.find((a) => a.slug === slug)
  if (fromDelivery) {
    return {
      town: fromDelivery.name,
      slug: fromDelivery.slug,
      county: fromDelivery.county,
      postCount: 0,
      hub: fromDelivery.hub,
      hasCaseStudies: false,
    }
  }

  return undefined
}

/**
 * All distinct town slugs that should generate a /locations/[town] page.
 * Used by `generateStaticParams` in the route handler.
 */
export function listLocationSlugs(): string[] {
  const fromCaseStudies = listLocationTowns().map((l) => l.slug)
  const fromDelivery = DELIVERY_AREAS.map((a) => a.slug)
  return Array.from(new Set([...fromCaseStudies, ...fromDelivery]))
}

/** All distinct towns, sorted alphabetically. */
export function listLocationTownsForPages(): LocationPage[] {
  return listLocationSlugs()
    .map((slug) => getLocationForPage(slug))
    .filter((l): l is LocationPage => l !== undefined)
    .sort((a, b) => a.town.localeCompare(b.town))
}

/**
 * Nearby delivery towns for a given location page, ordered so the same-hub
 * towns come first (these are the ones a visitor most likely also wants to
 * see), then the rest of the same county, then the rest of the network.
 */
export function listNearbyDeliveryTowns(
  page: LocationPage,
  options: { limit?: number; includeSameHubFirst?: boolean } = {},
): Array<{ name: string; slug: string; county: string; hub: DeliveryHub }> {
  const { includeSameHubFirst = true } = options
  const limit = options.limit ?? Infinity

  const others = DELIVERY_AREAS.filter((a) => a.slug !== page.slug)

  const sorted = includeSameHubFirst
    ? [
        ...others.filter((a) => a.hub === page.hub),
        ...others.filter((a) => a.county === page.county && a.hub !== page.hub),
        ...others.filter((a) => a.county !== page.county),
      ]
    : others

  return sorted.slice(0, limit).map((a) => ({
    name: a.name,
    slug: a.slug,
    county: a.county,
    hub: a.hub,
  }))
}
