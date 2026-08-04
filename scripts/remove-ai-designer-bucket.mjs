#!/usr/bin/env node
/**
 * Remove the ai-designer-uploads Supabase Storage bucket.
 * Run this before applying 064_remove_ai_designer.sql if the bucket exists.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function loadEnvFile(filePath) {
  const env = {}
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
      if (key) env[key] = value
    }
  } catch (err) {
    console.warn('Could not load .env.local:', err.message)
  }
  return env
}

const env = loadEnvFile(join(__dirname, '..', '.env.local'))

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)

const bucketId = 'ai-designer-uploads'

async function run() {
  // Check whether the bucket exists.
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) {
    console.error('Failed to list buckets:', listError.message)
    process.exit(1)
  }

  const bucket = buckets.find((b) => b.id === bucketId || b.name === bucketId)
  if (!bucket) {
    console.log(`Bucket '${bucketId}' does not exist; nothing to do.`)
    return
  }

  // List and remove all objects first (handles prefixes/folders that
  // emptyBucket can miss), then delete the bucket.
  async function removeAllObjects() {
    const { data: listData, error: listError } = await supabase.storage.from(bucketId).list('', {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listError) {
      console.error(`Failed to list objects in '${bucketId}':`, listError.message)
      process.exit(1)
    }

    const items = listData || []
    const folders = items.filter((item) => item.id === null)
    const files = items.filter((item) => item.id !== null)

    for (const folder of folders) {
      await removeObjectsInPath(folder.name)
    }

    if (files.length > 0) {
      const paths = files.map((f) => f.name)
      const { error: removeError } = await supabase.storage.from(bucketId).remove(paths)
      if (removeError) {
        console.error(`Failed to remove objects from '${bucketId}':`, removeError.message)
        process.exit(1)
      }
      console.log(`✅ Removed ${paths.length} object(s) from '${bucketId}'.`)
    }
  }

  async function removeObjectsInPath(prefix) {
    const { data: listData, error: listError } = await supabase.storage.from(bucketId).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (listError) {
      console.error(`Failed to list objects in '${bucketId}/${prefix}':`, listError.message)
      process.exit(1)
    }

    const items = listData || []
    const folders = items.filter((item) => item.id === null)
    const files = items.filter((item) => item.id !== null)

    for (const folder of folders) {
      await removeObjectsInPath(`${prefix}/${folder.name}`)
    }

    if (files.length > 0) {
      const paths = files.map((f) => `${prefix}/${f.name}`)
      const { error: removeError } = await supabase.storage.from(bucketId).remove(paths)
      if (removeError) {
        console.error(`Failed to remove objects from '${bucketId}/${prefix}':`, removeError.message)
        process.exit(1)
      }
      console.log(`✅ Removed ${paths.length} object(s) from '${bucketId}/${prefix}'.`)
    }
  }

  await removeAllObjects()

  const { error: emptyError } = await supabase.storage.emptyBucket(bucketId)
  if (emptyError) {
    console.error(`Failed to empty bucket '${bucketId}':`, emptyError.message)
    process.exit(1)
  }

  const { error: deleteError } = await supabase.storage.deleteBucket(bucketId)
  if (deleteError) {
    console.error(`Failed to delete bucket '${bucketId}':`, deleteError.message)
    process.exit(1)
  }
  console.log(`✅ Deleted bucket '${bucketId}'.`)
}

run().catch((err) => {
  console.error('Unexpected error:', err.message)
  process.exit(1)
})
