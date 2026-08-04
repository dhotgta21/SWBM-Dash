// app/tools/unit-converter/page.tsx
// Free unit converter for builders: length, area, volume, weight and
// temperature. Targets long-tail "convert X to Y" searches.

import type { Metadata } from 'next'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'
import { CalculatorExtras } from '@/components/calculators/CalculatorExtras'
import { UnitConverter } from './UnitConverter'

export const metadata: Metadata = {
  title: { absolute: 'Unit Converter for Builders | Length, Area, Volume' },
  description:
    'Free builder unit converter. Convert metres to feet, m² to ft², m³ to yards, kg to tonnes and Celsius to Fahrenheit.',
  keywords: [
    'unit converter',
    'metric converter',
    'imperial to metric',
    'feet to metres',
    'm2 to ft2',
    'm3 to ft3',
    'building unit converter',
  ],
  alternates: { canonical: canonical('tools/unit-converter') },
}

export default function UnitConverterPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Unit Converter for Builders',
      description: 'Free builder unit converter for length, area, volume, weight and temperature.',
      url: canonical('tools/unit-converter'),
      applicationCategory: 'UtilityApplication',
      operatingSystem: 'All',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How to use the unit converter',
      description: 'Convert between metric and imperial units in 3 steps.',
      step: [
        { '@type': 'HowToStep', name: 'Pick a category', text: 'Length, area, volume, mass, pressure or temperature.' },
        { '@type': 'HowToStep', name: 'Choose from and to units', text: 'Imperial or metric. Pre-loaded with the most common builder conversions.' },
        { '@type': 'HowToStep', name: 'Read the result', text: 'The calculator returns the converted value to 4 significant figures.' },
      ],
    },
  ]

  return (
    <div className="bg-background">
      <JsonLd id="ld-unit-converter" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Tools', href: '/tools' }, { label: 'Unit converter', href: '/tools/unit-converter' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Builder tools
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Unit converter
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Convert length, area, volume, weight and temperature fast &mdash;
              metres to feet, m&sup2; to ft&sup2;, m&sup3; to cubic yards,
              kilograms to tonnes and Celsius to Fahrenheit. No signup needed.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <UnitConverter />

          <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                About the builder unit converter
              </h2>
              <p className="mt-3">
                Our free unit converter is built for UK trades. Switch between
                metric and imperial in seconds when you are pricing a job,
                reading a plan or quoting against an old specification.
                Coverage includes length (mm, cm, m, inches, feet, yards),
                area (m&sup2;, ft&sup2;, yd&sup2;, acres), volume (litres,
                m&sup3;, ft&sup3;, yd&sup3;, UK gallons), weight (kg,
                tonnes, pounds, stone, 25&nbsp;kg bags) and temperature
                (&deg;C to &deg;F).
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Common conversions for builders
              </h2>
              <p className="mt-3">
                Need to convert square metres to square feet for a floor plan,
                or cubic metres of concrete into cubic yards for a ready-mix
                quote? The converter runs every category in real time, so you
                can flip between metric take-offs and imperial bill-of-quantity
                rates without leaving the page. Use the swap button to reverse
                a conversion without retyping the numbers.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                How to use it
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Pick the conversion category &mdash; length, area, volume, weight or temperature.</li>
                <li>Enter your amount and choose the unit you are converting <em>from</em>.</li>
                <li>Pick the unit you are converting <em>to</em> and read the result instantly.</li>
                <li>Use the swap arrows to reverse the calculation when you need the inverse.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>
      <CalculatorExtras pageId="unit-converter" />
    </div>
  )
}
