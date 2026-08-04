// app/tools/paving-calculator/page.tsx
// Patio / paving calculator for slabs, sub-base and bedding sand.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { PavingCalculator } from './PavingCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Paving Calculator | Patio Slabs, Sub-base & Bedding Sand' },
  description:
    'Free paving calculator. Work out how many slabs, how much MOT Type 1 sub-base and how much bedding sand you need for your patio.',
  keywords: [
    'paving calculator',
    'patio calculator',
    'slab calculator',
    'paving slabs calculator',
    'MOT Type 1 calculator',
    'how much sand for paving',
    'sub-base calculator',
  ],
  alternates: { canonical: canonical('tools/paving-calculator') },
}

export default function PavingCalculatorPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Paving Calculator',
      description: 'Free patio and paving calculator for slabs, sub-base and bedding sand.',
      url: canonical('tools/paving-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the paving calculator',
      description: 'Calculate paving materials in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the area', text: 'Length × width in metres. For irregular shapes, split into rectangles.' },
        { '@type': 'HowToStep', name: 'Choose slab size', text: 'Standard 600×600mm or 450×450mm. The calculator computes slab count including cuts.' },
        { '@type': 'HowToStep', name: 'Sub-base + bedding', text: 'Add 100mm MOT Type 1 sub-base and 30mm sharp sand bedding. Calculator returns tonnes of each.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Submit quantities to the trade counter for same-day delivery.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-paving-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Paving calculator', href: '/tools/paving-calculator' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Paving calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Estimate paving slabs, MOT Type 1 sub-base and sharp sand for
              patios, pathways and driveways. Enter your area and slab size
              and we&apos;ll work out the quantities in tonnes, bulk bags and
              slab counts.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <PavingCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                How the patio calculator works
              </h2>
              <p className="mt-3">
                Type in the patio length and width in metres, plus the slab
                size you are using. The calculator returns the number of slabs
                you need (including a 5&ndash;10% cutting allowance), the
                volume of MOT Type 1 sub-base in tonnes for a 100&ndash;150&nbsp;mm
                compacted layer, and the volume of sharp bedding sand for a
                25&ndash;50&nbsp;mm screeded bed.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Common slab sizes and coverage
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>600&nbsp;&times;&nbsp;600&nbsp;mm patio slabs &ndash; roughly 2.78 slabs per m&sup2;.</li>
                <li>450&nbsp;&times;&nbsp;450&nbsp;mm slabs &ndash; roughly 4.94 slabs per m&sup2;.</li>
                <li>Indian sandstone 600&nbsp;&times;900&nbsp;mm project packs &ndash; about 1.85 slabs per m&sup2;.</li>
                <li>Block paving 200&nbsp;&times;&nbsp;100&nbsp;mm &ndash; exactly 50 blocks per m&sup2;.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Sub-base and bedding depth
              </h2>
              <p className="mt-3">
                For a domestic patio on well-drained ground, 100&nbsp;mm of
                compacted MOT Type 1 is enough. Add a further 50&nbsp;mm for
                driveways or poor ground. Sharp bedding sand should be
                25&ndash;50&nbsp;mm once screeded &mdash; only lay as much as
                you can pave in a session so the bed stays workable. Jointing
                compound or dry mortar is sold separately in 15&nbsp;kg tubs
                for roughly 5&ndash;8&nbsp;m&sup2; of 600&nbsp;mm paving.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a paving quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="paving-calculator" />
    </div>
  )
}
