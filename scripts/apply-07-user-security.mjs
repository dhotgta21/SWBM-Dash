/**
 * Apply supabase/seed/07_fix_user_security_passwords.sql
 * Usage: node scripts/apply-07-user-security.mjs
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
  path.join(root, 'supabase/seed/07_fix_user_security_passwords.sql'),
  'utf8'
)
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
console.log('Applying 07_fix_user_security_passwords.sql…')
const result = await c.query(sql)
// last result from SELECT smoke
const rows = Array.isArray(result) ? result[result.length - 1]?.rows : result.rows
console.log('OK', rows)
await c.end()
