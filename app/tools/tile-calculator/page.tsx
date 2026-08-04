// app/tools/tile-calculator/page.tsx
// Tile calculator for walls and floors.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { TileCalculator } from './TileCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Tile Calculator | How Many Tiles Do I Need?' },
  description:
    'Free tile calculator. Work out how many wall or floor tiles you need, including wastage.',
  keywords: [
    'tile calculator',
    'wall tile calculator',
    'floor tile calculator',
    'how many tiles do i need',
    'tile quantity calculator',
    'tile wastage calculator',
    'bathroom tile calculator',
  ],
  alternates: { canonical: canonical('tools/tile-calculator') },
}

export default function TileCalculatorPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Tile Calculator',
      description: 'Free tile calculator for walls and floors, including wastage allowance.',
      url: canonical('tools/tile-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the tile calculator',
      description: 'Calculate tile quantities in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the surface', text: 'Length × width in metres for the floor or walls. Subtract windows, doors and fixed furniture.' },
        { '@type': 'HowToStep', name: 'Pick tile size', text: 'Common 300×300mm, 600×600mm or 200×100mm brick-bond.' },
        { '@type': 'HowToStep', name: 'Add wastage', text: 'Apply 10% wastage for diagonal cuts, 5% for square laying.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Add to your trade quote for same-day delivery.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-tile-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Tile calculator', href: '/tools/tile-calculator' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Tile calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Work out how many wall or floor tiles you need, including a
              wastage allowance for cuts, corners and breakages. Enter your
              area, pick the tile size and we&apos;ll round up to the nearest
              full box.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <TileCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                How the tile calculator works
              </h2>
              <p className="mt-3">
                Enter the floor or wall area in square metres and select your
                tile size (from 100&nbsp;&times;&nbsp;100&nbsp;mm mosaics up to
                1200&nbsp;&times;&nbsp;600&nbsp;mm large-format slabs). The
                calculator divides your area by the tile coverage and rounds
                up to a whole box, then applies your wastage percentage
                (typically 10% for straight layouts, 15% for diagonal
                patterns or rooms with lots of cuts).
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Wastage allowance guide
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>10% &ndash; standard square or brick-bond pattern in a rectangular room.</li>
                <li>15% &ndash; diagonal (45&deg;) layout, herringbone or rooms with multiple corners.</li>
                <li>20% &ndash; mosaics on mesh, large-format slabs that need a wet saw, or feature borders.</li>
                <li>Always keep one full box spare for future repairs &mdash; tile batches dye-lot differently.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Don&apos;t forget adhesive and grout
              </h2>
              <p className="mt-3">
                Use the <Link href="/tools/coverage-calculator" className="font-medium text-primary hover:text-primary-hover">coverage calculator</Link>
                to estimate your tile adhesive and grout at the same time.
                Standard 200&nbsp;mm floor tiles with a 10&nbsp;mm notch trowel
                need about 4&nbsp;kg of adhesive per m&sup2;, and a 5&nbsp;mm
                grout joint uses roughly 0.5&nbsp;kg of grout per m&sup2;.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a tiling quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="tile-calculator" />
    </div>
  )
}
