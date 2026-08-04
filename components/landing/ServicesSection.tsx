// components/landing/ServicesSection.tsx
// Visual block explaining what the merchant does on top of selling
// stock — the things a contractor wants to know (delivery, cutting,
// account terms). The full town/county list lives in the DeliveryAreas
// section below; this block focuses on the services themselves.

import { Truck, Scissors, FileText, BadgePercent, HardHat, Recycle } from 'lucide-react'

export function ServicesSection() {
  const SERVICES = [
    {
      icon: Truck,
      title: 'Own-fleet delivery',
      body: 'Our own lorries cover the South East, with stock lines often on site the same day and bulk aggregates within 24 hours.',
    },
    {
      icon: Scissors,
      title: 'Cut-to-size timber & sheet',
      body: 'Bring your cutting list, walk out with a boot-load. Timber, OSB, plywood and MDF cut while you wait on the trade saw bench.',
    },
    {
      icon: BadgePercent,
      title: 'Trade pricing',
      body: 'Volume pricing on aggregates, cement and steel for active trade accounts.',
    },
    {
      icon: FileText,
      title: 'Quotations turned fast',
      body: 'Email your take-off and we will quote the same day, with line-by-line pricing so you can chop and change without re-quoting.',
    },
    {
      icon: HardHat,
      title: 'Site visits',
      body: 'Need help specifying a lintel or working out the cavity insulation for an extension? Our counter staff have decades on the tools.',
    },
    {
      icon: Recycle,
      title: 'Trade waste removal',
      body: 'Skip and grab-lorry hire for sites across the region. One number, one invoice.',
    },
  ]

  return (
    <section
      id="services"
      aria-labelledby="services-heading"
      className="scroll-mt-20 bg-foreground py-20 text-background lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
            More than stock on shelves
          </span>
          <h2
            id="services-heading"
            className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Built around how builders actually buy.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">
            A merchant should make your day easier, not harder. These are
            the services our regulars tell us they&rsquo;d miss if we stopped.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition-colors hover:bg-white/[0.08]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
