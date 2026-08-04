import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'

function loadEnv(p) {
  if (!existsSync(p)) return
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[line.slice(0, i).trim()] = v
  }
}
loadEnv(resolve('.env'))
loadEnv(resolve('.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })

console.log('Project:', url)

const tables = [
  'products',
  'clients',
  'invoices',
  'invoice_items',
  'payments',
  'profiles',
  'company_settings',
  'quote_requests',
  'campaigns',
]
for (const t of tables) {
  const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
  console.log(`${t.padEnd(20)} ${error ? 'ERR ' + error.message : count}`)
}

const { data: company } = await admin
  .from('company_settings')
  .select('company_name, email_from_name, logo_url')
  .eq('id', 1)
  .maybeSingle()
console.log('company:', company)

const { data: admins } = await admin
  .from('profiles')
  .select('email, role, is_active')
  .in('role', ['admin', 'staff'])
console.log('staff/admin profiles:', admins)

const { data: cats } = await admin
  .from('products')
  .select('category')
  .eq('is_active', true)
  .not('category', 'is', null)
const map = new Map()
for (const r of cats || []) map.set(r.category, (map.get(r.category) || 0) + 1)
console.log('categories:', [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 25))

// Check critical product columns exist
const raw =
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL
const clean = raw.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/\?&/, '?').replace(/\?$/, '')
const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })
await client.connect()
const cols = await client.query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='products'
    AND column_name IN ('deleted_at','is_temporary','is_active','sale_price','track_stock')
  ORDER BY 1
`)
console.log('product key columns:', cols.rows.map((r) => r.column_name))

const authTok = await client.query(`
  SELECT email,
         confirmation_token = '' AS ok_confirm,
         recovery_token = '' AS ok_recovery
  FROM auth.users
`)
console.log('auth tokens empty-string:', authTok.rows)

await client.end()
