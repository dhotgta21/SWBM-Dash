#!/usr/bin/env node
/**
 * Apply any SQL file under supabase/ (seed or migration) using .env / .env.local.
 *
 *   node scripts/apply-sql-file.mjs supabase/seed/00d_fix_auth_null_tokens.sql
 *   node scripts/apply-sql-file.mjs supabase/seed/00_ALL_IN_ONE_fix_products.sql
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

function loadEnv(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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
    process.env[key] = value
  }
}

loadEnv(join(root, '.env'))
loadEnv(join(root, '.env.local'))

const rel = process.argv[2]
if (!rel) {
  console.error('Usage: node scripts/apply-sql-file.mjs <path-to.sql>')
  process.exit(1)
}

const sqlPath = resolve(root, rel)
if (!existsSync(sqlPath)) {
  console.error('File not found:', sqlPath)
  process.exit(1)
}

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  console.error('Missing POSTGRES_URL* in .env')
  process.exit(1)
}

const clean = connectionString
  .replace(/([?&])sslmode=[^&]*/g, '$1')
  .replace(/\?&/, '?')
  .replace(/\?$/, '')

const sql = readFileSync(sqlPath, 'utf8')
console.log('Applying', rel, `(${sql.length} chars)...`)

const client = new Client({
  connectionString: clean,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  const result = await client.query(sql)
  // pg returns array for multi-statement
  const results = Array.isArray(result) ? result : [result]
  for (const r of results) {
    if (r.rows?.length) {
      console.log('rows:', r.rows.slice(0, 20))
    } else if (r.rowCount != null) {
      console.log('rowCount:', r.rowCount, 'command:', r.command)
    }
  }
  console.log('OK', rel)
} catch (err) {
  console.error('FAIL', rel, err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
