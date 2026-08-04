// app/tools/plaster-calculator/page.tsx
// Plaster, render and plasterboard quantity calculator.

import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { PlasterCalculator } from './PlasterCalculator'

export const metadata: Metadata = {
  title: { absolute: 'Plaster Calculator | Bags, Render & Plasterboard Estimator' },
  description:
    'Free plaster calculator. Estimate plaster bags, render quantity or plasterboard sheets for walls and ceilings.',
  keywords: [
    'plaster calculator',
    'render calculator',
    'plasterboard calculator',
    'how much plaster do i need',
    'plaster quantity calculator',
    'skim coat calculator',
    'wall plaster calculator',
  ],
  alternates: { canonical: canonical('tools/plaster-calculator') },
}

export default function PlasterCalculatorPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Plaster Calculator',
      description: 'Free plaster, render and plasterboard calculator.',
      url: canonical('tools/plaster-calculator'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the plaster calculator',
      description: 'Calculate plaster quantities in 4 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Measure the surface', text: 'Length × height in metres for walls. Length × width for ceilings. Subtract openings.' },
        { '@type': 'HowToStep', name: 'Pick a finish', text: 'Plaster (skim coat), render (multi-coat) or plasterboard sheets.' },
        { '@type': 'HowToStep', name: 'Read the result', text: 'The calculator returns bags, tonnes or board count depending on the finish selected.' },
        { '@type': 'HowToStep', name: 'Get a quote', text: 'Submit quantities to the trade counter for same-day delivery.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-plaster-calculator" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Tools', href: '/tools' },
              { label: 'Plaster calculator', href: '/tools/plaster-calculator' },
            ]}
          />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Plaster calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Estimate plaster bags, sand &amp; cement render quantity or
              plasterboard sheets for walls and ceilings. Pick your finish,
              enter the area and we&apos;ll return bag counts and wastage
              figures ready for a trade quote.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <PlasterCalculator />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Plaster, render or plasterboard?
              </h2>
              <p className="mt-3">
                Use the calculator to estimate three common finishes. For
                skim-only work on plasterboard, choose <em>finish plaster</em>
                &mdash; one 25&nbsp;kg bag covers roughly 10&ndash;11&nbsp;m&sup2;
                at 2&nbsp;mm. For two-coat work on blockwork, choose
                <em> backing plaster</em> at 11&nbsp;mm followed by a 2&nbsp;mm
                skim. For external walls, switch to <em>render</em> and
                enter the total depth across scratch and float coats.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Plasterboard sheet counts
              </h2>
              <p className="mt-3">
                Standard 2.4&nbsp;&times;&nbsp;1.2&nbsp;m wallboard covers
                2.88&nbsp;m&sup2; per sheet. For ceilings use 2.4&nbsp;&times;&nbsp;1.2&nbsp;m
                plasterboard at 2.88&nbsp;m&sup2; or 1.8&nbsp;&times;&nbsp;0.9&nbsp;m
                for awkward sizes. Add 10% for off-cuts on rectangular rooms
                and 15% on irregular layouts with dormers or stair wells.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Trade tips
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>Always check suction on the background &mdash; high-suction blocks need a water spray or bonding agent.</li>
                <li>Allow 24&nbsp;hours between backing and skim coats in normal drying conditions.</li>
                <li>For external render, allow 1&nbsp;mm extra per coat for wastage on hawk and board losses.</li>
                <li>Buy plasterboard in full packs where possible &mdash; trade pack pricing is significantly cheaper than break-pack.</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/quote"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get a plaster quote
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="plaster-calculator" />
    </div>
  )
}
