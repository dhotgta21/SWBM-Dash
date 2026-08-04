// app/tools/mortar-calculator/page.tsx
// Mortar quantity calculator for brick and block laying.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { MortarCalculator } from './MortarCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Mortar Calculator | Cement & Sand Estimator for Brick & Block' },
  description:
    'Free mortar calculator. Work out how many 25 kg cement bags and how much building sand you need for brickwork and blockwork.',
  keywords: [
    'mortar calculator',
    'mortar mix calculator',
    'cement calculator',
    'mortar quantity calculator',
    'how much mortar do i need',
    'mortar mix ratio',
    '1:4 mortar calculator',
  ],
  alternates: { canonical: canonical('tools/mortar-calculator') },
}

export default function MortarCalculatorPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Mortar Calculator',
      description: 'Free mortar calculator for brickwork and blockwork.',
      url: canonical('tools/mortar-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the mortar calculator',
      description: 'Calculate mortar quantities in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the wall', text: 'Measure wall area in square metres. Subtract openings.' },
        { '@type': 'HowToStep', name: 'Pick a mix ratio', text: 'Choose 1:3, 1:4, 1:5 or 1:6 mix depending on application.' },
        { '@type': 'HowToStep', name: 'Read the result', text: 'The calculator returns 25kg cement bags and bulk-builder sand needed.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Add to your trade quote for same-day delivery.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-mortar-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Tools', href: '/tools' },
              { label: 'Mortar calculator', href: '/tools/mortar-calculator' },
            ]}
          />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Mortar calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Estimate 25&nbsp;kg cement bags and building sand for
              brickwork, blockwork and pointing. Choose your mix ratio
              (1:3, 1:4, 1:5 or 1:6), add a wastage allowance and request a
              trade quote.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <MortarCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                How the mortar calculator works
              </h2>
              <p className="mt-3">
                Enter your wall area in square metres and the calculator
                converts it into litres of wet mortar, then into 25&nbsp;kg
                cement bags and kilograms of building sand based on the mix
                ratio you select. The figures use the trade rule of thumb of
                roughly 1.5&nbsp;kg of dry mortar per standard brick and
                5&nbsp;kg per 440&nbsp;&times;&nbsp;215&nbsp;mm solid block.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Picking the right mortar mix
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li><strong>1:3</strong> &ndash; strong, dense mortar for below-ground work, manholes and coping stones.</li>
                <li><strong>1:4</strong> &ndash; general-purpose mix for external brickwork, load-bearing walls and chimney stacks.</li>
                <li><strong>1:5</strong> &ndash; standard mix for internal blockwork and most above-ground bricklaying.</li>
                <li><strong>1:6</strong> &ndash; weaker, more breathable mix for lime-friendly brick or softstone pointing.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Tips for an accurate order
              </h2>
              <p className="mt-3">
                Always add 10% wastage to cover board clean-down, dropped
                mortar and bed thickness variation. For pointing only, allow
                5% extra. If you are using pre-mixed mortar or silicone
                pointing compounds, change the mix selector in the calculator
                to match the bag coverage on the pack. For brick matching or
                coloured mortar, call the trade counter before ordering.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a mortar quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="mortar-calculator" />
    </div>
  )
}
