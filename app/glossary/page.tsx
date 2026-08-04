// app/glossary/page.tsx
// Building materials glossary. Targets "what is X" and definition searches.

import type { Metadata } from 'next'
import { canonical } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { Breadcrumbs } from '@/components/seo/Breadcrumbs'

export const metadata: Metadata = {
  title: { absolute: 'Building Materials Glossary | Trade Terms' },
  description:
    'Plain-English definitions of building materials and trade terms. From aggregates, DPC and CLS to OSB, lintels and Type 1 sub-base.',
  keywords: [
    'building materials glossary',
    'builder terms',
    'trade definitions',
    'what is aggregate',
    'building terminology',
    'construction glossary',
    'OSB meaning',
    'DPC meaning',
  ],
  alternates: { canonical: canonical('glossary') },
  openGraph: {
    title: 'Building Materials Glossary | Trade Terms',
    description:
      'Plain-English definitions of building materials and trade terms. From aggregates, DPC and CLS to OSB, lintels and Type 1 sub-base.',
    type: 'website',
    url: canonical('glossary'),
    images: [`${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'https://www.starhawkbm.com'}/opengraph-image`],
  },
}

const TERMS = [
  {
    term: 'Aggregate',
    definition:
      'Bulk granular material used in construction. Common types include sharp sand, ballast, gravel and MOT Type 1 sub-base.',
  },
  {
    term: 'Ballast',
    definition:
      'A mixture of sand and gravel used to make concrete when mixed with cement and water.',
  },
  {
    term: 'Block',
    definition:
      'A concrete or lightweight aircrete masonry unit, usually larger than a brick and used for walls and foundations.',
  },
  {
    term: 'Carcassing timber',
    definition:
      'Structural timber used in framing, stud walls, roofs and floors, typically C16 or C24 graded.',
  },
  {
    term: 'CLS',
    definition:
      'Canadian Lumber Standard. A smooth, planed timber commonly used for stud walls and internal framing.',
  },
  {
    term: 'Damp-proof course (DPC)',
    definition:
      'A waterproof layer built into walls to prevent moisture rising from the ground.',
  },
  {
    term: 'DPM',
    definition: 'Damp-proof membrane. A sheet material used under concrete floors to stop moisture.',
  },
  {
    term: 'Facing brick',
    definition:
      'A brick chosen for its appearance, used on the external visible surface of a wall.',
  },
  {
    term: 'Lintel',
    definition:
      'A structural beam over a door or window opening. Steel lintels are common in cavity-wall construction.',
  },
  {
    term: 'MOT Type 1',
    definition:
      'A crushed stone sub-base material used under roads, patios and driveways for load-bearing support.',
  },
  {
    term: 'OSB',
    definition:
      'Oriented Strand Board. An engineered wood sheet made from compressed strands, used for sheathing and flooring.',
  },
  {
    term: 'Plasterboard',
    definition:
      'Gypsum-based board used to line walls and ceilings. Also known as drywall or gyproc.',
  },
  {
    term: 'Plywood',
    definition:
      'A sheet material made from thin layers of wood veneer glued together, used for formwork, flooring and furniture.',
  },
  {
    term: 'Screed',
    definition:
      'A thin layer of sand and cement laid over a concrete floor to create a smooth, level finish.',
  },
  {
    term: 'Sharp sand',
    definition:
      'Coarse, gritty sand used in concrete, mortar and as a bedding layer for paving.',
  },
  {
    term: 'Sub-base',
    definition:
      'The load-bearing layer beneath a driveway, patio or floor slab, usually MOT Type 1.',
  },
  {
    term: 'Thermalite / Aircrete',
    definition:
      'Lightweight aerated concrete blocks with good insulation properties, used for internal and external walls.',
  },
  {
    term: 'Wastage',
    definition:
      'Extra material allowed for cuts, breakages and minor mistakes. Typically 5–10% for bricks, blocks and tiles.',
  },
  {
    term: 'Cement',
    definition:
      'A powdered binder that sets hard when mixed with water. Combined with sand and aggregate it makes mortar or concrete.',
  },
  {
    term: 'Stud wall',
    definition:
      'A non-load-bearing internal wall built from a timber or metal frame lined with plasterboard.',
  },
  {
    term: 'Joist',
    definition:
      'A horizontal structural timber or steel member that supports a floor, ceiling or flat roof.',
  },
  {
    term: 'Battens',
    definition:
      'Small-section lengths of timber used to fix roof tiles, support plasterboard or provide a fixing for cladding.',
  },
  {
    term: 'Gravel board',
    definition:
      'A board fitted at the bottom of a fence panel to keep the timber off the ground and extend its life.',
  },
]

export default function GlossaryPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'Building Materials Glossary',
    description: 'Plain-English definitions of building materials and trade terms.',
    url: canonical('glossary'),
    definedTerm: TERMS.map((t) => ({
      '@type': 'DefinedTerm',
      name: t.term,
      description: t.definition,
    })),
  }

  return (
    <div className="bg-background">
      <JsonLd id="ld-glossary" data={jsonLd} />

      <section className="border-b border-border bg-muted/30 py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Glossary', href: '/glossary' }]} />
          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Resources
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Building materials glossary
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Plain-English definitions of the building materials and trade terms you will see on
              site, on drawings and on our quotes. Whether you are a homeowner planning an extension
              or a tradesperson quoting a job, this glossary explains the jargon in one sentence.
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <dl className="divide-y divide-border rounded-2xl border border-border bg-card px-6 py-2 shadow-sm sm:px-8">
            {TERMS.map(({ term, definition }) => (
              <div key={term} className="py-5">
                <dt className="text-lg font-bold text-foreground">{term}</dt>
                <dd className="mt-1 text-base leading-relaxed text-muted-foreground">{definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  )
}
