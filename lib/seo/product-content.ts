// lib/seo/product-content.ts
// Cleans and structures raw product data so it reads as unique, factual
// content for human visitors, Google, and AI answer engines (Gemini,
// Perplexity, ChatGPT). The imported catalogue descriptions all share a
// repeated boilerplate prefix and a per-category template sentence; both
// are stripped here so only the product-specific facts (sizes, materials,
// uses) remain. Those same facts are also surfaced as structured specs
// and schema.org fields so LLMs can cite them with confidence.

export interface ProductSpecs {
  sizes: string[]
  materials: string[]
}

// Phrase present on every imported product regardless of category.
const UNIVERSAL_PREFIX_PHRASES = ['supplied for trade and domestic building work']

// Per-category template sentences duplicated across every product in a
// category. Stripping these is what makes each product page read as
// unique instead of boilerplate.
const CATEGORY_BOILERPLATE_PHRASES = [
  'weather-resistant product for pitched or flat roof details and rainwater goods',
  'dependable fixing for secure connections in masonry, timber or steelwork',
  'quality-assured material that mixes and finishes as expected on site',
  'strong masonry block for load-bearing walls, partitions and structural infill',
  'versatile panel for flooring, roofing, wall sheathing or formwork',
  'treated or graded timber for structural frames, roofing and finishing details',
  'improves thermal and acoustic performance inside cavity construction',
  'structural steel or lintel component for openings and load-bearing frames',
  'wallboard and finishing plaster for smooth internal surfaces',
  'consistent quality facing or engineering brick for a range of brickwork finishes',
  'rigid insulation board giving high thermal efficiency in a slim build-up',
]

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9–—])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}

/**
 * Remove the universal prefix and the per-category boilerplate sentence so
 * only product-specific text remains. Falls back to the original text when
 * everything would be stripped (keeps very short descriptions usable).
 */
export function cleanProductDescription(
  description: string | null | undefined,
): string {
  if (!description) return ''
  const sentences = splitSentences(description)
  const kept: string[] = []
  for (const sentence of sentences) {
    const norm = normalizeForMatch(sentence)
    const isBoilerplate =
      UNIVERSAL_PREFIX_PHRASES.some((p) => norm.includes(p)) ||
      CATEGORY_BOILERPLATE_PHRASES.some((p) => norm.includes(p))
    if (!isBoilerplate) kept.push(sentence.replace(/^[\s–—-]+/, '').trim())
  }
  const cleaned = kept.filter(Boolean).join(' ').trim()
  // If cleaning removed everything meaningful, keep the original so the
  // page never shows an empty description block.
  return cleaned.length >= 20 ? cleaned : description.trim()
}

const MATERIAL_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bstainless steel\b/i, label: 'Stainless steel' },
  { pattern: /\bgalvan[sz]ed steel\b/i, label: 'Galvanised steel' },
  { pattern: /\bmild steel\b/i, label: 'Mild steel' },
  { pattern: /\bu?pvcb?\b/i, label: 'uPVC' },
  { pattern: /\bpolyethylene\b/i, label: 'Polyethylene' },
  { pattern: /\bhardwood\b/i, label: 'Hardwood' },
  { pattern: /\bsoftwood\b/i, label: 'Softwood' },
  { pattern: /\bplywood\b/i, label: 'Plywood' },
  { pattern: /\bosb3?\b/i, label: 'OSB' },
  { pattern: /\bchipboard\b/i, label: 'Chipboard' },
  { pattern: /\bconcrete\b/i, label: 'Concrete' },
  { pattern: /\bcement\b/i, label: 'Cement' },
  { pattern: /\bgypsum\b/i, label: 'Gypsum' },
  { pattern: /\btimber\b/i, label: 'Timber' },
  { pattern: /\boak\b/i, label: 'Oak' },
  { pattern: /\bsteel\b/i, label: 'Steel' },
]

/**
 * Pull structured specs out of the free-text description. Sizes are read
 * from the common "Available in X and Y" phrasing; materials are matched
 * against a keyword list. Both feed the on-page specs table and the
 * schema.org Product `material` / PropertyValue fields.
 */
export function extractSpecs(
  description: string | null | undefined,
): ProductSpecs {
  const text = description || ''
  const sizes: string[] = []

  const sizeMatch = text.match(/available in ([^.]*?)(?:\.|$)/i)
  if (sizeMatch) {
    const parts = sizeMatch[1]
      .split(/,|\band\b/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 40 && /[0-9a-z]/i.test(s))
    sizes.push(...parts)
  }

  const materials: string[] = []
  for (const { pattern, label } of MATERIAL_PATTERNS) {
    if (pattern.test(text) && !materials.includes(label)) {
      materials.push(label)
    }
  }

  return { sizes: dedupe(sizes), materials: dedupe(materials) }
}

// Maps a stock category to a canonical entity (Wikipedia) so search
// engines and LLMs can link each product to a known concept. Used as the
// schema.org `additionalType` on Product.
const CATEGORY_ADDITIONAL_TYPE: Record<string, string> = {
  roofing: 'https://en.wikipedia.org/wiki/Roof',
  fixings: 'https://en.wikipedia.org/wiki/Fastener',
  'aggregates & cement': 'https://en.wikipedia.org/wiki/Construction_aggregate',
  'aggregates and cement': 'https://en.wikipedia.org/wiki/Construction_aggregate',
  blocks: 'https://en.wikipedia.org/wiki/Concrete_masonry_unit',
  'sheet materials': 'https://en.wikipedia.org/wiki/Engineered_wood',
  timber: 'https://en.wikipedia.org/wiki/Timber',
  'cavity insulation': 'https://en.wikipedia.org/wiki/Building_insulation',
  'steel & lintels': 'https://en.wikipedia.org/wiki/Structural_steel',
  'steel and lintels': 'https://en.wikipedia.org/wiki/Structural_steel',
  plasterboard: 'https://en.wikipedia.org/wiki/Drywall',
  bricks: 'https://en.wikipedia.org/wiki/Brick',
  'pir insulation': 'https://en.wikipedia.org/wiki/Polyisocyanurate',
}

export function categoryAdditionalType(
  category: string | null | undefined,
): string | undefined {
  if (!category) return undefined
  return CATEGORY_ADDITIONAL_TYPE[category.toLowerCase().trim()]
}

export interface ProductFaq {
  q: string
  a: string
}

export interface CategoryProductGuide {
  intro: string
  uses: string[]
  estimating: string
  delivery: string
}

const CATEGORY_PRODUCT_GUIDES: Record<string, CategoryProductGuide> = {
  bricks: {
    intro:
      'Bricks are the masonry unit most builders reach for first when building or repairing walls, chimneys, boundary walls and facades. We stock facing bricks for visible work and engineering bricks where strength or damp resistance matters, all available for trade pricing and site delivery across the South East.',
    uses: [
      'External leaf of cavity walls and solid brickwork',
      'Garden walls, boundary walls and retaining walls',
      'Brick slips, feature panels and restoration matching',
      'Manholes, sewers and below-DPC work with engineering bricks',
    ],
    estimating:
      'A standard UK brick measures 215 × 102.5 × 65 mm and you need roughly 60 bricks per m² of single-skin wall. Add 5–10% wastage for straight runs and up to 15% for sites with a lot of corners, arches or cutwork.',
    delivery:
      'Bricks are delivered on pallets, usually 390–500 per pack depending on the manufacturer. Same-day delivery is available on stock lines across our core area; outlying towns are normally next-day. Offloading is kerbside or into a hard-standing area.',
  },
  blocks: {
    intro:
      'Concrete and aircrete blocks are the workhorse of modern cavity walls, partitions and structural infill. Dense blocks give compressive strength for load-bearing work, while lightweight aircrete blocks speed up construction and improve thermal and acoustic performance.',
    uses: [
      'Inner leaf of cavity walls and structural partitions',
      'Foundations, plinths and below-ground masonry',
      'Fire-rated and acoustic separating walls',
      'Infill between steel or timber frames',
    ],
    estimating:
      'Blocks are normally 440 × 215 mm in plan and you need about 10 blocks per m² of wall face for standard 100 mm blockwork. A 7.3N dense block is the default for load-bearing walls; lower-density blocks are used where insulation is the priority.',
    delivery:
      'Blocks are delivered strapped on pallets, typically 72–100 per pack. Because they are heavy, plan the drop close to the work area and make sure the site can take a pallet truck or forklift if possible.',
  },
  'aggregates & cement': {
    intro:
      'Aggregates and cement are the bulk ingredients of concrete, mortar, screed and sub-bases. We stock sharp sand, building sand, ballast, MOT Type 1 and general-purpose cement in bags and bulk loads, with same-day and next-day delivery across the South East.',
    uses: [
      'Concrete mixes for foundations, slabs and columns',
      'Mortar for brickwork, blockwork and pointing',
      'Sub-bases, hardstandings and drainage fills',
      'Screed beds and floor toppings',
    ],
    estimating:
      'A 25 kg bag of cement mixed 1:5 with sharp sand gives roughly 100 kg of mortar, enough for around 25 bricks. A cubic metre of concrete needs about 12–14 bags of cement plus ballast. Bulk aggregates are sold by the tonne and a standard wheelbarrow holds roughly 65–70 litres.',
    delivery:
      'Cement is delivered palleted and sheeted to keep it dry. Bulk aggregates are tipped from our lorries; access must be flat, clear of overhead cables and suitable for a heavy vehicle. Bagged options are available for sites with restricted access.',
  },
  'aggregates and cement': {
    intro:
      'Aggregates and cement are the bulk ingredients of concrete, mortar, screed and sub-bases. We stock sharp sand, building sand, ballast, MOT Type 1 and general-purpose cement in bags and bulk loads, with same-day and next-day delivery across the South East.',
    uses: [
      'Concrete mixes for foundations, slabs and columns',
      'Mortar for brickwork, blockwork and pointing',
      'Sub-bases, hardstandings and drainage fills',
      'Screed beds and floor toppings',
    ],
    estimating:
      'A 25 kg bag of cement mixed 1:5 with sharp sand gives roughly 100 kg of mortar, enough for around 25 bricks. A cubic metre of concrete needs about 12–14 bags of cement plus ballast. Bulk aggregates are sold by the tonne and a standard wheelbarrow holds roughly 65–70 litres.',
    delivery:
      'Cement is delivered palleted and sheeted to keep it dry. Bulk aggregates are tipped from our lorries; access must be flat, clear of overhead cables and suitable for a heavy vehicle. Bagged options are available for sites with restricted access.',
  },
  plasterboard: {
    intro:
      'Plasterboard and finishing plaster create smooth internal walls and ceilings. Standard wallboard is used in dry areas, moisture-resistant boards suit kitchens and bathrooms, and thermal laminate boards add insulation without a separate layer.',
    uses: [
      'Internal wall and ceiling linings on timber or metal stud',
      'Moisture-resistant linings for bathrooms and kitchens',
      'Fire-rated partitions and ceilings',
      'Thermal upgrades with insulated plasterboard laminate',
    ],
    estimating:
      'A standard plasterboard sheet is 2.4 m × 1.2 m (2.88 m²). Measure the wall or ceiling area and divide by 2.88 to get the sheet count, then add 10% for cuts and wastage. A 25 kg bag of finish plaster covers roughly 10 m² at skim thickness.',
    delivery:
      'Plasterboard is delivered flat on pallets to avoid damage. Keep sheets dry on site and store them horizontally on a level surface. Same-day delivery is available on stock lines across our core delivery area.',
  },
  fixings: {
    intro:
      'Fixings are the mechanical fasteners that hold a building together and keep it square. We stock wall ties, nails, screws, brackets, hangers and straps in galvanised and stainless steel for masonry, timber and steelwork.',
    uses: [
      'Cavity wall ties and restraint straps',
      'Timber framing, decking and joinery screws',
      'Masonry nails, frame fixings and anchor bolts',
      'Roofing battens, hangers and structural brackets',
    ],
    estimating:
      'Wall ties are spaced at 2.5 per m² in standard cavity construction. Nails and screws are usually ordered by the box; count the number of fixings per board or frame member and multiply by the quantity. Stainless steel is recommended in damp or coastal locations.',
    delivery:
      'Fixings are compact and delivered in boxes or collated strips, often combined with a larger material drop. Keep them dry on site to prevent corrosion, especially galvanised products in unfinished buildings.',
  },
  'cavity insulation': {
    intro:
      'Cavity insulation and membranes improve the thermal and acoustic performance of walls and roofs. Rigid boards, slabs and rolls reduce heat loss, while breathable membranes and cavity closers manage moisture and cold bridging.',
    uses: [
      'Full-fill or partial-fill cavity wall insulation',
      'Loft, roof and floor insulation',
      'Cavity closers at windows, doors and openings',
      'Breather membranes for pitched and flat roofs',
    ],
    estimating:
      'Measure the area of the element you are insulating and divide by the coverage per pack or board. For cavity walls, remember to deduct openings. Add 5% for cuts and offcuts. The U-value target will dictate the thickness required.',
    delivery:
      'Insulation boards and rolls are lightweight but bulky; they are delivered wrapped on pallets. Store them flat and dry, and avoid compressing boards because this reduces their thermal performance.',
  },
  'steel & lintels': {
    intro:
      'Structural steel and lintels carry loads above openings and frame larger spans. We stock standard cavity lintels, universal beams and columns, parallel flange channels and structural hollow sections, with cutting and local-fabricator links for bespoke steel.',
    uses: [
      'Cavity lintels over doors and windows',
      'Steel beams and columns for extensions and openings',
      'Bracing, framing and secondary steelwork',
      'Catnic and masonry-support lintels',
    ],
    estimating:
      'Lintels are sized by the structural opening plus the minimum end bearing (usually 150 mm each side). Steel beams need a structural engineer’s calculation for size, bearing and padstones. Give us the opening, load and wall construction and we can quote the section.',
    delivery:
      'Steel is heavy and often delivered on a flatbed or crane-equipped vehicle. We can arrange offloading with hi-ab if access allows. Standard lintels are stock lines with same-day availability on common sizes.',
  },
  'steel and lintels': {
    intro:
      'Structural steel and lintels carry loads above openings and frame larger spans. We stock standard cavity lintels, universal beams and columns, parallel flange channels and structural hollow sections, with cutting and local-fabricator links for bespoke steel.',
    uses: [
      'Cavity lintels over doors and windows',
      'Steel beams and columns for extensions and openings',
      'Bracing, framing and secondary steelwork',
      'Catnic and masonry-support lintels',
    ],
    estimating:
      'Lintels are sized by the structural opening plus the minimum end bearing (usually 150 mm each side). Steel beams need a structural engineer’s calculation for size, bearing and padstones. Give us the opening, load and wall construction and we can quote the section.',
    delivery:
      'Steel is heavy and often delivered on a flatbed or crane-equipped vehicle. We can arrange offloading with hi-ab if access allows. Standard lintels are stock lines with same-day availability on common sizes.',
  },
  'bright steel': {
    intro:
      'Bright steel is cold-finished mild steel with a smooth, accurate surface, used where dimensional precision and appearance matter. We stock rounds, flats, angles and channels in standard lengths, with cutting service available for trade and fabrication customers.',
    uses: [
      'Shafts, pins, spindles and machined components',
      'Frames, brackets and light structural fabrications',
      'Architectural metalwork and balustrades',
      'Repairs and modifications to existing steelwork',
    ],
    estimating:
      'Bright steel is sold by the metre or in standard 6 m lengths. Calculate the total linear metres required, add a small allowance for cutting and machining, and let us know if you need specific lengths cut to size.',
    delivery:
      'Long lengths are delivered on a flatbed or rack to prevent distortion. Cut pieces can be bundled and sent with a mixed load. Same-day delivery is available on stock lines across our core area.',
  },
}

function categoryGuideKey(category: string | null | undefined): string | undefined {
  if (!category) return undefined
  return category.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function getProductCategoryGuide(
  category: string | null | undefined,
): CategoryProductGuide | undefined {
  const key = categoryGuideKey(category)
  if (!key) return undefined
  return CATEGORY_PRODUCT_GUIDES[key]
}

/**
 * Generate a concise, factual fallback description for products that arrive
 * with thin or missing descriptions. Keeps every product detail page above
 * the thin-content threshold and avoids duplicate boilerplate by using the
 * product's own name, category and unit.
 */
export function getProductFallbackDescription(product: {
  name: string
  category: string | null
  unit: string
  brand: string | null
}): string {
  const category = product.category ?? 'building materials'
  const brandClause = product.brand ? ` from ${product.brand}` : ''
  return (
    `${product.name}${brandClause} is a ${category.toLowerCase()} product supplied by Demo Builder Merchant ` +
    `for trade and DIY customers across the South East. Priced by the ${product.unit.toLowerCase()}, ` +
    `it is available for same-day or next-day delivery from our own fleet. ` +
    `Contact the trade counter for a competitive quote, stock check or delivery slot.`
  )
}

/**
 * Generate 2–3 product-specific FAQs for the product detail page. These are
 * rendered as visible content and emitted as FAQPage JSON-LD.
 */
export function getProductFaqs(product: {
  name: string
  category: string | null
  unit: string
}): ProductFaq[] {
  const category = product.category ?? 'this product'
  return [
    {
      q: `What unit is ${product.name} sold in?`,
      a: `It is priced and sold by the ${product.unit.toLowerCase()}.`,
    },
    {
      q: `Do you deliver ${category.toLowerCase()} to site?`,
      a:
        'Yes. We deliver across Greater London, Berkshire, Buckinghamshire, Surrey, Hampshire, ' +
        'Oxfordshire and Wiltshire. Stock lines ordered before 11am are typically delivered same-day.',
    },
    {
      q: `How do I get a trade price for ${product.name}?`,
      a:
        'Add it to your quote list or call the trade counter. We will confirm stock, check the ' +
        'current price and send a written quote the same business day.',
    },
  ]
}
