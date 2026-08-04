// components/landing/QuoteCTA.tsx
// Prominent "Get a quote" section that replaces the image-based product
// grid on the home page. Directs visitors to the search-based quote
// builder where they can add products by name or code.

import Link from 'next/link'
import { ArrowRight, Search, ClipboardList, Clock, Truck } from 'lucide-react'

const STEPS = [
  {
    icon: Search,
    title: 'Search',
    body: 'Type a product name or code just like our staff do when raising an invoice.',
  },
  {
    icon: ClipboardList,
    title: 'Build your list',
    body: 'Set quantities and add the lines you need to your quote list.',
  },
  {
    icon: Clock,
    title: 'Same-day quote',
    body: 'Submit the list and we will come back with trade prices and availability.',
  },
  {
    icon: Truck,
    title: 'Delivered',
    body: 'Confirm the quote and we will book a delivery slot on our own lorries.',
  },
]

export function QuoteCTA() {
  return (
    <section
      id="quote"
      aria-labelledby="quote-heading"
      className="scroll-mt-20 bg-muted/40 py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="grid lg:grid-cols-2">
            <div className="p-8 sm:p-12">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Get a quote
              </span>
              <h2
                id="quote-heading"
                className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
              >
                Build your quote online.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                No need to browse hundreds of product cards. Search by name or
                code, add quantities, and send us your list. We&rsquo;ll price
                it and come back with delivery options the same business day.
              </p>

              <div className="mt-8">
                <Link
                  href="/quote"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover"
                >
                  Build your quote list
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </div>
            </div>

            <div className="border-t border-border bg-muted/30 p-8 sm:p-12 lg:border-t-0 lg:border-l">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                How it works
              </h3>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                {STEPS.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
