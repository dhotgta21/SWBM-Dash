// app/(public-shop)/quote/calculators/page.tsx
// Public hub page for material calculators. Each card links to a
// calculator-type page where users pick a product variant and calculate
// the quantity they need.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Calculator, ArrowRight } from 'lucide-react'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { Button } from '@/components/ui/button'
import { JsonLd } from '@/components/seo/JsonLd'
import { BreadcrumbNav } from '@/components/shop/BreadcrumbNav'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

const CALCULATORS = [
  {
    type: 'BRICK_WALL',
    title: 'Brick & block wall',
    description: 'Calculate bricks, blocks and mortar for walls of any size.',
  },
  {
    type: 'MORTAR_CONCRETE',
    title: 'Mortar & concrete mix',
    description: 'Work out cement, sand and aggregate for mortar and concrete mixes.',
  },
  {
    type: 'SHEET_MATERIALS',
    title: 'Sheet materials',
    description: 'Estimate plywood, OSB and chipboard sheets from the area to cover.',
  },
  {
    type: 'AGGREGATES',
    title: 'Aggregates & sub-base',
    description: 'Calculate MOT Type 1, shingle and sand by area and depth.',
  },
  {
    type: 'SCREED',
    title: 'Screed',
    description: 'Figure out cement and sand quantities for floor screeds.',
  },
  {
    type: 'PLASTERING',
    title: 'Plastering & board',
    description: 'Estimate plaster bags and plasterboard sheets for walls and ceilings.',
  },
  {
    type: 'INSULATION',
    title: 'Insulation',
    description: 'Calculate boards, slabs and rolls for lofts, cavities and walls.',
  },
  {
    type: 'ROOFING',
    title: 'Roofing',
    description: 'Estimate felt, GRP, trims, guttering and damp-proofing for roofs.',
  },
  {
    type: 'TIMBER',
    title: 'Timber & studwork',
    description: 'Work out timber lengths and stud counts for walls and battens.',
  },
  {
    type: 'STEEL_LINTEL',
    title: 'Steel & lintel selector',
    description: 'Find the right lintel length for your opening.',
  },
]

export async function generateMetadata(): Promise<Metadata> {
  const seo = await loadSeoConfig()
  const title = `Material Calculators | ${seo.siteName}`
  const description =
    'Free building material calculators for bricks, blocks, concrete, mortar, plaster, insulation, roofing, timber and steel lintels. Calculate how much you need before requesting a trade quote.'

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalUrl('quote/calculators'),
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl('quote/calculators'),
    },
  }
}

export default async function CalculatorsHubPage() {
  const seo = await loadSeoConfig()

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Material Calculators | ${seo.siteName}`,
    description:
      'Free building material calculators for bricks, blocks, concrete, mortar, plaster, insulation, roofing, timber and steel lintels.',
    url: canonicalUrl('quote/calculators'),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${seo.siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Get a quote', item: canonicalUrl('quote') },
      { '@type': 'ListItem', position: 3, name: 'Calculators', item: canonicalUrl('quote/calculators') },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [collectionJsonLd, breadcrumbJsonLd],
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <JsonLd id="ld-calculators-hub" data={jsonLd} />

      <BreadcrumbNav
        items={[
          { label: 'Home', href: '/' },
          { label: 'Get a quote', href: '/quote' },
          { label: 'Calculators' },
        ]}
      />

      <div className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Material calculators
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          Work out exactly how much you need before requesting a trade quote.
        </p>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATORS.map((calc) => (
          <Link
            key={calc.type}
            href={`/quote/calculators/${calc.type.toLowerCase()}`}
            className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">{calc.title}</h2>
            </div>
            <p className="mt-3 flex-1 text-sm text-muted-foreground">{calc.description}</p>
            <Button variant="ghost" className="mt-4 w-full justify-between gap-2" size="sm">
              Calculate now
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        ))}
      </div>
    </div>
  )
}
