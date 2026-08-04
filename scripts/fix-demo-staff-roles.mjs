/**
 * Force demo picker/driver/admin profiles.role (and clear permissions).
 * Safe to re-run. Bypasses app profile-update triggers.
 *
 * Usage: node scripts/fix-demo-staff-roles.mjs
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

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await c.connect()
await c.query('SET session_replication_role = replica')

const r = await c.query(`
  UPDATE public.profiles
     SET role = CASE lower(email)
                  WHEN 'picker@demo-builder.com' THEN 'picker'
                  WHEN 'driver@demo-builder.com' THEN 'driver'
                  WHEN 'admin@demo-builder.com' THEN 'admin'
                  ELSE role
                END,
         permissions = CASE
           WHEN lower(email) IN (
             'picker@demo-builder.com',
             'driver@demo-builder.com'
           ) THEN NULL
           ELSE permissions
         END,
         is_active = true,
         client_id = NULL
   WHERE lower(email) IN (
     'picker@demo-builder.com',
     'driver@demo-builder.com',
     'admin@demo-builder.com'
   )
   RETURNING email, role, permissions IS NULL AS permissions_null
`)
console.log(r.rows)
await c.query('SET session_replication_role = DEFAULT')
await c.end()
console.log('Demo staff roles fixed.')
