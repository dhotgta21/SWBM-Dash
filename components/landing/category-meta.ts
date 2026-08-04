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
  // Demo vertical sample categories (plumbing / electrical / windows / tile)
  {
    name: 'Copper Tube & Fittings',
    slug: 'copper-tube-fittings',
    icon: Pipette,
    blurb: 'Copper tube, end-feed and press-fit fittings for heating and water.',
  },
  {
    name: 'Plastic Pipe Systems',
    slug: 'plastic-pipe-systems',
    icon: Droplets,
    blurb: 'Push-fit and solvent-weld plastic pipe systems for trade installs.',
  },
  {
    name: 'Valves & Controls',
    slug: 'valves-controls',
    icon: Wrench,
    blurb: 'Isolation valves, TRVs and zone controls for wet systems.',
  },
  {
    name: 'Heating & Cylinders',
    slug: 'heating-cylinders',
    icon: Home,
    blurb: 'Unvented cylinders, pumps and heating accessories.',
  },
  {
    name: 'Sanitaryware Trade',
    slug: 'sanitaryware-trade',
    icon: Box,
    blurb: 'Trade sanitaryware packs for bathroom and WC installs.',
  },
  {
    name: 'Cable & Flex',
    slug: 'cable-flex',
    icon: Pin,
    blurb: 'Twin and earth, flex and armoured cable by the drum or cut.',
  },
  {
    name: 'Containment',
    slug: 'containment',
    icon: Layers,
    blurb: 'Trunking, conduit and cable tray for clean first fix.',
  },
  {
    name: 'Switchgear & Boards',
    slug: 'switchgear-boards',
    icon: Construction,
    blurb: 'Consumer units, breakers and distribution accessories.',
  },
  {
    name: 'Lighting Trade',
    slug: 'lighting-trade',
    icon: Home,
    blurb: 'LED downlights, battens and exterior fittings for trade.',
  },
  {
    name: 'Wiring Accessories',
    slug: 'wiring-accessories',
    icon: Pin,
    blurb: 'Sockets, switches and faceplates in common finishes.',
  },
  {
    name: 'uPVC Frames',
    slug: 'upvc-frames',
    icon: PanelsTopLeft,
    blurb: 'uPVC window and door frames for installer programmes.',
  },
  {
    name: 'Aluminium Systems',
    slug: 'aluminium-systems',
    icon: Construction,
    blurb: 'Aluminium window and door systems for modern builds.',
  },
  {
    name: 'Glass & Glazing',
    slug: 'glass-glazing',
    icon: PanelsTopLeft,
    blurb: 'IGUs and glazing packs matched to frame schedules.',
  },
  {
    name: 'Hardware & Handles',
    slug: 'hardware-handles',
    icon: Wrench,
    blurb: 'Hinges, handles, multipoint locks and keep sets.',
  },
  {
    name: 'Sealants & Fixings',
    slug: 'sealants-fixings',
    icon: Pin,
    blurb: 'Silicone, expanding foam and frame fixings for install day.',
  },
  {
    name: 'Porcelain Tiles',
    slug: 'porcelain-tiles',
    icon: Layers,
    blurb: 'Large-format porcelain for floors and walls.',
  },
  {
    name: 'Ceramic Tiles',
    slug: 'ceramic-tiles',
    icon: Box,
    blurb: 'Wall and floor ceramic ranges for domestic and commercial.',
  },
  {
    name: 'Natural Stone',
    slug: 'natural-stone',
    icon: Layers,
    blurb: 'Travertine, limestone and slate packs for premium finishes.',
  },
  {
    name: 'Adhesives & Grouts',
    slug: 'adhesives-grouts',
    icon: Droplets,
    blurb: 'Flexible adhesives, grouts and primers for wet areas.',
  },
  {
    name: 'Trims & Profiles',
    slug: 'trims-profiles',
    icon: Pin,
    blurb: 'Tile trims, movement joints and edge profiles.',
  },
]

/** Look up the metadata for a category name. Used by the landing page
 *  to enrich raw DB rows. Returns null when the category isn't in the
 *  marketing list (e.g. "Miscellaneous") so we can skip it cleanly. */
export function metaFor(name: string | null | undefined): CategoryMeta | null {
  if (!name) return null
  return CATEGORY_META.find((m) => m.name === name) ?? null
}
