#!/usr/bin/env node
/**
 * Wipe all invoices, customers (clients), and client portal accounts.
 *
 * Usage:
 *   node scripts/wipe-invoices-and-clients.mjs
 *
 * The script loads credentials from `.env.local` and prefers the non-pooling
 * Postgres URL so destructive DDL/DML runs on a direct session.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

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

const sqlPath = join(__dirname, 'wipe-invoices-and-clients.sql')
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
  sql = readFileSync(sqlPath, 'utf8')
} catch (err) {
  console.error(`Could not read SQL file: ${sqlPath}`)
  console.error(err.message)
  process.exit(1)
}

const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '')

const client = new Client({
  connectionString: cleanConnectionString,
  ssl: { rejectUnauthorized: false },
})

const countQueries = {
  invoices: 'SELECT COUNT(*) FROM public.invoices',
  invoice_items: 'SELECT COUNT(*) FROM public.invoice_items',
  payments: 'SELECT COUNT(*) FROM public.payments',
  public_share_views: 'SELECT COUNT(*) FROM public.public_share_views',
  clients: 'SELECT COUNT(*) FROM public.clients',
  client_invitations: 'SELECT COUNT(*) FROM public.client_invitations',
  client_inventory: 'SELECT COUNT(*) FROM public.client_inventory',
  client_quotes: 'SELECT COUNT(*) FROM public.client_quotes',
  client_delivery_addresses: 'SELECT COUNT(*) FROM public.client_delivery_addresses',
  client_profiles: "SELECT COUNT(*) FROM public.profiles WHERE role = 'client'",
  client_auth_users: "SELECT COUNT(*) FROM auth.users u JOIN public.profiles p ON p.id = u.id WHERE p.role = 'client'",
}

async function getCounts() {
  const counts = {}
  for (const [name, query] of Object.entries(countQueries)) {
    const result = await client.query(query)
    counts[name] = Number(result.rows[0].count)
  }
  return counts
}

function printCounts(label, counts) {
  console.log(`\n${label}`)
  console.table(counts)
}

console.log('Connecting to database...')
await client.connect()

try {
  console.log('\nGathering counts before wipe...')
  const before = await getCounts()
  printCounts('Counts before wipe', before)

  const totalInvoicesAndClients =
    before.invoices + before.clients + before.client_profiles
  if (totalInvoicesAndClients === 0) {
    console.log('\n⚠️  No invoices or clients found. Nothing to wipe.')
    process.exit(0)
  }

  console.log('\nApplying wipe script...')
  await client.query(sql)

  console.log('\nGathering counts after wipe...')
  const after = await getCounts()
  printCounts('Counts after wipe', after)

  const remaining =
    after.invoices +
    after.clients +
    after.client_profiles +
    after.client_auth_users

  if (remaining === 0) {
    console.log('\n✅ Wipe completed successfully.')
  } else {
    console.log(`\n⚠️  Wipe finished but some related rows remain: ${remaining}`)
    process.exitCode = 1
  }
} catch (err) {
  console.error('\n❌ Wipe failed:')
  console.error(err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
