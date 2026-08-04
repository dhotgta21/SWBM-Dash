// components/seo/FaqSection.tsx
// FAQ section with accordion UI and FAQPage JSON-LD markup. Google can use
// this for rich-result FAQ snippets.

import { ChevronRight } from 'lucide-react'
import { JsonLd } from './JsonLd'

export interface FaqItem {
  question: string
  answer: string
}

interface FaqSectionProps {
  heading?: string
  items: FaqItem[]
}

export function FaqSection({ heading = 'Frequently asked questions', items }: FaqSectionProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <>
      <JsonLd id="ld-faq-section" data={jsonLd} />
      <section aria-labelledby="faq-heading" className="mt-16">
        <h2 id="faq-heading" className="text-2xl font-bold tracking-tight text-foreground">
          {heading}
        </h2>
        <div className="mt-6 grid gap-4">
          {items.map((faq, index) => (
            <details
              key={index}
              className="group rounded-2xl border border-border bg-card px-5 py-4 open:shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground">
                {faq.question}
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
