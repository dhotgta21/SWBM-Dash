// components/landing/Faq.tsx
// Renders a short FAQ block on the home page. The questions target the
// long-tail queries we want to rank for ("builders merchant Slough",
// "do you deliver to Reading", "trade account near me") and the same
// data is emitted as FAQPage JSON-LD from app/page.tsx so Google can
// pull the answers into rich-result snippets.
//
// Implementation note: this is a server component for SEO (the markup
// is fully present in the initial HTML) but each question is wrapped
// in a native <details> element so we get accordion behaviour with no
// client JS.

import { ChevronDown } from 'lucide-react'

export interface FaqItem {
  q: string
  a: string
}

interface FaqProps {
  items: FaqItem[]
}

export function Faq({ items }: FaqProps) {
  if (items.length === 0) return null
  return (
    <section id="faq" className="scroll-mt-20 bg-muted/40 py-20 lg:py-24" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Common questions
          </span>
          <h2
            id="faq-heading"
            className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
          >
            Builders merchant FAQs
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Quick answers to the questions builders and self-builders
            ask us most often, covering delivery, trade accounts and
            same-day stock.
          </p>
        </div>

        <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
          {items.map((item, i) => (
            <details
              key={i}
              className="group px-6 py-5 [&[open]]:bg-muted/30"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  {item.q}
                </h3>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
