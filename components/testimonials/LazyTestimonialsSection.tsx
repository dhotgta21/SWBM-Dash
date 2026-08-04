'use client'

import dynamic from 'next/dynamic'

// The testimonials carousel sits well below the fold and is not needed
// for LCP. Lazy-loading it on the client removes its JS from the initial
// homepage bundle, which helps the Lighthouse "Reduce unused JavaScript"
// audit.
export const LazyTestimonialsSection = dynamic(
  () =>
    import('./TestimonialsSection').then(
      (mod) => mod.TestimonialsSection
    ),
  {
    ssr: false,
    loading: () => (
      <section className="py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </section>
    ),
  }
)
