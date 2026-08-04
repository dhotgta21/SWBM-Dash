#!/usr/bin/env node
/**
 * Apply a single Supabase migration file to the live database.
 *
 * Usage:
 *   node scripts/apply-migration.mjs [filename]
 *
 * Examples:
 *   node scripts/apply-migration.mjs 055_product_seasonality.sql
 *   node scripts/apply-migration.mjs 054_invoice_field_auto_generation.sql
 *
 * The script loads credentials from `.env.local` and prefers the non-pooling
 * Postgres URL so ALTER TABLE statements run on a direct session.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Load .env.local into process.env.
function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()
      // Strip surrounding quotes (single or double).
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && !(key in process.env)) {
        process.env[key] = value
      }
    }
  } catch (err) {
    console.warn('Could not load .env.local:', err.message)
  }
}

loadEnvFile(join(__dirname, '..', '.env.local'))

const migrationFile = process.argv[2] || '055_product_seasonality.sql'
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', migrationFile)

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  console.error(
    'No Postgres connection string found. Set POSTGRES_URL_NON_POOLING, POSTGRES_URL, or POSTGRES_PRISMA_URL in .env.local'
  )
  process.exit(1)
}

let sql

try {
  sql = readFileSync(migrationPath, 'utf8')
} catch (err) {
  console.error(`Could not read migration file: ${migrationPath}`)
  console.error(err.message)
  process.exit(1)
}

// Supabase uses a self-signed certificate. Strip any sslmode from the URL
// and pass our own TLS config so the connection stays encrypted without
// requiring a publicly-trusted CA.
const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '')

const client = new Client({
  connectionString: cleanConnectionString,
  ssl: { rejectUnauthorized: false },
})

console.log(`Connecting to database...`)
await client.connect()

try {
  console.log(`Applying ${migrationFile}...`)
  await client.query(sql)
  console.log(`✅ Applied ${migrationFile} successfully.`)
} catch (err) {
  console.error(`❌ Failed to apply ${migrationFile}:`)
  console.error(err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
