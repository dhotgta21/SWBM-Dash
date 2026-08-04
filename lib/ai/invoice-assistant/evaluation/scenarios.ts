/**
 * Scenario-based evaluation set for the AI invoice assistant.
 *
 * Each scenario exercises one or more phases of the pipeline:
 *   1. Local voice intent parsing (lib/voice/product-intent.ts)
 *   2. Product search term stripping (lib/search.ts)
 *   3. AI product retrieval (the new assistant search engine)
 *
 * Expected product codes/names are the canonical catalogue values from
 * supabase/migrations/061_product_search_tags.sql and the current product
 * catalogue. If the catalogue changes, this file must be kept in sync.
 */

export interface ExpectedSlots {
  quantity?: { value: number; unit?: string }
  product?: string
  price?: number
}

export interface AssistantScenario {
  id: string
  utterance: string
  /** What the local parser should capture. Use undefined for "not captured". */
  expectedSlots: ExpectedSlots
  /** What extractProductSearchTerms should return (order insensitive). */
  expectedSearchTerms: string[]
  /** The product the assistant should ultimately retrieve (code or canonical name). */
  expectedProduct: string
  /** Human-readable category for the report. */
  category: string
  /** If true, the query should NOT match by product code alone. */
  mustNotMatchByCode?: boolean
  /** If true, the assistant should ask for clarification rather than guess. */
  expectDisambiguation?: boolean
  /** Free-text note for reviewers. */
  note?: string
}

export const assistantScenarios: AssistantScenario[] = [
  // ── Aggregates & Cement ──
  {
    id: 'agg-cement-01',
    utterance: 'thirteen bags of cement at £15 each',
    expectedSlots: {
      quantity: { value: 13, unit: 'bag' },
      product: 'cement',
      price: 15,
    },
    expectedSearchTerms: ['cement'],
    expectedProduct: 'AGG-001',
    category: 'Aggregates & Cement',
    note: 'Happy-path quantity + product + price.',
  },
  {
    id: 'agg-sand-02',
    utterance: 'fifty bags of building sand for 12 quid',
    expectedSlots: {
      quantity: { value: 50, unit: 'bag' },
      product: 'building sand',
      price: 12,
    },
    expectedSearchTerms: ['building', 'sand'],
    expectedProduct: 'AGG-005',
    category: 'Aggregates & Cement',
  },
  {
    id: 'agg-sharp-sand-03',
    utterance: 'two tonnes of sharp sand',
    expectedSlots: {
      quantity: { value: 2, unit: 'tonne' },
      product: 'sharp sand',
    },
    expectedSearchTerms: ['sharp', 'sand'],
    expectedProduct: 'AGG-002',
    category: 'Aggregates & Cement',
  },
  {
    id: 'agg-gravel-04',
    utterance: 'two tonnes of 20mm gravel',
    expectedSlots: {
      quantity: { value: 2, unit: 'tonne' },
      product: '20mm gravel',
    },
    expectedSearchTerms: ['20mm', 'gravel'],
    expectedProduct: 'AGG-006',
    category: 'Aggregates & Cement',
    mustNotMatchByCode: true,
    note: '"20mm" must match the product name/description, not numeric codes like BRI-020.',
  },
  {
    id: 'agg-ballast-05',
    utterance: 'one tonne of ballast',
    expectedSlots: {
      quantity: { value: 1, unit: 'tonne' },
      product: 'ballast',
    },
    expectedSearchTerms: ['ballast'],
    expectedProduct: 'AGG-007',
    category: 'Aggregates & Cement',
  },
  {
    id: 'agg-mot-06',
    utterance: 'MOT type 1 sub base',
    expectedSlots: {
      product: 'MOT type 1 sub base',
    },
    expectedSearchTerms: ['mot', 'type', 'sub', 'base'],
    expectedProduct: 'AGG-004',
    category: 'Aggregates & Cement',
  },
  {
    id: 'agg-postmix-07',
    utterance: 'thirty bags of postmix',
    expectedSlots: {
      quantity: { value: 30, unit: 'bag' },
      product: 'postmix',
    },
    expectedSearchTerms: ['postmix'],
    expectedProduct: 'AGG-001',
    category: 'Aggregates & Cement',
    note: 'Postmix is a cement-based product; search should find cement.',
  },
  {
    id: 'agg-admix-08',
    utterance: 'a bag of mortar plasticizer',
    expectedSlots: {
      quantity: { value: 1, unit: 'bag' },
      product: 'mortar plasticizer',
    },
    expectedSearchTerms: ['mortar', 'plasticizer'],
    expectedProduct: 'ADMIX',
    category: 'Aggregates & Cement',
  },

  // ── Blocks ──
  {
    id: 'blo-dense-09',
    utterance: 'a hundred concrete blocks 100mm',
    expectedSlots: {
      quantity: { value: 100 },
      product: 'concrete blocks 100mm',
    },
    expectedSearchTerms: ['concrete', '100mm'],
    expectedProduct: 'BLO-001',
    category: 'Blocks',
    mustNotMatchByCode: true,
  },
  {
    id: 'blo-thermalite-10',
    utterance: 'thermalite blocks',
    expectedSlots: {
      product: 'thermalite blocks',
    },
    expectedSearchTerms: ['thermalite'],
    expectedProduct: 'BLO-004',
    category: 'Blocks',
  },

  // ── Bricks ──
  {
    id: 'bri-pallet-11',
    utterance: 'a pallet of bricks',
    expectedSlots: {
      quantity: { value: 1, unit: 'pallet' },
      product: 'bricks',
    },
    expectedSearchTerms: ['bricks'],
    expectedProduct: 'BRICK',
    category: 'Bricks',
    expectDisambiguation: true,
    note: 'Generic "bricks" should trigger category disambiguation, not a random brick.',
  },
  {
    id: 'bri-london-12',
    utterance: 'five hundred london stock bricks',
    expectedSlots: {
      quantity: { value: 500 },
      product: 'london stock bricks',
    },
    expectedSearchTerms: ['london', 'stock', 'bricks'],
    expectedProduct: 'BRI-002',
    category: 'Bricks',
  },
  {
    id: 'bri-engineering-13',
    utterance: 'engineering bricks',
    expectedSlots: {
      product: 'engineering bricks',
    },
    expectedSearchTerms: ['engineering', 'bricks'],
    expectedProduct: 'BRI-012',
    category: 'Bricks',
  },

  // ── Timber ──
  {
    id: 'tim-4x2-14',
    utterance: '4x2 timber, ten lengths at £8 each',
    expectedSlots: {
      product: '4x2 timber',
    },
    expectedSearchTerms: ['4x2', 'timber'],
    expectedProduct: 'TIM-010',
    category: 'Timber',
    mustNotMatchByCode: true,
    note: '"4x2" and "10" must not match codes TIM-004 / TIM-010 by code alone.',
  },
  {
    id: 'tim-batten-15',
    utterance: 'a bundle of roofing battens',
    expectedSlots: {
      quantity: { value: 1, unit: 'bundle' },
      product: 'roofing battens',
    },
    expectedSearchTerms: ['roofing', 'battens'],
    expectedProduct: 'TIM-045',
    category: 'Timber',
    note: 'Bundle should be recognised as a unit.',
  },
  {
    id: 'tim-c24-16',
    utterance: 'six by two c24 timber',
    expectedSlots: {
      product: 'six by two c24 timber',
    },
    expectedSearchTerms: ['c24', 'timber'],
    expectedProduct: 'TIM-017',
    category: 'Timber',
  },

  // ── Sheet Materials ──
  {
    id: 'she-plywood-17',
    utterance: 'eight by four plywood sheet at £35',
    expectedSlots: {
      product: 'eight by four plywood sheet',
      price: 35,
    },
    expectedSearchTerms: ['plywood'],
    expectedProduct: 'SHE-005',
    note: 'The sheet unit stays in the product name because the dimension comes first.',
    category: 'Sheet Materials',
  },
  {
    id: 'she-osb-18',
    utterance: 'OSB3 board 18mm',
    expectedSlots: {
      product: 'OSB3 board 18mm',
    },
    expectedSearchTerms: ['osb3', 'board', '18mm'],
    expectedProduct: 'SHE-006',
    category: 'Sheet Materials',
  },
  {
    id: 'she-plasterboard-19',
    utterance: 'fifty sheets of plasterboard',
    expectedSlots: {
      quantity: { value: 50, unit: 'sheet' },
      product: 'plasterboard',
    },
    expectedSearchTerms: ['plasterboard'],
    expectedProduct: 'PLA-008',
    category: 'Sheet Materials',
  },

  // ── Insulation ──
  {
    id: 'ins-pir-20',
    utterance: '100mm PIR insulation',
    expectedSlots: {
      product: '100mm PIR insulation',
    },
    expectedSearchTerms: ['100mm', 'pir', 'insulation'],
    expectedProduct: 'PIR-003',
    category: 'PIR Insulation',
  },
  {
    id: 'ins-cavity-21',
    utterance: 'cavity wall insulation 100mm',
    expectedSlots: {
      product: 'cavity wall insulation 100mm',
    },
    expectedSearchTerms: ['cavity', 'wall', 'insulation', '100mm'],
    expectedProduct: 'CAV-006',
    category: 'Cavity Insulation',
  },
  {
    id: 'ins-loft-22',
    utterance: 'insulation roll, five rolls',
    expectedSlots: {
      product: 'insulation roll',
    },
    expectedSearchTerms: ['insulation'],
    expectedProduct: 'CAV-004',
    note: 'First intent of the comma split; the second intent carries the quantity.',
    category: 'Cavity Insulation',
  },
  {
    id: 'ins-acoustic-23',
    utterance: 'acoustic insulation',
    expectedSlots: {
      product: 'acoustic insulation',
    },
    expectedSearchTerms: ['acoustic', 'insulation'],
    expectedProduct: 'CAV-003',
    category: 'Cavity Insulation',
  },

  // ── Plaster & Additives ──
  {
    id: 'pla-multi-24',
    utterance: 'plaster multi finish',
    expectedSlots: {
      product: 'plaster multi finish',
    },
    expectedSearchTerms: ['plaster', 'multi', 'finish'],
    expectedProduct: 'PLA-003',
    category: 'Plasterboard',
  },
  {
    id: 'pla-bonding-25',
    utterance: 'bonding coat plaster',
    expectedSlots: {
      product: 'bonding coat plaster',
    },
    expectedSearchTerms: ['bonding', 'coat', 'plaster'],
    expectedProduct: 'PLA-002',
    category: 'Plasterboard',
  },
  {
    id: 'pla-skim-26',
    utterance: 'skim plaster 25kg',
    expectedSlots: {
      product: 'skim plaster',
    },
    expectedSearchTerms: ['skim', 'plaster', '25kg'],
    expectedProduct: 'PLA-003',
    note: '25kg is parsed as quantity; the product search still uses the original phrase so the size is preserved.',
    category: 'Plasterboard',
  },

  // ── Roofing ──
  {
    id: 'roo-felt-27',
    utterance: 'roofing felt torch on',
    expectedSlots: {
      product: 'roofing felt torch on',
    },
    expectedSearchTerms: ['roofing', 'felt', 'torch'],
    expectedProduct: 'ROO-004',
    category: 'Roofing',
  },
  {
    id: 'roo-grp-28',
    utterance: 'GRP flat roof kit',
    expectedSlots: {
      product: 'GRP flat roof kit',
    },
    expectedSearchTerms: ['grp', 'flat', 'roof', 'kit'],
    expectedProduct: 'ROO-008',
    category: 'Roofing',
  },
  {
    id: 'roo-soffit-29',
    utterance: 'soffit board white',
    expectedSlots: {
      product: 'soffit board white',
    },
    expectedSearchTerms: ['soffit', 'board', 'white'],
    expectedProduct: 'ROO-001',
    category: 'Roofing',
  },
  {
    id: 'roo-gutter-30',
    utterance: 'gutter union bracket',
    expectedSlots: {
      product: 'gutter union bracket',
    },
    expectedSearchTerms: ['gutter', 'union', 'bracket'],
    expectedProduct: 'ROO-002',
    category: 'Roofing',
  },

  // ── Damp Proofing ──
  {
    id: 'dpc-150-31',
    utterance: 'DPC 150mm',
    expectedSlots: {
      product: 'DPC 150mm',
    },
    expectedSearchTerms: ['dpc', '150mm'],
    expectedProduct: 'DPC-150',
    category: 'Roofing',
    note: 'Short code-like query that is actually a specification; should match by name/tags.',
  },
  {
    id: 'dpc-course-32',
    utterance: 'damp proof course 300mm',
    expectedSlots: {
      product: 'damp proof course 300mm',
    },
    expectedSearchTerms: ['damp', 'proof', 'course', '300mm'],
    expectedProduct: 'DPC-300',
    category: 'Roofing',
  },

  // ── Steel & Lintels ──
  {
    id: 'stl-lintel-33',
    utterance: 'steel lintel 1200mm',
    expectedSlots: {
      product: 'steel lintel 1200mm',
    },
    expectedSearchTerms: ['steel', 'lintel', '1200mm'],
    expectedProduct: 'STL-007',
    category: 'Steel & Lintels',
  },
  {
    id: 'stl-rsj-34',
    utterance: 'RSJ 203x133x25',
    expectedSlots: {
      product: 'RSJ 203x133x25',
    },
    expectedSearchTerms: ['rsj', '203x133x25'],
    expectedProduct: 'STL-001',
    category: 'Steel & Lintels',
  },
  {
    id: 'stl-angle-35',
    utterance: 'steel angle 50x50x5',
    expectedSlots: {
      product: 'steel angle 50x50x5',
    },
    expectedSearchTerms: ['steel', 'angle', '50x50x5'],
    expectedProduct: 'STL-006',
    category: 'Steel & Lintels',
  },

  // ── Fixings ──
  {
    id: 'fix-ties-36',
    utterance: 'wall ties 250mm',
    expectedSlots: {
      product: 'wall ties 250mm',
    },
    expectedSearchTerms: ['wall', 'ties', '250mm'],
    expectedProduct: 'FIX-001',
    category: 'Fixings',
  },
  {
    id: 'fix-starter-37',
    utterance: 'wall starter kit',
    expectedSlots: {
      product: 'wall starter kit',
    },
    expectedSearchTerms: ['wall', 'starter', 'kit'],
    expectedProduct: 'FIX-007',
    category: 'Fixings',
  },
  {
    id: 'fix-joist-38',
    utterance: 'joist hanger 50mm',
    expectedSlots: {
      product: 'joist hanger 50mm',
    },
    expectedSearchTerms: ['joist', 'hanger', '50mm'],
    expectedProduct: 'FIX-008',
    category: 'Fixings',
  },
  {
    id: 'fix-screws-39',
    utterance: 'screws 4.5 by 50mm box',
    expectedSlots: {
      product: 'screws 4.5 by 50mm box',
    },
    expectedSearchTerms: ['screws', '4.5', '50mm'],
    expectedProduct: 'FIX-009',
    note: 'Dimension + packaging word order keeps everything in the product name.',
    category: 'Fixings',
  },
  {
    id: 'fix-nails-40',
    utterance: 'nails 65mm 1kg',
    expectedSlots: {
      product: 'nails 65mm 1kg',
    },
    expectedSearchTerms: ['nails', '65mm', '1kg'],
    expectedProduct: 'FIX-013',
    note: '65mm stays as product spec; 1kg after the product stays in the product name.',
    category: 'Fixings',
  },

  // ── Multi-product & edge cases ──
  {
    id: 'multi-41',
    utterance: '13 bags cement and 5 tonnes gravel',
    expectedSlots: {
      quantity: { value: 13, unit: 'bag' },
      product: 'cement',
    },
    expectedSearchTerms: ['cement'],
    expectedProduct: 'AGG-001',
    category: 'Multi-product',
    note: 'First intent only is checked here.',
  },
  {
    id: 'price-only-42',
    utterance: '£15 each',
    expectedSlots: {
      price: 15,
    },
    expectedSearchTerms: [],
    expectedProduct: '',
    category: 'Edge case',
    note: 'Price-only follow-up should merge with pending intent, not search.',
  },
  {
    id: 'no-price-43',
    utterance: 'cement',
    expectedSlots: {
      product: 'cement',
    },
    expectedSearchTerms: ['cement'],
    expectedProduct: 'AGG-001',
    category: 'Edge case',
    note: 'Product only; assistant should ask for quantity and price.',
  },
  {
    id: 'ambiguous-generic-44',
    utterance: 'timber',
    expectedSlots: {
      product: 'timber',
    },
    expectedSearchTerms: ['timber'],
    expectedProduct: 'TIM-001',
    category: 'Edge case',
    expectDisambiguation: true,
    note: 'Generic "timber" should trigger disambiguation.',
  },
  {
    id: 'colloquial-price-45',
    utterance: 'fifteen quid a bag',
    expectedSlots: {
      price: 15,
    },
    expectedSearchTerms: [],
    expectedProduct: '',
    category: 'Edge case',
    note: 'Colloquial price without product/quantity.',
  },
  {
    id: 'pence-price-46',
    utterance: 'ten bags at fifty pence',
    expectedSlots: {
      quantity: { value: 10, unit: 'bag' },
      price: 0.5,
    },
    expectedSearchTerms: [],
    expectedProduct: '',
    category: 'Edge case',
    note: 'Pence-only price.',
  },
  {
    id: 'composite-dimension-47',
    utterance: '8 by 4 plywood',
    expectedSlots: {
      product: '8 by 4 plywood',
    },
    expectedSearchTerms: ['plywood'],
    expectedProduct: 'SHE-005',
    category: 'Sheet Materials',
    note: 'Dimensions stay inside the product name; number words are stripped from search terms.',
  },
  {
    id: 'spoken-pounds-48',
    utterance: 'twelve pounds fifty each',
    expectedSlots: {
      price: 12.5,
    },
    expectedSearchTerms: [],
    expectedProduct: '',
    category: 'Edge case',
  },
  {
    id: 'per-unit-49',
    utterance: '15 per bag',
    expectedSlots: {
      price: 15,
    },
    expectedSearchTerms: [],
    expectedProduct: '',
    category: 'Edge case',
    note: '"per" should be treated as a price marker.',
  },
  {
    id: 'half-tonne-50',
    utterance: 'half a tonne of gravel',
    expectedSlots: {
      quantity: { value: 0.5, unit: 'tonne' },
      product: 'gravel',
    },
    expectedSearchTerms: ['gravel'],
    expectedProduct: 'AGG-006',
    category: 'Aggregates & Cement',
  },
]

export const scenarioCategories = [
  'Aggregates & Cement',
  'Blocks',
  'Bricks',
  'Timber',
  'Sheet Materials',
  'PIR Insulation',
  'Cavity Insulation',
  'Plasterboard',
  'Roofing',
  'Steel & Lintels',
  'Fixings',
  'Multi-product',
  'Edge case',
]
