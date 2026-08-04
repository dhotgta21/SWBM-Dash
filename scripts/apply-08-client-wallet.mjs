/**
 * Apply supabase/seed/08_fix_client_wallet.sql
 * Usage: node scripts/apply-08-client-wallet.mjs
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
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

const url =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL
if (!url) {
  console.error('No Postgres URL')
  process.exit(1)
}

const sql = fs.readFileSync(
  path.join(root, 'supabase/seed/08_fix_client_wallet.sql'),
  'utf8'
)
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log('Applying 08_fix_client_wallet.sql…')
try {
  const result = await c.query(sql)
  const rows = Array.isArray(result) ? result[result.length - 1]?.rows : result.rows
  console.log('OK', rows)
} catch (e) {
  console.error('FAILED', e.message)
  process.exitCode = 1
}
await c.end()
