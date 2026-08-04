// components/calculators/CalculatorExtras.tsx
// Reusable "Common projects" + FAQ blocks for individual calculator pages.
// Content is looked up by pageId from lib/calculators/extras.ts so each
// calculator page only has to render <CalculatorExtras pageId="..." />.

import { HelpCircle, Wrench } from 'lucide-react'
import { JsonLd } from '@/components/seo/JsonLd'
import { CALCULATOR_EXTRAS } from '@/lib/calculators/extras'

export interface CalculatorProject {
  readonly name: string
  readonly description: string
}

export interface CalculatorFaq {
  readonly question: string
  readonly answer: string
}

interface CalculatorExtrasProps {
  readonly pageId: string
}

export function CalculatorExtras({ pageId }: CalculatorExtrasProps) {
  const content = CALCULATOR_EXTRAS[pageId]
  if (!content) return null

  const { commonProjects, faqs } = content

  const faqLd =
    faqs.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        }
      : null

  return (
    <>
      {faqLd && <JsonLd id={`ld-${pageId}-faq`} data={faqLd} />}

      {commonProjects.length > 0 && (
        <section className="border-t border-border py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Common projects
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/80">
              Quick reference quantities for the jobs we get asked about most.
              Enter your own measurements in the calculator above for an exact
              figure.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {commonProjects.map((project, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
                >
                  <div className="inline-flex rounded-lg bg-primary/10 p-2 text-primary">
                    <Wrench className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      {project.name}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                      {project.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Frequently asked questions
              </h2>
              <dl className="mt-8 space-y-4">
                {faqs.map((faq, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <dt className="flex items-start gap-3 text-base font-semibold text-foreground">
                      <HelpCircle
                        className="h-5 w-5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {faq.question}
                    </dt>
                    <dd className="mt-2 text-sm leading-relaxed text-foreground/80">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
