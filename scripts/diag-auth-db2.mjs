import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

function loadEnv(path) {
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[line.slice(0, i).trim()] = v
  }
}
loadEnv(resolve('.env'))

const raw =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL
const clean = raw
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/\?&/, '?')
  .replace(/\?$/, '')

const client = new pg.Client({ connectionString: clean, ssl: { rejectUnauthorized: false } })
await client.connect()

const cols = await client.query(`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema='auth' AND table_name='users'
  ORDER BY ordinal_position
`)
console.log('auth.users columns:')
for (const c of cols.rows) {
  console.log(`  ${c.column_name} ${c.data_type} null=${c.is_nullable}`)
}

// Any nulls in text-like token columns that should be ''
const row = await client.query(`SELECT * FROM auth.users WHERE email='dhotgta@gmail.com'`)
const u = row.rows[0]
console.log('\nnull / empty fields for dhotgta:')
for (const [k, v] of Object.entries(u)) {
  if (v === null) console.log('  NULL', k)
  if (v === '') console.log('  EMPTY', k)
}

// schemas / grants for authenticator / supabase_auth_admin
const roles = await client.query(`
  SELECT rolname FROM pg_roles
  WHERE rolname ILIKE '%auth%' OR rolname IN ('authenticator','service_role','anon','authenticated')
  ORDER BY 1
`)
console.log('\nroles', roles.rows.map((r) => r.rolname))

// Check if auth schema has expected tables
const tables = await client.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='auth' ORDER BY 1
`)
console.log('auth tables', tables.rows.map((r) => r.table_name))

// Try as if gotrue query
try {
  const q = await client.query(`
    SELECT * FROM auth.users WHERE instance_id = '00000000-0000-0000-0000-000000000000' OR instance_id IS NULL LIMIT 5
  `)
  console.log('instance_id query ok', q.rows.length, q.rows.map((r) => ({ email: r.email, instance_id: r.instance_id })))
} catch (e) {
  console.log('instance_id query fail', e.message)
}

// Check instance_id values
const inst = await client.query(`SELECT email, instance_id FROM auth.users`)
console.log('instance_ids', inst.rows)

// Check auth.schema_migrations if exists
try {
  const m = await client.query(`SELECT * FROM auth.schema_migrations ORDER BY 1 DESC LIMIT 10`)
  console.log('schema_migrations', m.rows)
} catch (e) {
  console.log('no schema_migrations', e.message)
}

// phone related nulls often break gotrue
const fix2 = await client.query(`
  UPDATE auth.users SET
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    email_change = COALESCE(email_change, '')
`)
console.log('broad fix rowCount', fix2.rowCount)

// instance_id fix: set to default if null
const fix3 = await client.query(`
  UPDATE auth.users
     SET instance_id = '00000000-0000-0000-0000-000000000000'
   WHERE instance_id IS NULL
`)
console.log('instance_id fix', fix3.rowCount)

// aud/role
const ar = await client.query(`SELECT email, aud, role FROM auth.users`)
console.log('aud/role', ar.rows)

await client.end()

// retest
import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: anon,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'dhotgta@gmail.com', password: 'A1b2c3d4@' }),
})
console.log('password grant status', res.status, (await res.text()).slice(0, 400))

const res2 = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=2`, {
  headers: { apikey: service, Authorization: `Bearer ${service}` },
})
console.log('admin users status', res2.status, (await res2.text()).slice(0, 400))
