// components/blog/ArticleCta.tsx
// Bottom-of-post call-to-action for advice / blog articles. Drives the
// visitor toward a quote or to browse the catalogue.

import Link from 'next/link'
import { ArrowRight, Phone, CheckCircle2 } from 'lucide-react'

interface ArticleCtaProps {
  readonly category?: string
}

export function ArticleCta({ category }: ArticleCtaProps) {
  const promises = [
    {
      headline: 'Same-day delivery',
      detail: 'Aggregates, bricks, timber and more delivered across Berkshire, Buckinghamshire, Surrey and beyond.',
    },
    {
      headline: 'Written quote with VAT',
      detail: 'Line-by-line pricing, no hidden extras.',
    },
    {
      headline: 'Trade counter support',
      detail: 'Speak to a team that understands schedules, specifications and site constraints.',
    },
  ]

  return (
    <section className="mt-14 overflow-hidden rounded-2xl bg-foreground text-background shadow-lg">
      <div className="grid gap-8 p-8 sm:p-10 lg:grid-cols-12 lg:gap-10 lg:p-12">
        <div className="flex flex-col lg:col-span-7">
          <div className="flex items-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              {category ? `${category} advice` : 'Expert advice'}
            </span>
          </div>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Need materials for your project?
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80 sm:text-base">
            Send us your material schedule and we&apos;ll come back with stock
            availability, a written quote and a delivery slot, usually within
            the hour during trade hours.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Build a quote list <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-md border border-white/20 bg-transparent px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              <Phone className="h-4 w-4" /> Call the trade counter
            </Link>
          </div>
        </div>

        <aside className="self-start rounded-xl border border-white/10 bg-white/5 p-6 lg:col-span-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">
            What you get back
          </h3>

          <ul className="mt-5 grid gap-x-4 gap-y-5">
            {promises.map((p) => (
              <li key={p.headline} className="grid grid-cols-[auto_1fr] items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{p.headline}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/70">{p.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}
