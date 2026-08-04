// components/landing/TrustStrip.tsx
// Thin horizontal strip of trust signals that sits directly under the
// hero. The full town list lives in the DeliveryAreas section below;
// this strip gives a fast credibility scan without repeating coverage.
//
// Layout is intentionally a single horizontal row with vertical dividers
// between cells (not the usual icon-stack pattern used by Services and
// other sections) so this reads as a "ledger" rather than another card
// grid.

import { Clock, Truck, BadgeCheck, ShieldCheck } from 'lucide-react'

export function TrustStrip() {
  const items = [
    { icon: Clock, title: 'Open 7am – 5pm', sub: 'Mon–Fri · 8am–12pm Sat' },
    {
      icon: Truck,
      title: 'Local delivery',
      sub: 'On our own lorries across the South East',
    },
    { icon: BadgeCheck, title: 'Trade accounts', sub: 'Volume pricing for regulars' },
    { icon: ShieldCheck, title: 'Quality stock', sub: 'Sourced from named brands' },
  ]

  return (
    <section
      aria-labelledby="trust-strip-heading"
      className="border-y border-border bg-card"
    >
      {/* Visible heading is overkill for a thin strip; the sr-only H2
          gives search engines a single, unambiguous topic for the
          four cells so they can index it alongside the rest of the
          landing page. */}
      <h2 id="trust-strip-heading" className="sr-only">
        Why builders choose {`Star Hawk Builders Merchant`}
      </h2>
      <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
        {items.map(({ icon: Icon, title, sub }, idx) => (
          <div
            key={title}
            className={[
              'flex items-start gap-3 py-5 sm:py-6',
              // Vertical dividers between cells on tablet+, horizontal dividers
              // on mobile so the layout stays tight at every breakpoint.
              idx % 2 === 1 ? 'pl-5 sm:pl-0' : 'pr-5 sm:pr-0',
              idx >= 2 ? 'border-t border-border sm:border-t-0' : '',
              idx > 0 ? 'sm:border-l sm:border-border sm:pl-8' : '',
            ].join(' ')}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
