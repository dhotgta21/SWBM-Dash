/**
 * Apply supabase/seed/00f_fix_clients_columns.sql (+ invoice discount cols for PDF)
 * against POSTGRES_URL_NON_POOLING from .env / .env.local.
 *
 * Usage: node scripts/apply-00f-clients.mjs
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name)
    if (!fs.existsSync(p)) continue
    const text = fs.readFileSync(p, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  }
}

loadEnv()

const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL

if (!url) {
  console.error('No POSTGRES_URL_NON_POOLING / POSTGRES_URL in env')
  process.exit(1)
}

const sqlPath = path.join(root, 'supabase/seed/00f_fix_clients_columns.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

// Also ensure invoice/line discount columns used by PDF select exist.
// Match migration 101 (nullable discount columns used by PDF select).
const invoiceDiscountSql = `
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2);
`

const c = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

await c.connect()
console.log('Applying 00f clients columns…')
await c.query(sql)
console.log('Applying invoice discount columns…')
await c.query(invoiceDiscountSql)

const check = await c.query(`
  SELECT
    (SELECT count(*) FROM public.clients WHERE deleted_at IS NULL AND coalesce(is_temporary,false)=false) AS permanent,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='invoices' AND column_name='discount_amount'
    ) AS inv_discount,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='clients' AND column_name='deleted_at'
    ) AS clients_deleted_at
`)
console.log('OK:', check.rows[0])
await c.end()
