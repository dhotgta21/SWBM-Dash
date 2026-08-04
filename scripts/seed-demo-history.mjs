#!/usr/bin/env node
/**
 * Demo history seeder: ~100 trade clients + multi-year invoices/quotations.
 *
 * Safety:
 *   Requires DEMO_SEED_CONFIRM=yes in the environment.
 *   Prefer a dedicated demo Supabase project. Never run against production
 *   customer data unless you intentionally accept data loss (wipe first).
 *
 * Usage:
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 20 --months 12
 *   DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --wipe-first
 *
 * Env (from .env.local):
 *   POSTGRES_URL_NON_POOLING | POSTGRES_URL | POSTGRES_PRISMA_URL
 *   DEMO_MODE / NEXT_PUBLIC_DEMO_MODE (optional; sets company name)
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
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

function parseArgs(argv) {
  const out = {
    clients: 100,
    months: 48,
    wipeFirst: false,
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--clients' && argv[i + 1]) out.clients = Math.max(1, parseInt(argv[++i], 10) || 100)
    else if (a === '--months' && argv[i + 1]) out.months = Math.max(1, parseInt(argv[++i], 10) || 48)
    else if (a === '--wipe-first') out.wipeFirst = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs [options]
  --clients N     Number of clients (default 100)
  --months N      Max history window in months (default 48; clients get varied tenure)
  --wipe-first    Run wipe-invoices-and-clients.sql first
  --dry-run       Print plan only, no writes`)
      process.exit(0)
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

if (process.env.DEMO_SEED_CONFIRM !== 'yes') {
  console.error(
    'Refusing to seed: set DEMO_SEED_CONFIRM=yes to confirm this is a demo database.\n' +
      'Example: DEMO_SEED_CONFIRM=yes node scripts/seed-demo-history.mjs --clients 20 --months 12'
  )
  process.exit(1)
}

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  console.error(
    'No Postgres connection string. Set POSTGRES_URL_NON_POOLING, POSTGRES_URL, or POSTGRES_PRISMA_URL.'
  )
  process.exit(1)
}

const isDemoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || process.env.DEMO_MODE === 'true'
const DEMO_COMPANY_NAME = 'Demo Builder Merchant'
const VAT_RATE = 20

const FIRST_NAMES = [
  'James', 'Sarah', 'Michael', 'Emma', 'David', 'Olivia', 'Thomas', 'Sophie',
  'Daniel', 'Chloe', 'Andrew', 'Lucy', 'Chris', 'Hannah', 'Mark', 'Emily',
  'Paul', 'Grace', 'Ryan', 'Amelia', 'Ben', 'Laura', 'Jack', 'Katie',
  'Sam', 'Natalie', 'Luke', 'Rebecca', 'Matt', 'Charlotte',
]
const LAST_NAMES = [
  'Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Davies', 'Evans', 'Thomas',
  'Johnson', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White',
  'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris', 'Martin', 'Jackson',
  'Clarke', 'Clark', 'Lewis', 'Young', 'Allen', 'King', 'Wright',
]
const TRADE_SUFFIXES = [
  'Builders', 'Construction', 'Developments', 'Building Services', 'Contractors',
  'Plumbing & Heating', 'Electrical', 'Roofing', 'Landscaping', 'Renovations',
  'Joinery', 'Groundworks', 'Interiors', 'Maintenance', 'Projects',
  'Windows & Doors', 'Tiling', 'Plastering', 'Brickwork', 'Extensions',
]
const TOWNS = [
  { town: 'Slough', county: 'Berkshire', postcode: 'SL1' },
  { town: 'Reading', county: 'Berkshire', postcode: 'RG1' },
  { town: 'High Wycombe', county: 'Buckinghamshire', postcode: 'HP11' },
  { town: 'Maidenhead', county: 'Berkshire', postcode: 'SL6' },
  { town: 'Windsor', county: 'Berkshire', postcode: 'SL4' },
  { town: 'Bracknell', county: 'Berkshire', postcode: 'RG12' },
  { town: 'Guildford', county: 'Surrey', postcode: 'GU1' },
  { town: 'Woking', county: 'Surrey', postcode: 'GU21' },
  { town: 'Oxford', county: 'Oxfordshire', postcode: 'OX1' },
  { town: 'Basingstoke', county: 'Hampshire', postcode: 'RG21' },
  { town: 'Staines', county: 'Surrey', postcode: 'TW18' },
  { town: 'Uxbridge', county: 'Greater London', postcode: 'UB8' },
  { town: 'Hounslow', county: 'Greater London', postcode: 'TW3' },
  { town: 'Ealing', county: 'Greater London', postcode: 'W5' },
  { town: 'Watford', county: 'Hertfordshire', postcode: 'WD17' },
]
const STREETS = [
  'High Street', 'Station Road', 'Church Lane', 'Park Avenue', 'London Road',
  'Mill Lane', 'Victoria Road', 'Queensway', 'Industrial Estate', 'Trade Park',
  'Yard Close', 'Builders Way', 'Commerce Road', 'Unit Court', 'Depot Road',
]

const MONTH_LETTERS = 'ABCDEFGHIJKL'

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundPence(value) {
  return Math.round(value * 100) / 100
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function dateISO(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function addDays(d, n) {
  const x = new Date(d.getTime())
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

function monthsAgo(from, months) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() - months)
  return d
}

function docNumber(prefix, year, monthIndex0, seq) {
  const letter = MONTH_LETTERS[monthIndex0]
  return `${prefix}-${year}-${letter}${seq}`
}

function tierForIndex(i, total) {
  const r = i / total
  if (r < 0.2) return 'hot'
  if (r < 0.7) return 'steady'
  return 'quiet'
}

/** Target average invoices per month by tier. */
const TIER_RATE = { hot: 6, steady: 2.2, quiet: 0.7 }

const PAYMENT_METHODS = ['bank_transfer', 'card', 'cash', 'cheque', 'ecod']

/**
 * UK builders-merchant seasonality (1.0 = average month).
 * Peaks Mar–Jun / Sep; quieter Dec–Jan and mid-winter freeze.
 */
function seasonalMultiplier(monthIndex0) {
  // monthIndex0: 0=Jan … 11=Dec
  const factors = [
    0.55, // Jan
    0.7, // Feb
    1.15, // Mar
    1.35, // Apr
    1.4, // May
    1.3, // Jun
    1.15, // Jul
    1.1, // Aug
    1.25, // Sep
    1.05, // Oct
    0.85, // Nov
    0.5, // Dec
  ]
  return factors[monthIndex0] ?? 1
}

/**
 * Assign client tenure in months so demos show mix of new vs long accounts.
 * ~25% ~12m, ~35% ~24m, ~25% ~36m, ~15% full window (up to 48m).
 */
function tenureMonthsForIndex(i, total, maxMonths) {
  const r = i / Math.max(1, total)
  let tenure
  if (r < 0.25) tenure = 12
  else if (r < 0.6) tenure = 24
  else if (r < 0.85) tenure = 36
  else tenure = maxMonths
  return Math.min(maxMonths, Math.max(6, tenure))
}

async function main() {
  const rng = mulberry32(20260804)
  const end = new Date()
  const start = monthsAgo(end, args.months)

  console.log('=== Demo history seed ===')
  console.log(`Clients: ${args.clients}`)
  console.log(`Window: ${dateISO(start)} → ${dateISO(end)} (${args.months} months)`)
  console.log(`Wipe first: ${args.wipeFirst}`)
  console.log(`Demo mode company: ${isDemoMode}`)
  if (args.dryRun) {
    console.log('Dry run only; exiting.')
    return
  }

  const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '')
  const client = new Client({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    if (args.wipeFirst) {
      console.log('Running wipe-invoices-and-clients.sql …')
      const wipeSql = readFileSync(join(__dirname, 'wipe-invoices-and-clients.sql'), 'utf8')
      await client.query(wipeSql)
      console.log('Wipe complete.')
    }

    const adminRes = await client.query(
      `SELECT id FROM public.profiles WHERE role = 'admin' AND is_active = true ORDER BY created_at ASC NULLS LAST LIMIT 1`
    )
    if (!adminRes.rows.length) {
      throw new Error(
        'No admin profile found. Bootstrap an admin via /register first, then re-run seed.'
      )
    }
    const adminId = adminRes.rows[0].id
    console.log(`Using created_by admin: ${adminId}`)

    // Company name for demo
    if (isDemoMode) {
      await client.query(
        `UPDATE public.company_settings
            SET company_name = $1, updated_at = now()
          WHERE id = 1`,
        [DEMO_COMPANY_NAME]
      )
      console.log(`company_settings.company_name → ${DEMO_COMPANY_NAME}`)
    }

    const prefixRes = await client.query(
      `SELECT invoice_prefix, quotation_prefix, default_vat_rate
         FROM public.company_settings WHERE id = 1`
    )
    const invoicePrefix = prefixRes.rows[0]?.invoice_prefix || 'INV'
    const quotePrefix = prefixRes.rows[0]?.quotation_prefix || 'QTE'
    const vatRate = Number(prefixRes.rows[0]?.default_vat_rate ?? VAT_RATE)

    const productsRes = await client.query(
      `SELECT id, code, name, unit, default_price, category
         FROM public.products
        WHERE is_active = true
          AND deleted_at IS NULL
          AND COALESCE(default_price, 0) > 0
        ORDER BY category NULLS LAST, name
        LIMIT 500`
    )
    let products = productsRes.rows
    if (!products.length) {
      console.warn('No priced products found; using synthetic line catalog.')
      products = [
        { id: null, code: 'DEMO-AGG-01', name: 'Building Sand (tonne)', unit: 'T', default_price: 42.5, category: 'Aggregates & Cement' },
        { id: null, code: 'DEMO-CEM-01', name: 'Cement 25kg', unit: 'BAG', default_price: 6.8, category: 'Cement & Additives' },
        { id: null, code: 'DEMO-BRK-01', name: 'Facing Brick', unit: 'EA', default_price: 0.85, category: 'Bricks' },
        { id: null, code: 'DEMO-BLK-01', name: 'Dense Block 100mm', unit: 'EA', default_price: 1.95, category: 'Blocks' },
        { id: null, code: 'DEMO-TIM-01', name: 'CLS Timber 47x100', unit: 'M', default_price: 4.2, category: 'Timber' },
        { id: null, code: 'DEMO-PB-01', name: 'Plasterboard 12.5mm', unit: 'SH', default_price: 8.4, category: 'Plasterboard' },
        { id: null, code: 'DEMO-INS-01', name: 'Cavity Insulation 100mm', unit: 'PK', default_price: 28.0, category: 'Cavity Insulation' },
        { id: null, code: 'DEMO-FIX-01', name: 'Assorted Fixings Pack', unit: 'PK', default_price: 12.5, category: 'Fixings' },
        { id: null, code: 'DEMO-TOO-01', name: 'Trade Tool Hire Kit', unit: 'DAY', default_price: 35.0, category: 'Tools' },
        { id: null, code: 'DEMO-ROF-01', name: 'Roofing Underlay', unit: 'RL', default_price: 48.0, category: 'Roofing' },
      ]
    }
    console.log(`Product pool: ${products.length}`)

    // Order number sequence start
    const orderSeqRes = await client.query(
      `SELECT next_value FROM public.order_number_sequence WHERE id = 1`
    )
    let orderNext = Number(orderSeqRes.rows[0]?.next_value ?? 100000)

    /** @type {Map<string, number>} */
    const docSeq = new Map()
    function nextDoc(prefix, year, month0) {
      const key = `${prefix}|${year}|${month0}`
      const n = (docSeq.get(key) || 0) + 1
      docSeq.set(key, n)
      return docNumber(prefix, year, month0, n)
    }

    // Build clients
    const clients = []
    const usedAccounts = new Set()
    for (let i = 0; i < args.clients; i++) {
      const first = pick(rng, FIRST_NAMES)
      const last = pick(rng, LAST_NAMES)
      const trade = pick(rng, TRADE_SUFFIXES)
      const company = `${last} ${trade}`
      const loc = pick(rng, TOWNS)
      const streetNo = 1 + Math.floor(rng() * 180)
      const street = pick(rng, STREETS)
      let account = String(1000000 + Math.floor(rng() * 8999999))
      while (usedAccounts.has(account)) {
        account = String(1000000 + Math.floor(rng() * 8999999))
      }
      usedAccounts.add(account)
      const tier = tierForIndex(i, args.clients)
      const tenureMonths = tenureMonthsForIndex(i, args.clients, args.months)
      const clientStart = monthsAgo(end, tenureMonths)
      clients.push({
        id: randomUUID(),
        first_name: first,
        last_name: last,
        email: `${first}.${last}.${i}@demo-trade.example`.toLowerCase().replace(/\s+/g, ''),
        phone: `07${String(100000000 + Math.floor(rng() * 899999999)).slice(0, 9)}`,
        company_name: company,
        account_number: account,
        address_line_1: `${streetNo} ${street}`,
        town: loc.town,
        county: loc.county,
        postcode: `${loc.postcode} ${1 + Math.floor(rng() * 9)}${String.fromCharCode(65 + Math.floor(rng() * 26))}${String.fromCharCode(65 + Math.floor(rng() * 26))}`,
        payment_terms_days: pick(rng, [14, 30, 30, 30, 45]),
        credit_limit: tier === 'hot' ? 25000 : tier === 'steady' ? 10000 : 5000,
        tier,
        tenureMonths,
        clientStart,
        notes: `Demo ${tier} account · ${trade} · ${tenureMonths}m history`,
      })
    }

    console.log(`Inserting ${clients.length} clients …`)
    await client.query('BEGIN')

    // Batch client inserts
    const CLIENT_BATCH = 25
    for (let i = 0; i < clients.length; i += CLIENT_BATCH) {
      const batch = clients.slice(i, i + CLIENT_BATCH)
      const values = []
      const params = []
      let p = 1
      for (const c of batch) {
        values.push(
          `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},true,false)`
        )
        params.push(
          c.id,
          c.first_name,
          c.last_name,
          c.email,
          c.phone,
          c.company_name,
          c.account_number,
          c.address_line_1,
          c.town,
          c.county,
          c.postcode,
          c.notes,
          c.payment_terms_days,
          c.credit_limit,
          adminId
        )
      }
      await client.query(
        `INSERT INTO public.clients (
           id, first_name, last_name, email, phone, company_name, account_number,
           address_line_1, town, county, postcode, notes,
           payment_terms_days, credit_limit, created_by, reviewed, ai_created
         ) VALUES ${values.join(',')}`,
        params
      )
    }
    console.log('Clients inserted.')

    // Generate documents
    let invoiceCount = 0
    let quoteCount = 0
    let itemCount = 0
    let paymentCount = 0
    const statusHist = { draft: 0, sent: 0, partial: 0, paid: 0, converted: 0 }

    const invoiceRows = []
    const itemRows = []
    const paymentRows = []

    for (const c of clients) {
      const rate = TIER_RATE[c.tier]
      const clientStart = c.clientStart || start
      const tenureMonths = c.tenureMonths || args.months
      // Base volume from tenure + tier, then seasonality scales per document.
      const expected = Math.max(2, Math.round(rate * tenureMonths))
      // Spread issue dates across THIS client's tenure (not always full window)
      for (let n = 0; n < expected; n++) {
        const t = n / Math.max(1, expected - 1)
        const baseMs = clientStart.getTime() + t * (end.getTime() - clientStart.getTime())
        const jitter = (rng() - 0.5) * 10 * 86400000
        let issue = new Date(baseMs + jitter)
        if (issue < clientStart) issue = clientStart
        if (issue > end) issue = end
        // Prefer weekdays
        while (issue.getUTCDay() === 0 || issue.getUTCDay() === 6) {
          issue = addDays(issue, 1)
          if (issue > end) {
            issue = addDays(end, -1)
            break
          }
        }

        const season = seasonalMultiplier(issue.getUTCMonth())
        // Skip some docs in quiet months so charts show real seasonality
        if (rng() > Math.min(1, 0.55 + season * 0.4)) {
          continue
        }

        const isQuote = rng() < 0.12
        const type = isQuote ? 'quotation' : 'invoice'
        const prefix = isQuote ? quotePrefix : invoicePrefix
        const year = issue.getUTCFullYear()
        const month0 = issue.getUTCMonth()
        const document_number = nextDoc(prefix, year, month0)
        const order_number = String(orderNext++)
        const invoiceId = randomUUID()

        // Line items 2–15; more lines in peak season for larger ticket
        const lineCount = 2 + Math.floor(rng() * (season > 1.1 ? 16 : 12))
        const lines = []
        for (let li = 0; li < lineCount; li++) {
          const prod = pick(rng, products)
          const qtyBase = 1 + Math.floor(rng() * 40 * season)
          const qty =
            prod.unit === 'T' || prod.unit === 'M' || prod.unit === 'TON'
              ? roundPence(0.5 + rng() * 12 * season)
              : Math.max(1, qtyBase)
          const price = roundPence(Number(prod.default_price) * (0.92 + rng() * 0.16))
          const lineNet = roundPence(qty * price)
          const lineVat = roundPence(lineNet * (vatRate / 100))
          lines.push({
            id: randomUUID(),
            invoice_id: invoiceId,
            product_id: prod.id,
            product_name: prod.name,
            product_code: prod.code,
            unit: prod.unit || 'EA',
            quantity: qty,
            price,
            vat_rate: vatRate,
            vat_amount: lineVat,
            line_total: roundPence(lineNet + lineVat),
            sort_order: li,
          })
        }
        const subtotal = roundPence(lines.reduce((s, l) => s + l.quantity * l.price, 0))
        const vat_total = roundPence(lines.reduce((s, l) => s + l.vat_amount, 0))
        const total = roundPence(subtotal + vat_total)

        // Status distribution for invoices
        let status
        let amount_paid = 0
        if (isQuote) {
          status = rng() < 0.35 ? 'converted' : rng() < 0.5 ? 'sent' : 'draft'
          if (status === 'converted') statusHist.converted++
          else statusHist[status]++
        } else {
          const ageDays = (end.getTime() - issue.getTime()) / 86400000
          const roll = rng()
          if (ageDays < 7 && roll < 0.25) status = 'draft'
          else if (roll < 0.08) status = 'draft'
          else if (roll < 0.18) status = 'sent'
          else if (roll < 0.28) status = 'partial'
          else status = 'paid'

          // Older docs more likely paid
          if (ageDays > 60 && status === 'sent' && rng() < 0.7) status = 'paid'
          if (ageDays > 90 && status === 'partial' && rng() < 0.5) status = 'paid'

          statusHist[status] = (statusHist[status] || 0) + 1
        }

        const terms = c.payment_terms_days || 30
        const due = addDays(issue, terms)
        const delivery = rng() < 0.75 ? 'delivery' : 'collection'
        const picking =
          !isQuote && (status === 'paid' || status === 'partial')
            ? 'delivered'
            : !isQuote && status === 'sent'
              ? pick(rng, ['not_started', 'in_progress', 'loaded', 'completed'])
              : 'not_started'

        invoiceRows.push({
          id: invoiceId,
          type,
          document_number,
          order_number,
          account_number: c.account_number,
          client_id: c.id,
          status: isQuote && status === 'converted' ? 'converted' : status,
          issue_date: dateISO(issue),
          due_date: isQuote ? null : dateISO(due),
          expiry_date: isQuote ? dateISO(addDays(issue, 30)) : null,
          operator_name: 'Demo Operator',
          delivery_method: delivery,
          delivery_address_line_1: delivery === 'delivery' ? c.address_line_1 : null,
          delivery_town: delivery === 'delivery' ? c.town : null,
          delivery_county: delivery === 'delivery' ? c.county : null,
          delivery_postcode: delivery === 'delivery' ? c.postcode : null,
          subtotal,
          vat_total,
          total,
          amount_paid: 0, // payments trigger will recompute; we set after via payments
          created_by: adminId,
          picking_status: picking,
          your_reference: `PO-${1000 + Math.floor(rng() * 9000)}`,
          notes: c.tier === 'hot' ? 'Priority trade account delivery' : null,
          _status: status,
          _isQuote: isQuote,
        })

        for (const line of lines) itemRows.push(line)

        if (!isQuote && (status === 'paid' || status === 'partial')) {
          const payAmount =
            status === 'paid'
              ? total
              : roundPence(total * (0.25 + rng() * 0.5))
          if (payAmount > 0) {
            paymentRows.push({
              id: randomUUID(),
              invoice_id: invoiceId,
              amount: Math.min(payAmount, total),
              payment_date: dateISO(addDays(issue, 1 + Math.floor(rng() * Math.max(1, terms)))),
              method: pick(rng, PAYMENT_METHODS),
              reference: `PAY-${document_number}`,
              created_by: adminId,
            })
          }
        }

        if (isQuote) quoteCount++
        else invoiceCount++
        itemCount += lines.length
      }
    }

    console.log(
      `Generated ${invoiceRows.length} documents (${invoiceCount} inv / ${quoteCount} qte), ${itemRows.length} lines, ${paymentRows.length} payments`
    )
    console.log('Status histogram:', statusHist)

    // Insert invoices in batches (paid/partial start as sent; payments flip status)
    const INV_BATCH = 40
    for (let i = 0; i < invoiceRows.length; i += INV_BATCH) {
      const batch = invoiceRows.slice(i, i + INV_BATCH)
      const values = []
      const params = []
      let p = 1
      for (const inv of batch) {
        let insertStatus = inv.status
        // Payments trigger expects sent/draft; for paid/partial insert as 'sent' then pay
        if (insertStatus === 'paid' || insertStatus === 'partial') insertStatus = 'sent'
        values.push(
          `($${p++}::uuid,$${p++},$${p++},$${p++},$${p++},$${p++}::uuid,$${p++},$${p++}::date,$${p++}::date,$${p++}::date,$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++}::uuid,$${p++},$${p++},$${p++})`
        )
        params.push(
          inv.id,
          inv.type,
          inv.document_number,
          inv.order_number,
          inv.account_number,
          inv.client_id,
          insertStatus,
          inv.issue_date,
          inv.due_date,
          inv.expiry_date,
          inv.operator_name,
          inv.delivery_method,
          inv.delivery_address_line_1,
          inv.delivery_town,
          inv.delivery_county,
          inv.delivery_postcode,
          inv.subtotal,
          inv.vat_total,
          inv.total,
          inv.created_by,
          inv.picking_status,
          inv.your_reference,
          inv.notes
        )
      }
      await client.query(
        `INSERT INTO public.invoices (
           id, type, document_number, order_number, account_number, client_id,
           status, issue_date, due_date, expiry_date, operator_name, delivery_method,
           delivery_address_line_1, delivery_town, delivery_county, delivery_postcode,
           subtotal, vat_total, total, created_by, picking_status, your_reference, notes
         ) VALUES ${values.join(',')}`,
        params
      )
    }
    console.log('Invoices inserted.')

    const ITEM_BATCH = 100
    for (let i = 0; i < itemRows.length; i += ITEM_BATCH) {
      const batch = itemRows.slice(i, i + ITEM_BATCH)
      const values = []
      const params = []
      let p = 1
      for (const it of batch) {
        values.push(
          `($${p++}::uuid,$${p++}::uuid,$${p++}::uuid,$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
        )
        params.push(
          it.id,
          it.invoice_id,
          it.product_id,
          it.product_name,
          it.product_code,
          it.unit,
          it.quantity,
          it.price,
          it.vat_rate,
          it.vat_amount,
          it.line_total,
          it.sort_order
        )
      }
      await client.query(
        `INSERT INTO public.invoice_items (
           id, invoice_id, product_id, product_name, product_code, unit,
           quantity, price, vat_rate, vat_amount, line_total, sort_order
         ) VALUES ${values.join(',')}`,
        params
      )
    }
    console.log('Line items inserted.')

    const PAY_BATCH = 50
    for (let i = 0; i < paymentRows.length; i += PAY_BATCH) {
      const batch = paymentRows.slice(i, i + PAY_BATCH)
      const values = []
      const params = []
      let p = 1
      for (const pay of batch) {
        values.push(
          `($${p++}::uuid,$${p++}::uuid,$${p++},$${p++}::date,$${p++},$${p++},$${p++}::uuid)`
        )
        params.push(
          pay.id,
          pay.invoice_id,
          pay.amount,
          pay.payment_date,
          pay.method,
          pay.reference,
          pay.created_by
        )
      }
      await client.query(
        `INSERT INTO public.payments (
           id, invoice_id, amount, payment_date, method, reference, created_by
         ) VALUES ${values.join(',')}`,
        params
      )
      paymentCount += batch.length
    }
    console.log(`Payments inserted: ${paymentCount}`)

    // Sync document_sequences to max used per prefix/year/month
    for (const [key, seq] of docSeq.entries()) {
      const [prefix, yearStr, month0Str] = key.split('|')
      const year = Number(yearStr)
      const month = Number(month0Str) + 1 // DB month is 1-12
      await client.query(
        `INSERT INTO public.document_sequences (prefix, year, month, current_number)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (prefix, year, month)
         DO UPDATE SET current_number = GREATEST(public.document_sequences.current_number, EXCLUDED.current_number)`,
        [prefix, year, month, seq]
      )
    }

    await client.query(
      `UPDATE public.order_number_sequence SET next_value = $1 WHERE id = 1`,
      [orderNext]
    )

    await client.query('COMMIT')

    const verify = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.clients) AS clients,
        (SELECT COUNT(*)::int FROM public.invoices WHERE type = 'invoice') AS invoices,
        (SELECT COUNT(*)::int FROM public.invoices WHERE type = 'quotation') AS quotations,
        (SELECT COUNT(*)::int FROM public.invoice_items) AS items,
        (SELECT COUNT(*)::int FROM public.payments) AS payments,
        (SELECT MIN(issue_date)::text FROM public.invoices) AS min_date,
        (SELECT MAX(issue_date)::text FROM public.invoices) AS max_date
    `)
    const statusCounts = await client.query(`
      SELECT status, COUNT(*)::int AS n
        FROM public.invoices
       GROUP BY status
       ORDER BY n DESC
    `)

    console.log('=== Seed complete ===')
    console.log(verify.rows[0])
    console.log('Statuses:', statusCounts.rows)
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    console.error('Seed failed:', err.message)
    console.error(err.stack)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
