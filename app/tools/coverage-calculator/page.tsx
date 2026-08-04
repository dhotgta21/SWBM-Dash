// app/tools/coverage-calculator/page.tsx
// Coverage calculator for paint, render, primer, sealant, adhesive and grout.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { CoverageCalculator } from './CoverageCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Coverage Calculator | Paint, Render, Primer & Adhesive' },
  description:
    'Free coverage calculator. Work out how much paint, render, primer, sealant, tile adhesive or grout you need for your area.',
  keywords: [
    'coverage calculator',
    'paint coverage calculator',
    'material coverage calculator',
    'how much paint do i need',
    'paint per m2',
    'coverage rate calculator',
    'coating coverage calculator',
  ],
  alternates: { canonical: canonical('tools/coverage-calculator') },
}

export default function CoverageCalculatorPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Coverage Calculator',
      description: 'Free coverage calculator for paint, render, primer, sealant, adhesive and grout.',
      url: canonical('tools/coverage-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the coverage calculator',
      description: 'Calculate material coverage in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the surface', text: 'Length × width × number of coats in metres.' },
        { '@type': 'HowToStep', name: 'Set coverage rate', text: 'Pick a material from the dropdown. Coverage rates are pre-loaded for common paints and sealants.' },
        { '@type': 'HowToStep', name: 'Read the result', text: 'The calculator returns litres or kg needed including a 10% wastage allowance.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Add to your trade quote for same-day delivery.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-coverage-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Coverage calculator', href: '/tools/coverage-calculator' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Coverage calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Estimate paint, render, primer, sealant, tile adhesive and grout
              quantities by wall or floor area and number of coats. Built for
              decorators, renderers and tilers quoting on the tools.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <CoverageCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                What the coverage calculator does
              </h2>
              <p className="mt-3">
                Pick your product (emulsion, masonry paint, primer, render,
                floor paint, tile adhesive or grout), enter the area in
                square metres and the number of coats, and the calculator
                returns the total litres or kilograms you need to order.
                Coverage rates are based on the manufacturer&apos;s published
                spread rate for porous UK substrates, so the figures err on
                the side of caution for typical trade work.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Typical coverage rates
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Emulsion paint: 10&ndash;12&nbsp;m&sup2; per litre per coat on sealed plaster.</li>
                <li>Masonry paint: 4&ndash;6&nbsp;m&sup2; per litre on rough render or brick.</li>
                <li>Zinsser or acrylic primer: 8&ndash;10&nbsp;m&sup2; per litre.</li>
                <li>Tile adhesive: roughly 4&nbsp;kg/m&sup2; for standard 200&nbsp;mm floor tiles with a 10&nbsp;mm notch trowel.</li>
                <li>Cement-based grout: 0.5&nbsp;kg per m&sup2; for 300&nbsp;mm floor tiles with a 5&nbsp;mm joint.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Tips for accurate estimates
              </h2>
              <p className="mt-3">
                Measure every wall and subtract large openings (windows,
                doors, baths) for a true net area. Add 10% wastage on
                textured renders and 5% on smooth paints to cover roller
                uptake, cutting in around edges and touch-ups. For tile
                adhesive, increase to 15% on large-format boards where back-
                buttering is required.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a materials quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="coverage-calculator" />
    </div>
  )
}
