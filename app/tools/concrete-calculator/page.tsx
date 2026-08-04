// app/tools/concrete-calculator/page.tsx
// Concrete volume calculator for slabs, footings and columns.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { ConcreteCalculator } from './ConcreteCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Concrete Calculator | Volume for Slabs, Footings & Columns' },
  description:
    'Free concrete volume calculator. Work out how many cubic metres of concrete you need for slabs, strip footings and columns.',
  keywords: [
    'concrete calculator',
    'concrete volume calculator',
    'concrete slab calculator',
    'concrete footing calculator',
    'how much concrete do i need',
    'cubic metres concrete',
    'ready-mix concrete calculator',
  ],
  alternates: { canonical: canonical('tools/concrete-calculator') },
}

export default function ConcreteCalculatorPage() {
  // WebApplication + HowTo schema: the calculator is a free interactive
  // tool, the steps walk the user through the workflow. Both blocks are
  // self-contained and Google can pull them as rich results.
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Concrete Volume Calculator',
      description: 'Free concrete volume calculator. Work out how many cubic metres of concrete you need for slabs, strip footings and columns.',
      url: canonical('tools/concrete-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the concrete calculator',
      description: 'Calculate concrete volume for slabs, footings and columns in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the area', text: 'Measure length, width and depth in metres.' },
        { '@type': 'HowToStep', name: 'Enter dimensions', text: 'Type measurements into the calculator. Add multiple sections for non-rectangular pours.' },
        { '@type': 'HowToStep', name: 'Add wastage', text: 'Apply a 5-10% wastage allowance to cover spillages and uneven sub-base.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Submit the volume to the trade counter for a same-day delivery quote.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-concrete-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Concrete calculator', href: '/tools/concrete-calculator' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Concrete calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Work out how many cubic metres of ready-mix concrete you need
              for slabs, strip footings, pad foundations and columns. Enter
              your dimensions, add a wastage allowance and request a trade
              quote with same-day or next-day delivery.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <ConcreteCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                How the concrete volume calculator works
              </h2>
              <p className="mt-3">
                Enter the length, width and depth of your slab, footing or
                column in metres and the calculator returns the net volume in
                cubic metres. Add a wastage percentage (typically 5&ndash;10%
                for slabs and 10% for footings) to cover over-excavation,
                spillage and pump or wheelbarrow losses. The result is a
                ready-to-order figure for C20, C25, C30, GEN1, GEN3, RC35 or
                foamed concrete.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Slabs, footings and column sizes
              </h2>
              <p className="mt-3">
                A standard 100&nbsp;mm garage slab on a 4&nbsp;m &times;
                6&nbsp;m base needs roughly 2.4&nbsp;m&sup3; of concrete. Strip
                footings for a single-storey extension are typically
                450&nbsp;mm wide &times; 300&nbsp;mm deep, and a 300&nbsp;mm
                square column filled to 2.5&nbsp;m takes around 0.23&nbsp;m&sup3;.
                Adjust your inputs to match the engineer&apos;s drawing and
                remember to include the wastage factor before you order.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Ordering tips from our trade counter
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Round up to the nearest 0.25&nbsp;m&sup3; &mdash; short loads often attract a part-load fee.</li>
                <li>Allow site access for an 8&nbsp;m&sup3; truck and a clear pour area before booking.</li>
                <li>For pours over 6&nbsp;m&sup3; consider a boom pump to cut barrow time and labour cost.</li>
                <li>Confirm the mix strength (C20/C25 etc.) and aggregate size with your engineer or building control.</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a concrete quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="concrete-calculator" />
    </div>
  )
}
