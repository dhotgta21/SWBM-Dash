#!/usr/bin/env node
/**
 * Seed sample SKUs for non-construction demo verticals.
 *
 * Usage:
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-vertical-products.mjs
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-vertical-products.mjs --vertical plumbing
 *
 * Idempotent: uses fixed product codes (DEMO-PLU-*, DEMO-ELE-*, …).
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
  let vertical = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vertical' && argv[i + 1]) vertical = argv[++i]
  }
  return { vertical }
}

const { vertical: onlyVertical } = parseArgs(process.argv.slice(2))

/** @type {Record<string, Array<{code:string,name:string,category:string,unit:string,price:number,description:string}>>} */
const CATALOGS = {
  plumbing: [
    ['DEMO-PLU-001', '15mm Copper Tube 3m', 'Copper Tube & Fittings', 'LEN', 12.4, 'Half-hard copper tube 15mm x 3m'],
    ['DEMO-PLU-002', '22mm Copper Tube 3m', 'Copper Tube & Fittings', 'LEN', 22.8, 'Half-hard copper tube 22mm x 3m'],
    ['DEMO-PLU-003', '15mm End Feed Elbow', 'Copper Tube & Fittings', 'EA', 0.85, 'Copper end-feed 90° elbow 15mm'],
    ['DEMO-PLU-004', '22mm End Feed Tee', 'Copper Tube & Fittings', 'EA', 1.95, 'Copper end-feed equal tee 22mm'],
    ['DEMO-PLU-005', '15mm Isolating Valve', 'Valves & Controls', 'EA', 4.2, 'Chrome plated isolating valve 15mm'],
    ['DEMO-PLU-006', 'TRV Angled Pair', 'Valves & Controls', 'PR', 18.5, 'Thermostatic radiator valve pair'],
    ['DEMO-PLU-007', '22mm Zone Valve', 'Valves & Controls', 'EA', 42.0, '2-port motorised zone valve'],
    ['DEMO-PLU-008', '15mm Push-Fit Elbow', 'Plastic Pipe Systems', 'EA', 1.1, 'Plastic push-fit elbow 15mm'],
    ['DEMO-PLU-009', '22mm Push-Fit Pipe 3m', 'Plastic Pipe Systems', 'LEN', 9.8, 'Barrier pipe 22mm x 3m'],
    ['DEMO-PLU-010', '32mm Solvent Waste Pipe 3m', 'Plastic Pipe Systems', 'LEN', 6.4, 'Solvent weld waste pipe'],
    ['DEMO-PLU-011', 'Unvented Cylinder 150L', 'Heating & Cylinders', 'EA', 480, 'Indirect unvented cylinder 150 litre'],
    ['DEMO-PLU-012', 'Circulating Pump', 'Heating & Cylinders', 'EA', 95, 'Domestic heating circulator pump'],
    ['DEMO-PLU-013', 'Expansion Vessel 18L', 'Heating & Cylinders', 'EA', 38, 'Potable expansion vessel 18L'],
    ['DEMO-PLU-014', 'Close Coupled WC Pack', 'Sanitaryware Trade', 'EA', 145, 'Trade WC pan, cistern and seat pack'],
    ['DEMO-PLU-015', 'Basin Mixer Tap', 'Sanitaryware Trade', 'EA', 48, 'Chrome basin mixer with waste'],
    ['DEMO-PLU-016', 'Shower Mixer Valve', 'Sanitaryware Trade', 'EA', 120, 'Thermostatic shower mixer'],
    ['DEMO-PLU-017', 'PTFE Tape Pack', 'Tools', 'PK', 2.4, 'Pack of 10 PTFE rolls'],
    ['DEMO-PLU-018', 'Adjustable Wrench 250mm', 'Tools', 'EA', 14.5, 'Trade adjustable wrench'],
    ['DEMO-PLU-019', 'Pipe Clips 15mm (50)', 'Fixings', 'PK', 6.2, 'Plastic pipe clips 15mm pack 50'],
    ['DEMO-PLU-020', 'Boss White 400g', 'Miscellaneous', 'EA', 4.8, 'Jointing compound 400g'],
    ['DEMO-PLU-021', '15mm Compression Elbow', 'Copper Tube & Fittings', 'EA', 1.35, 'Brass compression elbow'],
    ['DEMO-PLU-022', '28mm Copper Tube 3m', 'Copper Tube & Fittings', 'LEN', 38.5, 'Half-hard copper tube 28mm'],
    ['DEMO-PLU-023', 'Magnetic Filter 22mm', 'Heating & Cylinders', 'EA', 65, 'Inline magnetic system filter'],
    ['DEMO-PLU-024', 'Programmer 2-Channel', 'Valves & Controls', 'EA', 52, 'Digital 2-channel programmer'],
    ['DEMO-PLU-025', 'Flexible Tap Connectors', 'Sanitaryware Trade', 'PR', 8.9, 'Pair flexible connectors 15mm'],
    ['DEMO-PLU-026', 'Immersion Heater 3kW', 'Heating & Cylinders', 'EA', 28, 'Incoloy immersion heater 3kW'],
    ['DEMO-PLU-027', '22mm Gate Valve', 'Valves & Controls', 'EA', 9.4, 'Full bore gate valve 22mm'],
    ['DEMO-PLU-028', 'Pipe Insulation 15mm 1m', 'Miscellaneous', 'LEN', 1.8, 'Foam pipe insulation 15mm'],
    ['DEMO-PLU-029', 'Soldering Kit Trade', 'Tools', 'EA', 36, 'Trade soldering kit with flux'],
    ['DEMO-PLU-030', 'Waste Trap Bath', 'Sanitaryware Trade', 'EA', 11.5, 'Bath trap with overflow'],
  ],
  electrical: [
    ['DEMO-ELE-001', '1.5mm T&E 100m', 'Cable & Flex', 'DR', 68, 'Twin and earth 1.5mm 100m drum'],
    ['DEMO-ELE-002', '2.5mm T&E 100m', 'Cable & Flex', 'DR', 95, 'Twin and earth 2.5mm 100m drum'],
    ['DEMO-ELE-003', '6.0mm T&E 50m', 'Cable & Flex', 'DR', 110, 'Twin and earth 6.0mm 50m'],
    ['DEMO-ELE-004', '1.5mm 3-Core Flex 50m', 'Cable & Flex', 'DR', 42, 'Flex 1.5mm 3-core 50m'],
    ['DEMO-ELE-005', 'SWA 3-Core 2.5mm 50m', 'Cable & Flex', 'DR', 145, 'Steel wire armoured cable'],
    ['DEMO-ELE-006', 'Mini Trunking 25x16 3m', 'Containment', 'LEN', 3.2, 'PVC mini trunking'],
    ['DEMO-ELE-007', 'Conduit 20mm 3m', 'Containment', 'LEN', 2.8, 'PVC conduit 20mm'],
    ['DEMO-ELE-008', 'Cable Tray 50mm 3m', 'Containment', 'LEN', 18.5, 'Light duty cable tray'],
    ['DEMO-ELE-009', 'Consumer Unit 10-Way', 'Switchgear & Boards', 'EA', 78, 'Metal consumer unit 10 way'],
    ['DEMO-ELE-010', 'MCB 32A B Curve', 'Switchgear & Boards', 'EA', 6.5, 'Single pole MCB 32A'],
    ['DEMO-ELE-011', 'RCBO 32A 30mA', 'Switchgear & Boards', 'EA', 22, 'RCBO 32A Type A'],
    ['DEMO-ELE-012', 'Main Switch 100A', 'Switchgear & Boards', 'EA', 18, 'Double pole main switch 100A'],
    ['DEMO-ELE-013', 'LED Downlight 8W', 'Lighting Trade', 'EA', 9.5, 'Fire-rated LED downlight'],
    ['DEMO-ELE-014', '5ft LED Batten', 'Lighting Trade', 'EA', 28, 'IP20 LED batten 5ft'],
    ['DEMO-ELE-015', 'Exterior Wall Light IP65', 'Lighting Trade', 'EA', 34, 'Bulkhead exterior light'],
    ['DEMO-ELE-016', 'Double Socket White', 'Wiring Accessories', 'EA', 3.8, '13A double socket white'],
    ['DEMO-ELE-017', '1-Gang Dimmer', 'Wiring Accessories', 'EA', 12.5, 'Trailing edge dimmer switch'],
    ['DEMO-ELE-018', 'Cooker Switch 45A', 'Wiring Accessories', 'EA', 14.2, '45A cooker control unit'],
    ['DEMO-ELE-019', 'Fused Spur', 'Wiring Accessories', 'EA', 5.6, 'Switched fused connection unit'],
    ['DEMO-ELE-020', 'Cable Clips 1.5mm (100)', 'Fixings', 'PK', 2.1, 'Round cable clips pack'],
    ['DEMO-ELE-021', 'Screwdriver Set VDE', 'Tools', 'SET', 24, 'VDE insulated screwdriver set'],
    ['DEMO-ELE-022', 'Voltage Tester', 'Tools', 'EA', 18, 'Two-pole voltage tester'],
    ['DEMO-ELE-023', 'Earth Rod Kit', 'Miscellaneous', 'EA', 32, 'Earth rod with clamp kit'],
    ['DEMO-ELE-024', 'Junction Box 20A', 'Wiring Accessories', 'EA', 1.9, '4-terminal junction box'],
    ['DEMO-ELE-025', 'Wago Lever Connectors (50)', 'Fixings', 'PK', 14, 'Lever connectors assortment'],
    ['DEMO-ELE-026', '3-Phase Board 12-Way', 'Switchgear & Boards', 'EA', 220, 'TP&N distribution board'],
    ['DEMO-ELE-027', 'Emergency Exit Sign', 'Lighting Trade', 'EA', 28, 'LED maintained exit sign'],
    ['DEMO-ELE-028', 'PIR Sensor Ceiling', 'Lighting Trade', 'EA', 16, 'Ceiling occupancy sensor'],
    ['DEMO-ELE-029', 'Cable Gland M20', 'Containment', 'EA', 0.95, 'Nylon cable gland M20'],
    ['DEMO-ELE-030', 'Steel Back Box 35mm', 'Wiring Accessories', 'EA', 1.4, 'Metal back box 1-gang 35mm'],
  ],
  windows: [
    ['DEMO-WIN-001', 'uPVC Casement Frame 1200x1200', 'uPVC Frames', 'EA', 185, 'White uPVC casement frame'],
    ['DEMO-WIN-002', 'uPVC Casement Frame 900x1200', 'uPVC Frames', 'EA', 155, 'White uPVC casement frame'],
    ['DEMO-WIN-003', 'uPVC Door Frame Single', 'uPVC Frames', 'EA', 320, 'uPVC residential door frame'],
    ['DEMO-WIN-004', 'Aluminium Casement 1200x1400', 'Aluminium Systems', 'EA', 410, 'Powder-coated aluminium casement'],
    ['DEMO-WIN-005', 'Aluminium Bifold 3-Panel', 'Aluminium Systems', 'EA', 1850, '3-panel bifold door system'],
    ['DEMO-WIN-006', 'Double Glazed Unit 4-16-4', 'Glass & Glazing', 'M2', 48, 'Clear double glazed unit per m2'],
    ['DEMO-WIN-007', 'Toughened Safety Glass', 'Glass & Glazing', 'M2', 62, 'Toughened glass per m2'],
    ['DEMO-WIN-008', 'Obscure Bathroom Glass', 'Glass & Glazing', 'M2', 55, 'Patterned obscure glass'],
    ['DEMO-WIN-009', 'Multipoint Lock 45mm', 'Hardware & Handles', 'EA', 38, 'Multipoint door lock 45mm backset'],
    ['DEMO-WIN-010', 'Window Handle White', 'Hardware & Handles', 'EA', 8.5, 'Espagnolette window handle'],
    ['DEMO-WIN-011', 'Butt Hinge Pair', 'Hardware & Handles', 'PR', 6.2, 'Stainless butt hinges pair'],
    ['DEMO-WIN-012', 'Letterplate Chrome', 'Hardware & Handles', 'EA', 18, 'Chrome letterplate'],
    ['DEMO-WIN-013', 'Low Modulus Silicone', 'Sealants & Fixings', 'EA', 4.5, 'Neutral cure silicone white'],
    ['DEMO-WIN-014', 'Expanding Foam Gun Grade', 'Sealants & Fixings', 'EA', 6.8, 'PU expanding foam'],
    ['DEMO-WIN-015', 'Frame Fixings 100mm (50)', 'Sealants & Fixings', 'PK', 9.5, 'Frame fixing pack'],
    ['DEMO-WIN-016', 'Packers Assorted', 'Sealants & Fixings', 'PK', 5.2, 'Plastic packers mixed pack'],
    ['DEMO-WIN-017', 'Glazing Shovel', 'Tools', 'EA', 12, 'Trade glazing shovel'],
    ['DEMO-WIN-018', 'Suction Lifter Pair', 'Tools', 'PR', 28, 'Glass suction lifters'],
    ['DEMO-WIN-019', 'Spirit Level 1200mm', 'Tools', 'EA', 22, 'Box section spirit level'],
    ['DEMO-WIN-020', 'uPVC Cill 150mm 1.5m', 'uPVC Frames', 'LEN', 18, 'uPVC window cill'],
    ['DEMO-WIN-021', 'Trickle Vent White', 'Hardware & Handles', 'EA', 7.4, 'Window trickle vent'],
    ['DEMO-WIN-022', 'Hinge Guard Pack', 'Hardware & Handles', 'PK', 11, 'Security hinge guards'],
    ['DEMO-WIN-023', 'Threshold Seal', 'Aluminium Systems', 'EA', 24, 'Door threshold seal'],
    ['DEMO-WIN-024', 'Spacer Bars Pack', 'Glass & Glazing', 'PK', 15, 'Warm edge spacer assortment'],
    ['DEMO-WIN-025', 'Window Restrictor', 'Hardware & Handles', 'EA', 9.8, 'Child safety restrictor'],
    ['DEMO-WIN-026', 'Silicone Gun', 'Tools', 'EA', 8.5, 'Skeleton silicone gun'],
    ['DEMO-WIN-027', 'Cleaning Kit Install', 'Miscellaneous', 'EA', 14, 'Post-install cleaning kit'],
    ['DEMO-WIN-028', 'Drip Bar Aluminium', 'Aluminium Systems', 'LEN', 12, 'Aluminium drip bar 2.5m'],
    ['DEMO-WIN-029', 'EPDM Gasket Roll', 'Sealants & Fixings', 'RL', 22, 'Glazing gasket roll'],
    ['DEMO-WIN-030', 'uPVC French Door Set', 'uPVC Frames', 'EA', 680, 'French door pair white uPVC'],
  ],
  tile: [
    ['DEMO-TIL-001', 'Porcelain Floor 600x600 Grey', 'Porcelain Tiles', 'M2', 28, 'Rectified porcelain floor tile'],
    ['DEMO-TIL-002', 'Porcelain Floor 800x800 White', 'Porcelain Tiles', 'M2', 36, 'Large format porcelain'],
    ['DEMO-TIL-003', 'Porcelain Wall 300x600', 'Porcelain Tiles', 'M2', 24, 'Wall porcelain matt'],
    ['DEMO-TIL-004', 'Ceramic Wall 250x400 White', 'Ceramic Tiles', 'M2', 14, 'Gloss ceramic wall tile'],
    ['DEMO-TIL-005', 'Ceramic Metro 100x200', 'Ceramic Tiles', 'M2', 22, 'Metro ceramic white'],
    ['DEMO-TIL-006', 'Ceramic Floor 330x330', 'Ceramic Tiles', 'M2', 16, 'Ceramic floor tile'],
    ['DEMO-TIL-007', 'Travertine 406x610', 'Natural Stone', 'M2', 42, 'Filled travertine'],
    ['DEMO-TIL-008', 'Slate 400x400', 'Natural Stone', 'M2', 38, 'Natural slate tile'],
    ['DEMO-TIL-009', 'Limestone 600x400', 'Natural Stone', 'M2', 48, 'Honed limestone'],
    ['DEMO-TIL-010', 'Flexible Adhesive 20kg', 'Adhesives & Grouts', 'BAG', 14.5, 'C2TE flexible tile adhesive'],
    ['DEMO-TIL-011', 'Rapid Set Adhesive 20kg', 'Adhesives & Grouts', 'BAG', 16.8, 'Rapid set adhesive'],
    ['DEMO-TIL-012', 'Grout 5kg Mid Grey', 'Adhesives & Grouts', 'BAG', 12.2, 'Cementitious grout'],
    ['DEMO-TIL-013', 'Epoxy Grout Kit', 'Adhesives & Grouts', 'EA', 38, 'Two-part epoxy grout'],
    ['DEMO-TIL-014', 'Primer 5L', 'Adhesives & Grouts', 'EA', 22, 'Acrylic primer for floors'],
    ['DEMO-TIL-015', 'Aluminium Tile Trim 2.5m', 'Trims & Profiles', 'LEN', 8.4, 'Straight edge trim'],
    ['DEMO-TIL-016', 'Movement Joint 2.5m', 'Trims & Profiles', 'LEN', 12.5, 'PVC movement joint'],
    ['DEMO-TIL-017', 'Quadrant Trim', 'Trims & Profiles', 'LEN', 6.8, 'Quadrant edge profile'],
    ['DEMO-TIL-018', 'Notched Trowel 10mm', 'Tools', 'EA', 9.5, 'Steel notched trowel'],
    ['DEMO-TIL-019', 'Tile Cutter 600mm', 'Tools', 'EA', 45, 'Manual tile cutter'],
    ['DEMO-TIL-020', 'Grout Float', 'Tools', 'EA', 7.2, 'Rubber grout float'],
    ['DEMO-TIL-021', 'Spacers 3mm (250)', 'Fixings', 'PK', 3.8, 'Tile spacers pack'],
    ['DEMO-TIL-022', 'Levelling Clips Kit', 'Fixings', 'PK', 18, 'Tile levelling system kit'],
    ['DEMO-TIL-023', 'Wet Room Tanking Kit', 'Miscellaneous', 'EA', 65, 'Tanking membrane kit'],
    ['DEMO-TIL-024', 'Decoupling Matting 5m2', 'Miscellaneous', 'RL', 48, 'Uncoupling matting roll'],
    ['DEMO-TIL-025', 'Porcelain 1200x600 Wood Effect', 'Porcelain Tiles', 'M2', 32, 'Wood-effect porcelain'],
    ['DEMO-TIL-026', 'Mosaic Sheet Glass', 'Ceramic Tiles', 'SH', 8.5, 'Glass mosaic sheet'],
    ['DEMO-TIL-027', 'External Porcelain 20mm', 'Porcelain Tiles', 'M2', 42, '20mm external porcelain'],
    ['DEMO-TIL-028', 'Sill Profile Aluminium', 'Trims & Profiles', 'LEN', 14, 'Window sill tile profile'],
    ['DEMO-TIL-029', 'Knee Pads Trade', 'Tools', 'PR', 16, 'Trade knee pads'],
    ['DEMO-TIL-030', 'Mixing Paddle', 'Tools', 'EA', 11, 'M14 mixing paddle'],
  ],
}

async function main() {
  const client = new Client({
    connectionString: connectionString.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    const verticals = onlyVertical
      ? [onlyVertical]
      : Object.keys(CATALOGS)

    let upserted = 0
    for (const v of verticals) {
      const rows = CATALOGS[v]
      if (!rows) {
        console.warn(`Unknown vertical: ${v}`)
        continue
      }
      console.log(`Seeding ${rows.length} products for ${v} …`)
      for (const [code, name, category, unit, price, description] of rows) {
        await client.query(
          `INSERT INTO public.products (
             code, name, description, unit, category, default_price, is_active,
             short_description, price_includes_vat
           ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,false)
           ON CONFLICT (code) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             unit = EXCLUDED.unit,
             category = EXCLUDED.category,
             default_price = EXCLUDED.default_price,
             short_description = EXCLUDED.short_description,
             is_active = true,
             updated_at = now()`,
          [code, name, description, unit, category, price, description]
        )
        upserted++
      }
    }
    console.log(`Done. Upserted ${upserted} sample products.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
