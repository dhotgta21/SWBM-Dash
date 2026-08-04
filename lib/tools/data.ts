// lib/tools/data.ts
// Central catalogue of tool pages under /tools. Keeping this in one place
// means both the /tools hub and the sitemap stay in sync automatically —
// adding a new tool page here surfaces it in the hub and in /sitemap.xml
// without touching either consumer.

import type { LucideIcon } from 'lucide-react'
import {
  Calculator,
  ArrowRightLeft,
  Ruler,
  Box,
  Grid3X3,
  PaintBucket,
  Droplets,
} from 'lucide-react'

export interface ToolPage {
  /** URL slug. For /tools pages this doubles as the route segment. */
  readonly slug: string
  /** Destination href. May point outside /tools (e.g. the calculator suite). */
  readonly href: string
  /** Lucide icon rendered on the hub card. */
  readonly icon: LucideIcon
  /** Card / page title. */
  readonly title: string
  /** Short description shown on the hub card and used for JSON-LD. */
  readonly description: string
  /** Card call-to-action label. */
  readonly cta: string
  /** Whether the card shows a "Popular" badge. */
  readonly popular: boolean
}

export const TOOLS: ToolPage[] = [
  {
    slug: 'calculators',
    href: '/quote/calculators',
    icon: Calculator,
    title: 'All material calculators',
    description:
      'The whole suite on one page: bricks, blocks, mortar, concrete, plaster, insulation, roofing, timber, aggregates, screed and lintels.',
    cta: 'Open the suite',
    popular: true,
  },
  {
    slug: 'concrete-calculator',
    href: '/tools/concrete-calculator',
    icon: Box,
    title: 'Concrete calculator',
    description:
      'Work out the volume of ready-mix concrete you need for slabs, strip footings and columns. Built-in wastage allowance.',
    cta: 'Calculate concrete',
    popular: true,
  },
  {
    slug: 'paving-calculator',
    href: '/tools/paving-calculator',
    icon: Grid3X3,
    title: 'Paving calculator',
    description:
      'Estimate slabs, MOT Type 1 sub-base and bedding sand for patios, driveways and pathways.',
    cta: 'Calculate paving',
    popular: false,
  },
  {
    slug: 'tile-calculator',
    href: '/tools/tile-calculator',
    icon: Ruler,
    title: 'Tile calculator',
    description:
      'Work out how many wall or floor tiles you need for any room, including a wastage allowance for cuts and breakages.',
    cta: 'Calculate tiles',
    popular: false,
  },
  {
    slug: 'mortar-calculator',
    href: '/tools/mortar-calculator',
    icon: Droplets,
    title: 'Mortar calculator',
    description:
      'Estimate 25 kg cement bags and building sand for brickwork, blockwork and pointing at 1:3, 1:4, 1:5 or 1:6 mix.',
    cta: 'Calculate mortar',
    popular: true,
  },
  {
    slug: 'plaster-calculator',
    href: '/tools/plaster-calculator',
    icon: PaintBucket,
    title: 'Plaster calculator',
    description:
      'Estimate plaster bags, render quantity or plasterboard sheets for walls and ceilings.',
    cta: 'Calculate plaster',
    popular: false,
  },
  {
    slug: 'coverage-calculator',
    href: '/tools/coverage-calculator',
    icon: PaintBucket,
    title: 'Coverage calculator',
    description:
      'Estimate paint, render, primer, sealant, tile adhesive or grout quantities with manufacturer spread rates.',
    cta: 'Calculate coverage',
    popular: false,
  },
  {
    slug: 'unit-converter',
    href: '/tools/unit-converter',
    icon: ArrowRightLeft,
    title: 'Unit converter',
    description:
      'Convert metres to feet, m² to ft², m³ to cubic yards, kg to tonnes and Celsius to Fahrenheit.',
    cta: 'Convert units',
    popular: false,
  },
]

/** Slugs for pages that actually live under /tools/{slug}. */
export function listToolSlugs(): string[] {
  return TOOLS.filter((t) => t.href.startsWith('/tools/')).map((t) => t.slug)
}
