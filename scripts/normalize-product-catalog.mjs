import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const DRY_RUN = process.env.DRY_RUN !== 'false'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error('Missing Supabase URL or service-role key')
  process.exit(1)
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

// ─────────────────────────────────────────────────────────────────────────────
// Description / SEO templates
// ─────────────────────────────────────────────────────────────────────────────
const SITE_NAME = 'Star Hawk Builders Merchant'

function firstSentence(text) {
  // Split on a period followed by whitespace or end of string, so decimals
  // such as "12.5mm" are not treated as sentence boundaries.
  const idx = text.search(/\.(?=\s|$)/)
  return idx >= 0 ? text.slice(0, idx + 1).trim() : text.trim()
}

function article(word) {
  const first = word.trim().toLowerCase().replace(/^a\s+/, '').charAt(0)
  return 'aeiou'.includes(first) ? 'an' : 'a'
}

function seoTitle(name) {
  return `${name} | ${SITE_NAME}`
}

function seoDescription(desc) {
  const base = firstSentence(desc)
  return `${base} Same-day delivery from ${SITE_NAME}.`
}

const CATEGORY_TEMPLATES = {
  aggregates: {
    description: (name, spec) =>
      `${name} is a quality-assured aggregate for groundworks, concrete and drainage. ${spec}. Use for sub-bases, driveways, drainage trenches, mortar and concrete batches. Send your quantity for tonnage pricing and a delivery slot.`,
    keyFeatures: [
      'Quality-assured aggregate',
      'Consistent grading and colour',
      'Suitable for site mixes',
      'Available loose or in bags',
    ],
    applications: ['Sub-bases', 'Driveways', 'Drainage trenches', 'Concrete and mortar batches'],
  },
  cement: {
    description: (name) =>
      `${name} is a stocked general-purpose Portland cement for concrete, mortar and render mixes. Supplied in 25 kg bags. Use for foundations, blockwork, paving and general site concreting. Add to your quote for bulk bag pricing and delivery scheduling.`,
    keyFeatures: [
      'General-purpose Portland cement',
      'Supplied in 25 kg bags',
      'Suitable for concrete, mortar and render',
      'Consistent setting strength',
    ],
    applications: ['Foundations', 'Blockwork', 'Paving', 'General site concreting'],
  },
  plasterSand: {
    description: (name) =>
      `${name} is a washed, fine-grade plastering sand for internal and external renders. Supplied in large bags. Use for plastering, rendering and mortar mixes. Send your quantity for bag pricing and delivery.`,
    keyFeatures: [
      'Washed fine-grade sand',
      'Supplied in large bags',
      'Ideal for plastering and rendering',
      'Suitable for mortar mixes',
    ],
    applications: ['Plastering', 'Rendering', 'Mortar mixes', 'Internal and external finishes'],
  },
  blocks: {
    description: (name, spec) =>
      `Choose ${name} for concrete blockwork in load-bearing walls, partitions and structural infill. Standard block size 440 x 215 mm. ${spec}. Use for inner leaves, retaining walls, foundations and fire-rated partitions. Send your block schedule for pricing and site delivery.`,
    keyFeatures: [
      'Fire-resistant rating',
      'Strong masonry unit',
      'Standard block size 440 x 215 mm',
      'Load-bearing grade',
      'Fire-rated options available',
    ],
    applications: ['Inner leaves', 'Retaining walls', 'Foundations', 'Fire-rated partitions'],
  },
  bricks: {
    description: (name) =>
      `Choose ${name} for facing brickwork, exterior walls and restoration projects. Supplied as standard UK size 215 x 102.5 x 65 mm facing bricks. Use for extensions, new-build facades, feature brickwork and boundary walls. Send your brick schedule for pallet delivery and project pricing.`,
    keyFeatures: [
      'Frost-resistant facing brick',
      'Standard UK size 215 x 102.5 x 65 mm',
      'Consistent colour and texture',
      'Suitable for exposed brickwork',
    ],
    applications: ['Extensions', 'New-build facades', 'Boundary walls', 'Restoration projects'],
  },
  cavityInsulation: {
    description: (name, spec) =>
      `${name} is a rigid full-fill insulation board for cavity walls and roofs. ${spec}. Delivers low U-values and helps control condensation in new builds and retrofits. Request a quote for pallet quantities and site delivery.`,
    keyFeatures: [
      'High thermal performance',
      'Helps meet Part L U-value targets',
      'Low U-values',
      'Minimal thickness build-up',
    ],
    applications: ['Cavity walls', 'Lofts', 'Pitched roofs', 'Floors and acoustic partitions'],
  },
  pir: {
    description: (name, spec) =>
      `${name} is a rigid foil-faced insulation board for high thermal performance. ${spec}. Use for warm roofs, floors, walls and loft conversions where space is limited. Send your insulation schedule for pallet pricing and site delivery.`,
    keyFeatures: [
      'Rigid foil-faced board',
      'High compressive strength',
      'Space-saving insulation',
      'Low thermal conductivity',
    ],
    applications: ['Warm roofs', 'Floors', 'Walls', 'Loft conversions'],
  },
  plasterboard: {
    description: (name, spec) =>
      `${name} is a gypsum wall and ceiling board for dry lining and partitioning. ${spec}. Use for dry lining, partitioning, ceilings and internal wall finishes. Add to your quote for sheet pricing and same-day delivery.`,
    keyFeatures: [
      'Gypsum wall and ceiling board',
      'Standard size 2400 x 1200 mm',
      'Tapered-edge option',
      'Moisture, fire and acoustic variants',
    ],
    applications: ['Dry lining', 'Partitioning', 'Patching', 'Internal walls and ceilings'],
  },
  sheetMaterials: {
    description: (name, type, spec) =>
      `${name} is ${article(type)} ${type} panel for structural sheathing, formwork and flooring. ${spec}. Use for floors, roofs, walls, hoardings and site fabrication. Send your cutting list for sheet pricing and cut-to-size options.`,
    keyFeatures: [
      'Structural panel',
      'Standard 2440 x 1220 mm sheet',
      'Moisture-resistant grades available',
      'Ideal for cutting lists',
    ],
    applications: ['Floors', 'Roofs', 'Walls', 'Site fabrication and hoardings'],
  },
  timber: {
    description: (name, spec) =>
      `Choose ${name} for graded structural timber carcassing, joists, rafters and studs. ${spec}. Use for floors, roofs, walls and timber-framed construction. Send your cutting list for timber pricing and saw-bench cutting.`,
    keyFeatures: [
      'Graded structural timber',
      'Pressure-treated options',
      'Kiln-dried and regularised',
      'C16 and C24 grades',
    ],
    applications: ['Floor joists', 'Roof rafters', 'Wall studs', 'Garden structures'],
  },
  batten: {
    description: (name, spec) =>
      `Choose ${name} for pressure-treated timber battens in roofing, fencing and carpentry. ${spec}. Use for roof tile battens, counter battens, studwork and garden structures. Add to your quote for bundle pricing and delivery.`,
    keyFeatures: [
      'Pressure-treated battens',
      'BS 5534 compliant options',
      'Suitable for roofing and fencing',
      'Kiln-dried and regularised',
    ],
    applications: ['Roof tile battens', 'Counter battens', 'Studwork', 'Garden structures'],
  },
}

function buildProductData(item) {
  const t = CATEGORY_TEMPLATES[item.template]
  const desc = item.template === 'sheetMaterials'
    ? t.description(item.name, item.panelType, item.spec)
    : t.description(item.name, item.spec)
  const short = firstSentence(desc)
  return {
    name: item.name,
    code: item.code ?? null,
    category: item.category,
    unit: item.unit,
    description: desc,
    short_description: short,
    seo_title: seoTitle(item.name),
    seo_description: seoDescription(desc),
    key_features: t.keyFeatures,
    applications: t.applications,
    length_mm: item.length_mm ?? null,
    width_mm: item.width_mm ?? null,
    height_mm: item.height_mm ?? null,
    thickness_mm: item.thickness_mm ?? null,
    coverage_m2_per_unit: item.coverage_m2_per_unit ?? null,
    coverage_linear_m_per_unit: item.coverage_linear_m_per_unit ?? null,
    unit_weight_kg: item.unit_weight_kg ?? null,
    pack_size: item.pack_size ?? null,
    wastage_pct: item.wastage_pct ?? 5,
    calculator_type: item.calculator_type ?? null,
    default_price: 0,
    is_active: true,
    image_url: item.image_url ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical product definitions
// ─────────────────────────────────────────────────────────────────────────────
const canonical = []

// Aggregates & Cement
canonical.push(
  {
    name: 'Building Sand',
    category: 'Aggregates & Cement',
    unit: 'TON',
    template: 'aggregates',
    spec: 'Fine-grade aggregate supplied loose or in 25 kg bags',
    existingCode: 'AGG-005',
    duplicateCodes: ['BUILDING SAND'],
    calculator_type: 'AGGREGATES',
  },
  {
    name: 'Sharp Sand',
    category: 'Aggregates & Cement',
    unit: 'TON',
    template: 'aggregates',
    spec: 'Coarse, sharp-grade aggregate supplied loose or in 25 kg bags',
    existingCode: 'AGG-002',
    calculator_type: 'AGGREGATES',
  },
  {
    name: 'MOT Type 1',
    category: 'Aggregates & Cement',
    unit: 'TON',
    template: 'aggregates',
    spec: 'Available in 40 mm down crushed grading',
    existingCode: 'AGG-004',
    calculator_type: 'AGGREGATES',
  },
  {
    name: '20mm Ballast',
    category: 'Aggregates & Cement',
    unit: 'TON',
    template: 'aggregates',
    spec: 'Available in 20 mm all-in grading',
    existingCode: 'AGG-007',
    calculator_type: 'AGGREGATES',
  },
  {
    name: 'Cement 25kg',
    category: 'Aggregates & Cement',
    unit: 'BAG',
    template: 'cement',
    existingCode: 'AGG-001',
    calculator_type: 'MORTAR_CONCRETE',
    unit_weight_kg: 25,
    pack_size: 1,
  },
  {
    name: 'Plaster Sand Large Bag',
    category: 'Aggregates & Cement',
    unit: 'BAG',
    template: 'plasterSand',
    calculator_type: 'MORTAR_CONCRETE',
  }
)

// Plasterboard
;[
  { name: 'Standard Plasterboard 12.5mm', existingCode: 'PLA-008' },
  { name: 'Fire Rated Plasterboard 12.5mm', existingCode: 'PLA-007' },
  { name: 'Moisture Resistant Plasterboard 12.5mm', existingCode: 'PLA-005' },
  { name: 'Acoustic Plasterboard 12.5mm', existingCode: 'PLA-006' },
].forEach((p) => {
  canonical.push({
    name: p.name,
    category: 'Plasterboard',
    unit: 'SHEET',
    template: 'plasterboard',
    spec: 'Standard board size 2400 x 1200 mm, 12.5 mm thick',
    existingCode: p.existingCode,
    length_mm: 2400,
    width_mm: 1200,
    thickness_mm: 12.5,
  })
})

// Blocks
canonical.push(
  {
    name: 'Thermalite Block 100mm 3.6N',
    category: 'Blocks',
    unit: 'EA',
    template: 'blocks',
    spec: '100 mm aircrete block with 3.6 N compressive strength',
    existingCode: 'BLO-004',
    duplicateCodes: ['BLOCK'],
    length_mm: 440,
    width_mm: 215,
    height_mm: 100,
  },
  {
    name: '100mm Dense Concrete Block 7.3N',
    category: 'Blocks',
    unit: 'EA',
    template: 'blocks',
    spec: '100 mm dense aggregate block with 7.3 N compressive strength',
    existingCode: 'BLO-001',
    length_mm: 440,
    width_mm: 215,
    height_mm: 100,
  }
)

// Cavity Insulation
;[
  { thickness: 90, existingCode: 'CAV-006' },
  { thickness: 100 },
  { thickness: 150 },
].forEach((p) => {
  const name = p.thickness === 90
    ? 'Full Fill Cavity Insulation 90mm'
    : `Cavity Wall Insulation ${p.thickness}mm`
  canonical.push({
    name,
    category: 'Cavity Insulation',
    unit: 'SHEET',
    template: 'cavityInsulation',
    spec: `Available in ${p.thickness} mm thickness for standard cavity constructions`,
    existingCode: p.existingCode ?? null,
    duplicateCodes: p.thickness === 90 ? undefined : ['CAV-005', 'CAV-002'],
    length_mm: 1200,
    width_mm: 450,
    thickness_mm: p.thickness,
    calculator_type: 'INSULATION',
  })
})

// Bricks
const brickMap = [
  { name: 'Heather Brick', existingCode: 'BRI-018', duplicateCodes: ['BRI-003', 'BRI-010'] },
  { name: 'Sandface Brick' },
  { name: 'Rustic Antique Brick', existingCode: 'BRI-028', duplicateCodes: ['BRI-027'] },
  { name: 'Ibstock Multi Red Brick' },
  { name: 'Tobacco Brick', existingCode: 'BRI-009' },
  { name: 'Tuscan Red Multi Brick', existingCode: 'BRI-011' },
  { name: 'Dapple Light Brick', existingCode: 'BRI-020' },
  { name: 'Slate Blue Engineering Brick', existingCode: 'BRI-012' },
]
brickMap.forEach((p) => {
  canonical.push({
    name: p.name,
    category: 'Bricks',
    unit: 'EA',
    template: 'bricks',
    existingCode: p.existingCode ?? null,
    duplicateCodes: p.duplicateCodes,
    length_mm: 215,
    width_mm: 102.5,
    height_mm: 65,
    calculator_type: 'BRICK_WALL',
  })
})

// Timber C24 sizes
const timberSizes = [
  { nom: '3x2', w: 75, h: 47 },
  { nom: '4x2', w: 100, h: 47 },
  { nom: '6x2', w: 150, h: 47 },
  { nom: '7x2', w: 175, h: 47 },
  { nom: '8x2', w: 200, h: 47 },
  { nom: '9x2', w: 225, h: 47 },
]
const timberLengths = [2.4, 3, 3.6, 4.2, 4.8, 5.4, 6]
timberSizes.forEach((size) => {
  timberLengths.forEach((len) => {
    canonical.push({
      name: `${size.nom} C24 Timber ${len}m`,
      category: 'Timber',
      unit: 'EA',
      template: 'timber',
      spec: `Available as a ${size.h} x ${size.w} mm section, ${len} m long, C24 graded`,
      length_mm: Math.round(len * 1000),
      width_mm: size.w,
      height_mm: size.h,
      calculator_type: 'TIMBER',
    })
  })
})

// PIR Insulation
;[25, 50, 70, 100, 120, 150].forEach((t, idx) => {
  canonical.push({
    name: `PIR Insulation Board ${t}mm`,
    category: 'PIR Insulation',
    unit: 'SHEET',
    template: 'pir',
    spec: `Standard board size 2400 x 1200 mm, ${t} mm thick`,
    length_mm: 2400,
    width_mm: 1200,
    thickness_mm: t,
    calculator_type: 'INSULATION',
    duplicateCodes: idx === 0 ? ['PIR-002'] : undefined,
  })
})

// Sheet Materials
const sheetItems = [
  {
    name: 'Shuttering Plywood 18mm',
    panelType: 'softwood shuttering plywood',
    thickness: 18,
    existingCode: 'SHE-004',
  },
  {
    name: 'OSB3 Plywood 18mm',
    panelType: 'oriented strand board (OSB3)',
    thickness: 18,
    existingCode: 'SHE-001',
    duplicateCodes: ['SHE-002'],
  },
  {
    name: 'OSB3 T&G 18mm',
    panelType: 'tongue-and-groove OSB3',
    thickness: 18,
    length_mm: 2400,
    width_mm: 600,
  },
  {
    name: 'OSB3 Plywood 12mm',
    panelType: 'oriented strand board (OSB3)',
    thickness: 12,
  },
  {
    name: 'WBP Plywood 12mm',
    panelType: 'WBP hardwood plywood',
    thickness: 12,
  },
  {
    name: 'WBP Plywood 18mm',
    panelType: 'WBP hardwood plywood',
    thickness: 18,
    existingCode: 'SHE-005',
  },
  {
    name: 'Chipboard 18mm',
    panelType: 'moisture-resistant chipboard',
    thickness: 18,
    existingCode: 'SHE-003',
  },
  {
    name: 'Chipboard 22mm',
    panelType: 'moisture-resistant chipboard',
    thickness: 22,
  },
]
sheetItems.forEach((p) => {
  canonical.push({
    name: p.name,
    category: 'Sheet Materials',
    unit: 'SHEET',
    template: 'sheetMaterials',
    panelType: p.panelType,
    spec: `Standard sheet size ${p.length_mm ?? 2440} x ${p.width_mm ?? 1220} mm, ${p.thickness} mm thick`,
    existingCode: p.existingCode ?? null,
    duplicateCodes: p.duplicateCodes,
    length_mm: p.length_mm ?? 2440,
    width_mm: p.width_mm ?? 1220,
    thickness_mm: p.thickness,
    calculator_type: 'SHEET_MATERIALS',
  })
})

// Treated batten
canonical.push({
  name: 'Treated Timber Batten 25x38mm',
  category: 'Timber',
  unit: 'EA',
  template: 'batten',
  spec: '25 x 38 mm section, 3.6 m long',
  length_mm: 3600,
  width_mm: 38,
  height_mm: 25,
  calculator_type: 'TIMBER',
})

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const { data: existing, error: fetchError } = await sb.from('products').select('*')
  if (fetchError) throw fetchError

  const existingByCode = new Map(existing.map((p) => [p.code, p]))
  const usedCodes = new Set(existing.map((p) => p.code))

  function nextCode(prefix) {
    const re = new RegExp(`^${prefix}-(\\d+)$`)
    let max = 0
    for (const code of usedCodes) {
      const m = code.match(re)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    const next = `${prefix}-${String(max + 1).padStart(3, '0')}`
    usedCodes.add(next)
    return next
  }

  const toUpsert = []
  const toDeactivate = new Map() // code -> reason

  for (const item of canonical) {
    const data = buildProductData(item)
    let target = null

    if (item.existingCode && existingByCode.has(item.existingCode)) {
      target = existingByCode.get(item.existingCode)
    } else {
      // fall back to name match
      const norm = item.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      target = existing.find((p) =>
        p.name.toLowerCase().replace(/[^a-z0-9]/g, '') === norm
      )
    }

    if (target) {
      data.code = target.code
      toUpsert.push({ id: target.id, ...data, _action: 'UPDATE' })
    } else {
      // Keep in sync with lib/products.ts CATEGORY_CODE_PREFIXES.
      const categoryPrefixes = {
        'Aggregates & Cement': 'AGG',
        'Plasterboard': 'PLA',
        'Blocks': 'BLO',
        'Cavity Insulation': 'CAV',
        'Bricks': 'BRI',
        'Timber': 'TIM',
        'PIR Insulation': 'PIR',
        'Sheet Materials': 'SHE',
        'Cement & Additives': 'CEM',
        'Steel & Lintels': 'STL',
        'Roofing': 'ROO',
        'Drainage': 'DRA',
        'Tools': 'TOL',
        'Fixings': 'FIX',
        'Miscellaneous': 'MIS',
      }
      const prefix = data.category
        ? (categoryPrefixes[data.category] ?? data.category.substring(0, 3).toUpperCase())
        : 'MIS'
      data.code = nextCode(prefix)
      toUpsert.push({ ...data, _action: 'INSERT' })
    }

    // Mark duplicates for deactivation (first canonical mentioning the code wins)
    for (const dupCode of item.duplicateCodes ?? []) {
      if (existingByCode.has(dupCode) && !toDeactivate.has(dupCode)) {
        toDeactivate.set(dupCode, `duplicate / merged into ${item.name}`)
      }
    }
  }

  // Remove any duplicate that was actually chosen as a canonical target
  for (const u of toUpsert) {
    if (toDeactivate.has(u.code)) {
      toDeactivate.delete(u.code)
    }
  }

  if (process.env.EXPORT_PLAN) {
    const plan = {
      generatedAt: new Date().toISOString(),
      upserts: toUpsert.map(({ _action, id, ...payload }) => ({
        action: _action,
        id: id ?? null,
        ...payload,
      })),
      deactivations: Array.from(toDeactivate.entries()).map(([code, reason]) => {
        const p = existingByCode.get(code)
        return { code, previousName: p?.name ?? null, reason }
      }),
    }
    const outPath = process.env.EXPORT_PLAN
    await fs.promises.writeFile(outPath, JSON.stringify(plan, null, 2))
    console.log(`Plan exported to ${outPath}`)
    return
  }

  console.log('\n=== DRY RUN ===\n')
  console.log(`Canonical products: ${canonical.length}`)
  console.log(`Upserts: ${toUpsert.length} (${toUpsert.filter((u) => u._action === 'INSERT').length} inserts, ${toUpsert.filter((u) => u._action === 'UPDATE').length} updates)`)
  console.log(`Deactivations: ${toDeactivate.size}\n`)

  console.log('UPSERTS:')
  for (const u of toUpsert) {
    console.log(`  [${u._action}] ${u.code} – ${u.name} (${u.unit}) – ${u.category}`)
  }

  console.log('\nDEACTIVATE:')
  for (const [code, reason] of toDeactivate) {
    const p = existingByCode.get(code)
    console.log(`  ${code} – ${p?.name ?? '???'} – ${reason}`)
  }

  if (DRY_RUN) {
    console.log('\nSet DRY_RUN=false to apply these changes.')
    return
  }

  // Apply inserts/updates
  for (const u of toUpsert) {
    const { _action, id, ...payload } = u
    if (_action === 'INSERT') {
      const { error } = await sb.from('products').insert(payload)
      if (error) throw new Error(`Insert ${payload.code} failed: ${error.message}`)
    } else {
      const { error } = await sb.from('products').update(payload).eq('id', id)
      if (error) throw new Error(`Update ${payload.code} failed: ${error.message}`)
    }
  }

  // Apply deactivations
  for (const [code] of toDeactivate) {
    const { error } = await sb.from('products').update({ is_active: false }).eq('code', code)
    if (error) throw new Error(`Deactivate ${code} failed: ${error.message}`)
  }

  console.log('\n✅ Catalog normalization applied.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
