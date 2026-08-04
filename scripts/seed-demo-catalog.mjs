#!/usr/bin/env node
/**
 * Seed a dense demo product catalogue (≥250 active SKUs).
 *
 * Idempotent: uses fixed codes DEMO-xxx-### and ON CONFLICT (code) DO UPDATE.
 *
 * Usage:
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-catalog.mjs
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-catalog.mjs --target 300
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(join(root, '.env.local'))
loadEnvFile(join(root, '.env'))

if (process.env.DEMO_SEED_CONFIRM !== 'yes') {
  console.error('Set DEMO_SEED_CONFIRM=yes to run this seed.')
  process.exit(1)
}

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  console.error('Missing Postgres URL.')
  process.exit(1)
}

function parseArgs(argv) {
  let target = 280
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) {
      target = Math.max(250, parseInt(argv[++i], 10) || 280)
    }
  }
  return { target }
}

const { target } = parseArgs(process.argv.slice(2))

/**
 * Named templates expanded into many size/spec variants so the demo
 * catalogue looks real without hand-writing 280 rows.
 * Each entry: [codePrefix, nameTemplate with {v}, unit, category, basePrice, variants[]]
 */
const FAMILIES = [
  // Construction core (landing categories)
  ['AGG', 'Building Sand {v}', 'TON', 'Aggregates & Cement', 78, ['bulk', 'washed', 'sharp', 'soft', 'kiln dried']],
  ['AGG', 'Ballast {v}mm All-in', 'TON', 'Aggregates & Cement', 88, ['10', '20']],
  ['AGG', 'Gravel {v}mm', 'TON', 'Aggregates & Cement', 90, ['10', '20', '40']],
  ['AGG', 'MOT Type {v}', 'TON', 'Aggregates & Cement', 38, ['1', '1 recycled', '3']],
  ['AGG', 'Scalpings {v}', 'TON', 'Aggregates & Cement', 32, ['40mm', '75mm']],
  ['CEM', 'Portland Cement {v}kg', 'BAG', 'Cement & Additives', 7.2, ['25', '20']],
  ['CEM', 'Rapid Set Cement {v}kg', 'BAG', 'Cement & Additives', 8.5, ['25', '10']],
  ['CEM', 'Postcrete {v}kg', 'BAG', 'Cement & Additives', 6.8, ['20', '25']],
  ['CEM', 'Plasticiser {v}L', 'LTR', 'Cement & Additives', 9.5, ['5', '25']],
  ['CEM', 'SBR Bonding Agent {v}L', 'LTR', 'Cement & Additives', 18, ['5', '25']],
  ['PLA', 'Plasterboard {v}mm 2400x1200', 'SHEET', 'Plasterboard', 12, ['9.5', '12.5', '15']],
  ['PLA', 'Moisture Resistant Board {v}mm', 'SHEET', 'Plasterboard', 14, ['12.5', '15']],
  ['PLA', 'Fire-Rated Board {v}mm', 'SHEET', 'Plasterboard', 18, ['12.5', '15']],
  ['PLA', 'Soundbloc Board {v}mm', 'SHEET', 'Plasterboard', 16, ['12.5', '15']],
  ['PLA', 'Multi-Finish Plaster {v}kg', 'BAG', 'Plasterboard', 11, ['25']],
  ['BLO', 'Dense Concrete Block {v}mm', 'EA', 'Blocks', 1.75, ['100', '140', '215']],
  ['BLO', 'Hollow Block {v}mm', 'EA', 'Blocks', 1.4, ['100', '140']],
  ['BLO', 'Aircrete Block {v}mm', 'EA', 'Blocks', 2.2, ['100', '140', '215']],
  ['BLO', 'Foundation Block {v}mm', 'EA', 'Blocks', 2.8, ['140', '215']],
  ['BRI', 'Wirecut Facing Brick {v}', 'EA', 'Bricks', 0.62, ['red', 'buff', 'multi', 'blue']],
  ['BRI', 'Engineering Brick Class {v}', 'EA', 'Bricks', 0.78, ['A', 'B']],
  ['BRI', 'Common Brick {v}', 'EA', 'Bricks', 0.45, ['standard', 'utility']],
  ['BRI', 'Stock Brick {v}', 'EA', 'Bricks', 0.95, ['London', 'yellow']],
  ['TIM', 'CLS Timber {v} 2.4m', 'EA', 'Timber', 5.5, ['38x89', '38x140', '47x100', '47x150']],
  ['TIM', 'CLS Timber {v} 3.6m', 'EA', 'Timber', 8.2, ['38x89', '47x100', '47x150']],
  ['TIM', 'Treated Carcassing {v}', 'EA', 'Timber', 9.5, ['47x100 4.8m', '47x150 4.8m', '75x100 3.6m']],
  ['TIM', 'MDF Skirting {v}', 'EA', 'Timber', 7.5, ['119x18 4.4m', '144x18 4.4m', '169x18 4.4m']],
  ['TIM', 'Treated Cladding {v}', 'EA', 'Timber', 11, ['125mm 3.6m', '150mm 4.8m']],
  ['TIM', 'Softwood Studwork {v}', 'EA', 'Timber', 4.8, ['38x63 2.4m', '47x75 2.4m']],
  ['CAV', 'Cavity Batt {v}mm', 'SHEET', 'Cavity Insulation', 14, ['50', '75', '100', '125', '150']],
  ['CAV', 'Full Fill Cavity {v}mm', 'SHEET', 'Cavity Insulation', 16, ['50', '75', '100']],
  ['CAV', 'Partial Fill Slab {v}mm', 'SHEET', 'Cavity Insulation', 15, ['50', '75', '100']],
  ['PIR', 'PIR Board {v}mm 2400x1200', 'SHEET', 'PIR Insulation', 18, ['25', '40', '50', '75', '100', '120', '150']],
  ['PIR', 'PIR Tongue & Groove {v}mm', 'SHEET', 'PIR Insulation', 24, ['50', '75', '100', '120']],
  ['SHE', 'OSB3 Board {v}mm 2440x1220', 'SHEET', 'Sheet Materials', 18, ['11', '15', '18', '22']],
  ['SHE', 'Hardwood Plywood {v}mm', 'SHEET', 'Sheet Materials', 28, ['6', '9', '12', '18']],
  ['SHE', 'MDF Sheet {v}mm 2440x1220', 'SHEET', 'Sheet Materials', 22, ['6', '12', '18', '25']],
  ['SHE', 'Plywood Softwood {v}mm', 'SHEET', 'Sheet Materials', 20, ['9', '12', '18']],
  ['STL', 'Catnic Cavity Lintel {v}mm', 'EA', 'Steel & Lintels', 38, ['900', '1200', '1500', '1800', '2100', '2400']],
  ['STL', 'IG Box Lintel {v}mm', 'EA', 'Steel & Lintels', 45, ['900', '1200', '1500', '1800']],
  ['STL', 'Angle Lintel {v}mm', 'EA', 'Steel & Lintels', 28, ['900', '1200', '1500']],
  ['STL', 'UB Section {v}', 'EA', 'Steel & Lintels', 85, ['127x76x13', '152x89x16', '178x102x19', '203x133x25']],
  ['ROO', 'Concrete Roof Tile {v}', 'EA', 'Roofing', 0.82, ['grey', 'red', 'brown']],
  ['ROO', 'Breathable Underlay {v}m roll', 'ROLL', 'Roofing', 72, ['50', '45']],
  ['ROO', 'Dry Ridge Kit {v}', 'EA', 'Roofing', 88, ['standard', 'ventilated']],
  ['ROO', 'Eaves Ventilation Pack {v}', 'EA', 'Roofing', 24, ['10m', '20m']],
  ['ROO', 'Roof Batten {v}', 'EA', 'Roofing', 3.2, ['25x38 4.8m', '25x50 4.8m']],
  ['DRA', 'UG Pipe 110mm {v}m', 'M', 'Drainage', 5.8, ['3', '6']],
  ['DRA', 'UG Bend {v}° 110mm', 'EA', 'Drainage', 8.5, ['15', '30', '45', '87.5']],
  ['DRA', 'Bottle Gully {v}', 'EA', 'Drainage', 14, ['standard', 'back inlet']],
  ['DRA', 'Inspection Chamber {v}mm', 'EA', 'Drainage', 58, ['300', '450']],
  ['DRA', 'Channel Drain {v}m', 'M', 'Drainage', 22, ['1', '1.5']],
  ['FIX', 'Frame Fixings M{v} x50', 'BOX', 'Fixings', 14, ['8x80', '8x100', '8x120', '10x100']],
  ['FIX', 'Clout Nails {v}mm 1kg', 'BOX', 'Fixings', 8.5, ['30', '40', '50']],
  ['FIX', 'Wood Screws {v} pack 200', 'BOX', 'Fixings', 9.5, ['4x40', '5x50', '5x70', '6x80']],
  ['FIX', 'Coach Screws {v}', 'BOX', 'Fixings', 12, ['M8x80 x20', 'M10x100 x20']],
  ['FIX', 'Wall Plugs {v} pack 100', 'BOX', 'Fixings', 4.5, ['red', 'brown', 'blue']],
  ['TOL', 'Brick Trowel {v}"', 'EA', 'Tools', 18, ['10', '11', '12']],
  ['TOL', 'Spirit Level {v}mm', 'EA', 'Tools', 32, ['600', '900', '1200', '1800']],
  ['TOL', 'Pointing Trowel {v}"', 'EA', 'Tools', 9, ['4', '5', '6']],
  ['TOL', 'Tape Measure {v}m', 'EA', 'Tools', 8, ['5', '8', '10']],
  ['TOL', 'Utility Knife {v}', 'EA', 'Tools', 6, ['standard', 'retractable']],
  ['MIS', 'Dust Sheets {v}', 'PK', 'Miscellaneous', 12, ['pack 3', 'heavy duty']],
  ['MIS', 'Builder Line {v}m', 'EA', 'Miscellaneous', 4.5, ['50', '100']],
  ['MIS', 'Safety Gloves {v}', 'PR', 'Miscellaneous', 3.5, ['M', 'L', 'XL']],
  ['MIS', 'Safety Glasses {v}', 'EA', 'Miscellaneous', 2.8, ['clear', 'tinted']],
  // Steel families for variety
  ['MS', 'Mild Steel Flat {v}', 'EA', 'Mild Steel', 14, ['20x3 6m', '25x5 6m', '40x6 6m', '50x8 6m']],
  ['MS', 'Mild Steel Angle {v}', 'EA', 'Mild Steel', 18, ['25x25x3 6m', '40x40x4 6m', '50x50x5 6m']],
  ['MS', 'Mild Steel Box Section {v}', 'EA', 'Mild Steel', 28, ['25x25x2 6m', '40x40x3 6m', '50x50x3 6m']],
  ['BRS', 'Bright Round Bar {v}mm', 'EA', 'Bright Steel', 12, ['10', '12', '16', '20', '25']],
  ['SST', 'Stainless Angle {v}', 'EA', 'Stainless Steel', 42, ['25x25x3 3m', '40x40x4 3m']],
  ['ALU', 'Aluminium Angle {v}', 'EA', 'Aluminium', 16, ['25x25x3 3m', '40x40x3 3m', '50x50x3 3m']],
  // Vertical extras (match existing demo vertical names)
  ['PLU', 'Copper Tube {v}mm 3m', 'LEN', 'Copper Tube & Fittings', 11, ['15', '22', '28']],
  ['PLU', 'End Feed Elbow {v}mm', 'EA', 'Copper Tube & Fittings', 0.9, ['15', '22', '28']],
  ['PLU', 'Isolating Valve {v}mm', 'EA', 'Valves & Controls', 3.8, ['15', '22']],
  ['PLU', 'Push-Fit Elbow {v}mm', 'EA', 'Plastic Pipe Systems', 1.1, ['15', '22']],
  ['ELE', 'T&E Cable {v}mm 100m', 'DR', 'Cable & Flex', 70, ['1.5', '2.5', '4.0', '6.0']],
  ['ELE', 'MCB {v}A B Curve', 'EA', 'Switchgear & Boards', 5.5, ['6', '10', '16', '20', '32', '40']],
  ['ELE', 'Double Socket {v}', 'EA', 'Wiring Accessories', 3.5, ['white', 'metal clad']],
  ['WIN', 'uPVC Casement Frame {v}', 'EA', 'uPVC Frames', 160, ['900x1200', '1200x1200', '1500x1200']],
  ['WIN', 'DGU Clear {v}', 'M2', 'Glass & Glazing', 45, ['4-16-4', '4-20-4']],
  ['TIL', 'Porcelain Tile {v}', 'M2', 'Floor Tiles', 22, ['600x600 grey', '600x600 oak', '300x600 white']],
  ['TIL', 'Wall Tile {v}', 'M2', 'Wall Tiles', 18, ['300x100 metro white', '300x600 gloss']],
  ['TIL', 'Tile Adhesive {v}kg', 'BAG', 'Tile Adhesives', 14, ['20', '25']],
]

function buildProducts() {
  /** @type {Array<{code:string,name:string,unit:string,category:string,price:number,description:string}>} */
  const products = []
  const usedCodes = new Set()

  for (const [prefix, nameTpl, unit, category, basePrice, variants] of FAMILIES) {
    variants.forEach((v, vi) => {
      const seq = String(products.length + 1).padStart(3, '0')
      let code = `DEMO-${prefix}-${seq}`
      // Keep codes stable-ish by family+variant index when regenerating
      const alt = `DEMO-${prefix}-${String(vi + 1).padStart(2, '0')}-${v
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 8)}`
      code = alt.slice(0, 32)
      if (usedCodes.has(code)) {
        code = `DEMO-${prefix}-${seq}`
      }
      usedCodes.add(code)
      const name = nameTpl.replace('{v}', v)
      const price = Math.round(basePrice * (0.85 + (vi % 5) * 0.06) * 100) / 100
      products.push({
        code,
        name,
        unit,
        category,
        price: Math.max(0.2, price),
        description: `Trade ${name} · demo catalogue line for ${category}.`,
      })
    })
  }

  // Pad to target with generic miscellaneous lines if families fall short
  let n = products.length
  while (products.length < target) {
    n += 1
    const code = `DEMO-XTRA-${String(n).padStart(3, '0')}`
    if (usedCodes.has(code)) continue
    usedCodes.add(code)
    const cats = [
      'Miscellaneous',
      'Tools',
      'Fixings',
      'Timber',
      'Roofing',
      'Drainage',
    ]
    const category = cats[n % cats.length]
    products.push({
      code,
      name: `Trade Consumable Pack ${n}`,
      unit: 'PK',
      category,
      price: Math.round((4 + (n % 40) * 1.15) * 100) / 100,
      description: `Assorted trade consumable pack ${n} for demo density.`,
    })
  }

  return products
}

async function main() {
  const products = buildProducts()
  console.log(`=== Demo catalogue seed ===`)
  console.log(`Prepared ${products.length} SKUs (target ${target})`)

  const clean = connectionString
    .replace(/[?&]sslmode=[^&]*/g, '')
    .replace(/\?&/, '?')
    .replace(/\?$/, '')

  const client = new Client({
    connectionString: clean,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    // Ensure soft-delete / temp columns exist for app filters
    await client.query(`
      ALTER TABLE public.products
        ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
        ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true
    `)

    await client.query('BEGIN')
    const BATCH = 40
    let upserted = 0
    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH)
      const values = []
      const params = []
      let p = 1
      for (const prod of batch) {
        values.push(
          `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},true,false,NULL,now(),now())`
        )
        params.push(
          prod.code,
          prod.name,
          prod.unit,
          prod.category,
          prod.price,
          prod.description
        )
      }
      await client.query(
        `INSERT INTO public.products (
           code, name, unit, category, default_price, description,
           is_active, is_temporary, deleted_at, created_at, updated_at
         ) VALUES ${values.join(',')}
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name,
           unit = EXCLUDED.unit,
           category = EXCLUDED.category,
           default_price = EXCLUDED.default_price,
           description = EXCLUDED.description,
           is_active = true,
           is_temporary = false,
           deleted_at = NULL,
           updated_at = now()`,
        params
      )
      upserted += batch.length
      if (upserted % 80 === 0 || upserted === products.length) {
        console.log(`  upserted ${upserted}/${products.length}`)
      }
    }
    await client.query('COMMIT')

    const summary = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_active AND deleted_at IS NULL)::int AS active,
        COUNT(*)::int AS total,
        COUNT(DISTINCT category)::int AS categories
      FROM public.products
    `)
    const byCat = await client.query(`
      SELECT category, COUNT(*)::int AS n
        FROM public.products
       WHERE is_active AND deleted_at IS NULL
       GROUP BY category
       ORDER BY n DESC
       LIMIT 25
    `)

    console.log('=== Catalogue seed complete ===')
    console.log(summary.rows[0])
    console.log(
      'Top categories:',
      byCat.rows.map((r) => `${r.category}: ${r.n}`).join(' | ')
    )

    if (summary.rows[0].active < 250) {
      console.error(`FAIL: active products ${summary.rows[0].active} < 250`)
      process.exitCode = 1
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    console.error('Catalogue seed failed:', err.message)
    console.error(err.stack)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
