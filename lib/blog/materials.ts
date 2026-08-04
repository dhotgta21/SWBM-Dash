// lib/blog/materials.ts
// Auto-link dictionary for case-study blog posts.
//
// Goal: every natural-language mention of a building material in a
// case study becomes a contextual internal link to the matching
// product page (or category page for general mentions). This gives
// Google a strong topical graph between blog content and product
// pages and helps product pages rank for the long-tail queries
// these case studies target.
//
// Match strategy:
//   - `terms` are scanned case-sensitively for the singular form and
//     case-insensitively for variants.
//   - Pluralisation is handled with a small set of suffixes.
//   - The longest match wins when terms overlap (e.g. "building sand"
//     matches before "sand").
//   - Each material links to the most specific product URL when one
//     exists; otherwise to the matching category page so the link
//     still has SEO value.
//
// To add a new material: append to MATERIALS, prefer the longest
// possible phrase first ("MOT Type 1" before "Type 1" before nothing).
//
// IMPORTANT: every href must point to a real product code or category
// slug. The product codes below mirror what the public catalogue
// (scripts/import-berkshire-products.sql + any staff additions) loads.
// If you add a product, update this file in the same commit so the
// auto-linker never sends a visitor to a 404.

export interface MaterialLink {
  /** Primary display term, also the title attribute on the rendered link. */
  readonly term: string
  /** Other natural-language variants (singular/plural/capitalisation). */
  readonly variants: readonly string[]
  /** Product URL (preferred) or category URL. Always starts with `/`. */
  readonly href: string
  /** Short noun for the title attribute, e.g. "Building Sand". */
  readonly productName: string
}

// Category slugs are produced by `slugifyCategory(name)` in
// lib/public-products.ts, which lowercases and replaces runs of
// non-alphanumerics with `-`. So:
//   "Aggregates & Cement" -> "aggregates-and-cement"
//   "Cavity Insulation"   -> "cavity-insulation"
//   "Steel & Lintels"     -> "steel-and-lintels"
// Keep these slugs in sync with that helper if a category name changes.
const CATEGORY = {
  aggregates: '/quote/aggregates-and-cement',
  blocks: '/quote/blocks',
  bricks: '/quote/bricks',
  cavityInsulation: '/quote/cavity-insulation',
  fixings: '/quote/fixings',
  pirInsulation: '/quote/pir-insulation',
  plasterboard: '/quote/plasterboard',
  roofing: '/quote/roofing',
  sheetMaterials: '/quote/sheet-materials',
  steelAndLintels: '/quote/steel-and-lintels',
  timber: '/quote/timber',
} as const

export const MATERIALS: readonly MaterialLink[] = [
  // ── Aggregates & cement ─────────────────────────────────────────────────
  {
    term: 'Portland cement',
    variants: ['Portland cement', 'Portland cements', 'cement', 'cements', 'bag of cement', 'bags of cement'],
    href: '/products/AGG-001',
    productName: 'General Purpose Cement',
  },
  {
    term: 'building sand',
    variants: ['building sand', 'builder\u2019s sand', 'builders sand', 'soft sand'],
    href: '/products/AGG-005',
    productName: 'Building Sand',
  },
  {
    term: 'sharp sand',
    variants: ['sharp sand'],
    href: '/products/AGG-002',
    productName: 'Sharp Sand',
  },
  {
    term: 'ballast',
    variants: ['ballast', 'all-in ballast', 'all in ballast', '10mm ballast', '20mm ballast'],
    href: '/products/AGG-007',
    productName: '20mm Ballast Aggregate',
  },
  {
    term: 'gravel',
    variants: ['gravel', '20mm gravel', 'pea gravel', 'shingle'],
    href: '/products/AGG-006',
    productName: '20mm Shingle',
  },
  {
    term: 'MOT Type 1',
    variants: ['MOT Type 1', 'MOT type 1', 'Type 1 sub-base', 'sub-base', 'subbase'],
    href: '/products/AGG-004',
    productName: 'MOT Type 1 Aggregate',
  },
  {
    term: 'aggregates',
    variants: ['aggregates', 'aggregate'],
    href: CATEGORY.aggregates,
    productName: 'Aggregates & Cement',
  },

  // ── Blocks ─────────────────────────────────────────────────────────────
  {
    term: 'aircrete block',
    variants: ['aircrete block', 'aircrete blocks', 'celcon block', 'celcon blocks', 'thermal block'],
    href: '/products/BLO-004',
    productName: 'Aircrete Blocks',
  },
  {
    term: 'concrete block',
    variants: ['concrete block', 'concrete blocks', 'dense block', 'dense blocks'],
    href: '/products/BLO-001',
    productName: 'Dense 7.3n Concrete Blocks',
  },
  {
    term: 'blocks',
    variants: ['block', 'blocks'],
    href: CATEGORY.blocks,
    productName: 'Blocks',
  },

  // ── Bricks ─────────────────────────────────────────────────────────────
  {
    term: 'facing brick',
    variants: ['facing brick', 'facing bricks', 'wirecut brick', 'wirecut bricks', 'brick', 'bricks'],
    href: '/products/BRI-005',
    productName: 'Hampton Rural Blend Brick',
  },

  // ── Timber ─────────────────────────────────────────────────────────────
  {
    term: 'C24 timber',
    variants: ['C24 timber', 'C24 graded timber', 'structural timber', 'C24'],
    href: '/products/TIM-002',
    productName: 'C24 Timber',
  },
  {
    term: 'timber batten',
    variants: ['timber batten', 'timber battens', 'treated batten', 'treated battens'],
    href: '/products/TIM-001',
    productName: 'BS Treated Battens',
  },
  {
    term: 'timber',
    variants: ['timber', 'carcassing timber'],
    href: CATEGORY.timber,
    productName: 'Timber',
  },

  // ── Cavity insulation ──────────────────────────────────────────────────
  {
    term: 'cavity insulation',
    variants: ['cavity insulation', 'cavity wall insulation', 'cavity batts', 'cavity slabs'],
    href: '/products/CAV-005',
    productName: 'Cavity Insulation Slab',
  },
  {
    term: 'loft insulation',
    variants: ['loft insulation', 'loft roll'],
    href: '/products/CAV-004',
    productName: 'Loft Roll',
  },
  {
    term: 'insulation',
    variants: ['insulation'],
    href: CATEGORY.cavityInsulation,
    productName: 'Cavity Insulation',
  },

  // ── PIR insulation ─────────────────────────────────────────────────────
  {
    term: 'PIR insulation',
    variants: ['PIR insulation', 'PIR board', 'PIR boards', 'PIR', 'PIR insulation board'],
    href: '/products/PIR-002',
    productName: 'PIR Insulation Board',
  },

  // ── Sheet materials ────────────────────────────────────────────────────
  {
    term: 'OSB board',
    variants: ['OSB board', 'OSB boards', 'OSB', 'OSB3'],
    href: '/products/SHE-002',
    productName: 'OSB3 Board 2400x600mm - 18mm',
  },
  {
    term: 'plywood',
    variants: ['plywood', 'hardwood plywood', 'structural plywood', 'shuttering plywood'],
    href: '/products/SHE-005',
    productName: 'Premium Hardwood Plywood (WVP)',
  },
  {
    term: 'chipboard',
    variants: ['chipboard', 'P5 chipboard'],
    href: '/products/SHE-003',
    productName: 'P5 Chipboard',
  },

  // ── Plasterboard ───────────────────────────────────────────────────────
  {
    term: 'plasterboard',
    variants: ['plasterboard', 'plasterboards', 'plaster board'],
    href: '/products/PLA-008',
    productName: 'Standard Plasterboards',
  },
  {
    term: 'moisture resistant plasterboard',
    variants: ['moisture resistant plasterboard', 'moisture resistant plasterboards', 'MR plasterboard'],
    href: '/products/PLA-005',
    productName: 'Moisture Resistant Plasterboards',
  },

  // ── Steel & lintels ────────────────────────────────────────────────────
  {
    term: 'cavity lintel',
    variants: ['cavity lintel', 'cavity lintels', 'catnic lintel', 'catnic lintels'],
    href: '/products/STL-013',
    productName: 'Standard 100mm Cavity Steel Lintels',
  },
  {
    term: 'single leaf lintel',
    variants: ['single leaf lintel', 'single leaf lintels', 'internal lintel', 'internal lintels'],
    href: '/products/STL-011',
    productName: 'Single Leaf Lintel 100mm',
  },
  {
    term: 'lintel',
    variants: ['lintel', 'lintels'],
    href: CATEGORY.steelAndLintels,
    productName: 'Steel & Lintels',
  },

  // ── Roofing ────────────────────────────────────────────────────────────
  {
    term: 'torch on felt',
    variants: ['torch on felt', 'torch on roofing felt'],
    href: '/products/ROO-005',
    productName: 'Torch on Roofing Felt',
  },
  {
    term: 'damp proof course',
    variants: ['damp proof course', 'DPC'],
    href: '/products/ROO-006',
    productName: 'Damp Proof Course (DPC)',
  },
  {
    term: 'damp proof membrane',
    variants: ['damp proof membrane', 'DPM'],
    href: '/products/ROO-007',
    productName: 'Damp Proof Membrane (DPM)',
  },
  {
    term: 'roofing',
    variants: ['roofing', 'roof'],
    href: CATEGORY.roofing,
    productName: 'Roofing',
  },

  // ── Fixings ────────────────────────────────────────────────────────────
  {
    term: 'wood screw',
    variants: ['wood screw', 'wood screws', 'frame fixing screw', 'frame fixing screws', 'frame screw', 'frame screws'],
    href: '/products/FIX-016',
    productName: 'High Performance Wood Screws',
  },
  {
    term: 'drywall screw',
    variants: ['drywall screw', 'drywall screws', 'drywall collated screws'],
    href: '/products/FIX-009',
    productName: 'Drywall Collated Screws',
  },
  {
    term: 'decking screw',
    variants: ['decking screw', 'decking screws'],
    href: '/products/FIX-012',
    productName: 'Decking Screws',
  },
  {
    term: 'galvanised nail',
    variants: ['galvanised nail', 'galvanised nails', 'galvanized nail', 'galvanized nails', 'clout nail', 'clout nails'],
    href: '/products/FIX-014',
    productName: 'Galvanized Nails',
  },
  {
    term: 'wall tie',
    variants: ['wall tie', 'wall ties', 'TT4 wall tie', 'TT4 wall ties'],
    href: '/products/FIX-001',
    productName: 'TT4 Wall Ties 275mm',
  },
  {
    term: 'fixings',
    variants: ['fixings', 'fasteners', 'screws and nails'],
    href: CATEGORY.fixings,
    productName: 'Fixings',
  },
]

/**
 * Build a flat list of (regex, href, productName) entries sorted by
 * term length descending so the renderer can scan text and replace
 * the longest match first.
 */
export interface CompiledMaterial {
  readonly pattern: RegExp
  readonly href: string
  readonly productName: string
  /** Display term (for title attribute). */
  readonly term: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileMaterials(): CompiledMaterial[] {
  const compiled: CompiledMaterial[] = []
  for (const m of MATERIALS) {
    // Build a pattern that matches any variant, with word-ish boundaries.
    // We intentionally don't require \b on both sides because unit
    // suffixes ("cement-mixer", "gravel-drive") would false-trigger;
    // instead we use a conservative lookbehind/lookahead set.
    const variants = [m.term, ...m.variants]
    // De-dupe while preserving first-seen order.
    const seen = new Set<string>()
    const uniq = variants.filter((v) => {
      const key = v.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    // Sort longest first so the alternation picks the longest match.
    uniq.sort((a, b) => b.length - a.length)
    const alt = uniq.map(escapeRegExp).join('|')
    const pattern = new RegExp(`(?<![\\w-])(${alt})(?![\\w-])`, 'gi')
    compiled.push({ pattern, href: m.href, productName: m.productName, term: m.term })
  }
  // Sort patterns by source length (longest first) so we test "MOT Type 1"
  // before "Type 1" and "building sand" before "sand".
  compiled.sort((a, b) => b.pattern.source.length - a.pattern.source.length)
  return compiled
}