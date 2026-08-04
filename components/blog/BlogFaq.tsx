// components/blog/BlogFaq.tsx
// FAQ accordion for case-study pages. Server component using
// native <details>/<summary> for accordion behaviour with zero
// client JS. The same Q/A pairs are emitted as FAQPage JSON-LD
// from the parent route so Google can pick up rich-result answers.

import { ChevronDown, HelpCircle } from 'lucide-react'
import type { CaseStudyFaq } from '@/lib/blog/loader'

interface BlogFaqProps {
  readonly items: readonly CaseStudyFaq[]
  readonly heading?: string
}

export function BlogFaq({ items, heading = 'Frequently asked questions' }: BlogFaqProps) {
  if (items.length === 0) return null
  return (
    <section
      aria-labelledby="faq-heading"
      className="my-12 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <HelpCircle className="h-4 w-4" />
        </span>
        <h2
          id="faq-heading"
          className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          {heading}
        </h2>
      </div>
      <div className="mt-6 divide-y divide-border">
        {items.map((item, i) => (
          <details key={i} className="group py-5 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-left">
              <h3 className="text-base font-semibold text-foreground sm:text-lg">
                {item.q}
              </h3>
              <ChevronDown
                className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  )
}