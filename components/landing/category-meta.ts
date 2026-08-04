// components/landing/category-meta.ts
// Maps each product category name to the metadata the marketing site
// needs: a stable image filename, a Lucide icon, and a one-line
// description for the public catalogue grid.
//
// Keep this list in lock-step with lib/products.ts COMMON_CATEGORIES.
// Anything missing here is simply omitted from the landing-page grid
// (no broken images, no empty cards) — the catalogue inside the
// dashboard remains the source of truth.

import {
  Layers,
  Droplets,
  Box,
  ToyBrick,
  Trees,
  Snowflake,
  ShieldHalf,
  PanelsTopLeft,
  Construction,
  Home,
  Pipette,
  Wrench,
  Pin,
  type LucideIcon,
} from 'lucide-react'

export interface CategoryMeta {
  /** Display name — exactly matches products.category text. */
  name: string
  /** Slug used to look up the generated marketing image. */
  slug: string
  /** Lucide icon used as a small overlay on the category card. */
  icon: LucideIcon
  /** Single-line marketing description shown under the title. */
  blurb: string
}

export const CATEGORY_META: CategoryMeta[] = [
  {
    name: 'Aggregates & Cement',
    slug: 'aggregates-cement',
    icon: Layers,
    blurb: 'Sharp sand, ballast, gravel and Type 1 sub-base by the tonne.',
  },
  {
    name: 'Cement & Additives',
    slug: 'cement-additives',
    icon: Droplets,
    blurb: 'Portland, rapid-set and specialist binders for every mix.',
  },
  {
    name: 'Plasterboard',
    slug: 'plasterboard',
    icon: PanelsTopLeft,
    blurb: 'Standard, moisture-resistant and fire-rated wallboard.',
  },
  {
    name: 'Blocks',
    slug: 'blocks',
    icon: Box,
    blurb: 'Dense, hollow and aircrete blocks in common sizes.',
  },
  {
    name: 'Bricks',
    slug: 'bricks',
    icon: ToyBrick,
    blurb: 'Wirecut facing and engineering-class bricks.',
  },
  {
    name: 'Timber',
    slug: 'timber',
    icon: Trees,
    blurb: 'CLS, treated carcassing, skirting and cladding.',
  },
  {
    name: 'Cavity Insulation',
    slug: 'cavity-insulation',
    icon: Snowflake,
    blurb: 'Mineral wool batts for full-fill and partial-fill walls.',
  },
  {
    name: 'PIR Insulation',
    slug: 'pir-insulation',
    icon: ShieldHalf,
    blurb: 'High-performance rigid foam boards for roofs and floors.',
  },
  {
    name: 'Sheet Materials',
    slug: 'sheet-materials',
    icon: PanelsTopLeft,
    blurb: 'OSB, hardwood plywood and MDF sheet in stock.',
  },
  {
    name: 'Steel & Lintels',
    slug: 'steel-lintels',
    icon: Construction,
    blurb: 'Catnic and IG lintels plus structural steel sections.',
  },
  {
    name: 'Roofing',
    slug: 'roofing',
    icon: Home,
    blurb: 'Concrete tiles, dry ridge kits and breathable underlay.',
  },
  {
    name: 'Drainage',
    slug: 'drainage',
    icon: Pipette,
    blurb: '110mm pipe, gullies and 450mm inspection chambers.',
  },
  {
    name: 'Fixings',
    slug: 'fixings',
    icon: Pin,
    blurb: 'Frame fixings, clout nails and structural screws.',
  },
  {
    name: 'Tools',
    slug: 'tools',
    icon: Wrench,
    blurb: 'Trowels, levels and the everyday kit a bricklayer needs.',
  },
]

/** Look up the metadata for a category name. Used by the landing page
 *  to enrich raw DB rows. Returns null when the category isn't in the
 *  marketing list (e.g. "Miscellaneous") so we can skip it cleanly. */
export function metaFor(name: string | null | undefined): CategoryMeta | null {
  if (!name) return null
  return CATEGORY_META.find((m) => m.name === name) ?? null
}
