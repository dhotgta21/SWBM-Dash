// Public-facing section that lists every town the merchant delivers to.
// Towns are grouped by region so the UI stays tidy and professional even
// with a large coverage area.
//
// Visual treatment is intentionally different from the other sections:
// no large hero heading, no kicker label, no body paragraph. We lead
// with a compact summary band ("20 towns · 7 counties · same-day")
// then a four-row region table so the eye reads "the number → the
// regions → every town" rather than the standard intro-grid pattern.

import Link from 'next/link'
import { MapPinned, Truck, Clock } from 'lucide-react'
import { listLocationTowns } from '@/lib/blog/loader'

export interface DeliveryArea {
  /** Display name, e.g. "Slough". */
  name: string
  /** URL-friendly slug, e.g. "slough". */
  slug: string
  /** County or region, used in the supporting copy and JSON-LD. */
  county: string
}

interface DeliveryAreasProps {
  areas: DeliveryArea[]
}

// Region buckets. The order here controls the card order on the page.
// Each bucket lists the town names that belong to it; the component pulls
// the matching entries from the areas prop so the source of truth stays
// in one place (app/page.tsx).
const REGION_BUCKETS: {
  id: string
  title: string
  lead: string
  towns: string[]
}[] = [
  {
    id: 'greater-london',
    title: 'Greater London & Middlesex',
    lead: 'Same-day across West, North and South London.',
    towns: [
      'Wembley',
      'Harrow',
      'Enfield',
      'Croydon',
      'Hounslow',
      'Southall',
      'Uxbridge',
      'Hayes',
      'Kingston upon Thames',
      'Epsom',
    ],
  },
  {
    id: 'berkshire-buckinghamshire',
    title: 'Berkshire & Buckinghamshire',
    lead: 'Our home corridor, fastest turnaround on stock lines.',
    towns: ['Slough', 'Bracknell', 'Reading', 'Newbury', 'High Wycombe'],
  },
  {
    id: 'surrey-hampshire-beyond',
    title: 'Surrey, Hampshire & Beyond',
    lead: 'Next-day bookings across the wider region.',
    towns: ['Guildford', 'Woking', 'Basingstoke', 'Oxford', 'Swindon'],
  },
]

export function DeliveryAreas({ areas }: DeliveryAreasProps) {
  const areaByName = new Map(areas.map((a) => [a.name, a]))
  const counties = Array.from(new Set(areas.map((a) => a.county))).filter(Boolean)
  const locationSlugs = new Set(listLocationTowns().map((l) => l.slug))

  return (
    <section
      id="delivery-areas"
      aria-labelledby="delivery-areas-heading"
      className="scroll-mt-20 bg-foreground py-20 text-background lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Summary band — different rhythm from the standard kicker/h2
            stack. Three figures in a row so the eye sees numbers first. */}
        <div className="grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/90">
                Local delivery area
              </span>
            </div>
            <h2
              id="delivery-areas-heading"
              className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
            >
              Same-day delivery across {areas.length} towns, {counties.length}{' '}
              counties.
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-6 self-end lg:col-span-5">
            <Summary icon={MapPinned} value={`${areas.length}`} label="Towns on our round" />
            <Summary icon={Truck} value={`${counties.length}`} label="Counties covered" />
            <Summary icon={Clock} value="Same-day" label="Stock lines" />
            <Summary icon={Clock} value="24h" label="Bulk aggregates" />
          </div>
        </div>

        {/* Region table — three columns. Each region is a vertical "card"
            with a header rule, lead description and a vertical list of
            towns (not pill chips — chips felt chatty next to the polished
            stats row above). */}
        <div className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {REGION_BUCKETS.map((region) => {
            const regionAreas = region.towns
              .map((name) => areaByName.get(name))
              .filter((a): a is DeliveryArea => Boolean(a))

            if (regionAreas.length === 0) return null

            return (
              <article
                key={region.id}
                id={`delivery-${region.id}`}
                className="flex flex-col"
              >
                <header className="border-b border-white/15 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      {region.title}
                    </h3>
                    <span className="text-xs uppercase tracking-[0.18em] text-white/50">
                      {regionAreas.length} towns
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {region.lead}
                  </p>
                </header>

                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm sm:grid-cols-1">
                  {regionAreas.map((area) => {
                    const hasLocation = locationSlugs.has(area.slug)
                    const Name = hasLocation ? (
                      <Link
                        href={`/locations/${area.slug}`}
                        className="font-medium text-white/85 transition-colors hover:text-primary"
                      >
                        {area.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{area.name}</span>
                    )
                    return (
                      <li
                        key={area.slug}
                        className="flex items-center gap-2 text-white/85"
                      >
                        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                        {Name}
                        <span className="text-xs uppercase tracking-wide text-white/40">
                          {area.county}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
        </div>

        {/* Out-of-area band — full width, sits flush to the region columns.
            Different surface (slight tint) so it reads as a secondary CTA
            rather than another region. */}
        <div className="mt-12 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              Don&rsquo;t see your town?
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
              We still cover most of the M4, M25 and M3 corridors on
              next-day bookings. Call the trade counter and we&rsquo;ll
              book a slot.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {areas.slice(0, 6).map((area) => {
              const hasLocation = locationSlugs.has(area.slug)
              return hasLocation ? (
                <Link
                  key={area.slug}
                  href={`/locations/${area.slug}`}
                  className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition-colors hover:border-primary hover:text-primary"
                >
                  {area.name}
                </Link>
              ) : (
                <span
                  key={area.slug}
                  className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs text-white/80"
                >
                  {area.name}
                </span>
              )
            })}
            {areas.length > 6 && (
              <Link
                href="/locations"
                className="inline-flex items-center rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition-colors hover:border-primary hover:text-primary"
              >
                +{areas.length - 6} more
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function Summary({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-white/90">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
          {label}
        </span>
      </div>
      <p className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
        {value}
      </p>
      <span className="sr-only">{label}</span>
    </div>
  )
}
