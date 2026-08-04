#!/usr/bin/env node
/**
 * Verify the quote-request auto-cleanup behaviour.
 *
 * Creates test rows, runs cleanup_stale_quote_requests(), and prints what
 * was removed / kept. Cleans up all test rows at the end.
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
  } catch {}
}

loadEnvFile(join(__dirname, '..', '.env.local'))

const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL

if (!connectionString) {
  console.error('No Postgres connection string found.')
  process.exit(1)
}

const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '')
const client = new Client({
  connectionString: cleanConnectionString,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const tests = [
  { status: 'rejected', ageDays: 8, shouldRemain: false },
  { status: 'cancelled', ageDays: 8, shouldRemain: false },
  { status: 'rejected', ageDays: 6, shouldRemain: true },
  { status: 'pending', ageDays: 8, shouldRemain: true },
  { status: 'invoiced', ageDays: 8, shouldRemain: true },
]

const ids = []

for (const t of tests) {
  const processedAt = new Date(Date.now() - t.ageDays * 24 * 60 * 60 * 1000).toISOString()
  const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()

  const { rows } = await client.query(
    `
      INSERT INTO public.quote_requests (
        request_number, client_name, client_email, status, ip_address,
        processed_at, created_at, updated_at
      ) VALUES (
        'QR-TEST-' || floor(random() * 100000)::text,
        'Test User', 'test@example.com', $1, '127.0.0.1'::inet,
        $2, $3, $3
      )
      RETURNING id
    `,
    [t.status, processedAt, createdAt]
  )
  ids.push({ id: rows[0].id, ...t })
}

console.log(`Inserted ${ids.length} test quote requests`)

const { rows: [{ cleanup_stale_quote_requests: deleted }] } =
  await client.query('SELECT public.cleanup_stale_quote_requests()')

console.log(`Cleanup removed ${deleted} rows (expected 2)`)

const { rows: remaining } = await client.query(
  'SELECT id, status, processed_at FROM public.quote_requests WHERE id = ANY($1)',
  [ids.map((i) => i.id)]
)

console.log(`Remaining test rows: ${remaining.length} (expected 3)`)
for (const r of remaining) {
  console.log(` - ${r.id} | ${r.status} | ${new Date(r.processed_at).toISOString()}`)
}

// Validate expectations
const expectedRemoved = ids.filter((i) => !i.shouldRemain).length
const expectedRemaining = ids.filter((i) => i.shouldRemain).length
const allCorrect = deleted === expectedRemoved && remaining.length === expectedRemaining

// Clean up test rows
await client.query('DELETE FROM public.quote_requests WHERE id = ANY($1)', [ids.map((i) => i.id)])
const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM public.quote_requests')
console.log(`Quote requests after test cleanup: ${count}`)

await client.end()

if (allCorrect) {
  console.log('\n✅ Auto-cleanup behaves as expected.')
} else {
  console.error('\n❌ Auto-cleanup did not behave as expected.')
  process.exit(1)
}
