// app/api/products/images/route.ts
// Admin endpoint for managing product images stored in the public
// `product-images` Supabase Storage bucket (migration 148). Images are
// public by nature once referenced by products, but listing and uploading
// are restricted to staff who can add/edit products.
//
// Previously this wrote to /public/products via fs at request time, which
// fails on serverless hosts (read-only fs) and is lost on every redeploy.

import { NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProductPermissions } from '@/lib/actions/products'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'product-images'
// SVG is intentionally excluded — uploaded SVGs can carry script payloads
// (stored XSS) when navigated to as a static file.
const ALLOWED_IMAGE_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/png',
  'image/gif',
])
const ALLOWED_EXTENSIONS = new Set(['.webp', '.jpg', '.jpeg', '.png', '.gif'])

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

async function requireProductManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { error: 'Not authenticated', status: 401 }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms?.canAdd && !perms?.canEdit) {
    return { error: 'Not authorised', status: 403 }
  }

  return { user, perms }
}

function publicUrlFor(objectPath: string): string {
  const adminClient = createAdminClient()
  const {
    data: { publicUrl },
  } = adminClient.storage.from(BUCKET).getPublicUrl(objectPath)
  return publicUrl
}

/**
 * GET /api/products/images
 * Returns an alphabetically sorted list of public image URLs in the bucket.
 */
export async function GET(_request: NextRequest) {
  void _request
  const auth = await requireProductManager()
  if ('error' in auth) {
    return jsonResponse({ error: auth.error }, auth.status)
  }

  try {
    const adminClient = createAdminClient()
    // Paginate the object listing — Storage caps each list call at 1000.
    const PAGE_SIZE = 1000
    const files: { name: string }[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await adminClient.storage.from(BUCKET).list('', {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) {
        console.error('Failed to list product images:', error)
        return jsonResponse({ error: 'Could not list product images' }, 500)
      }
      const page = (data ?? []).filter(
        (f) => f.name && ALLOWED_EXTENSIONS.has(path.extname(f.name).toLowerCase())
      )
      files.push(...page)
      if ((data ?? []).length < PAGE_SIZE) break
    }

    const urls = files
      .map((f) => publicUrlFor(f.name))
      .sort((a, b) => a.localeCompare(b))

    return jsonResponse({ images: urls })
  } catch (err) {
    console.error('Failed to list product images:', err)
    return jsonResponse({ error: 'Could not list product images' }, 500)
  }
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name, path.extname(name))
  const ext = path.extname(name).toLowerCase()
  const safe = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  // Timestamp + random suffix so concurrent uploads of identically-named
  // files never collide (Date.now() alone can repeat within the same ms).
  const suffix = Math.random().toString(36).slice(2, 8)
  return `${safe || 'image'}-${Date.now()}-${suffix}${ext}`
}

/**
 * POST /api/products/images
 * Uploads a single image file to the product-images bucket. Expects
 * multipart/form-data with a field named "image". Returns the public URL.
 */
export async function POST(request: NextRequest) {
  const auth = await requireProductManager()
  if ('error' in auth) {
    return jsonResponse({ error: auth.error }, auth.status)
  }

  try {
    const formData = await request.formData()
    const file = formData.get('image')

    if (!file || typeof file === 'string') {
      return jsonResponse({ error: 'No image file provided' }, 400)
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return jsonResponse(
        { error: `Unsupported image type: ${file.type}. Allowed: webp, jpg, png, gif` },
        400
      )
    }

    const originalName = file.name || 'upload'
    const ext = path.extname(originalName).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return jsonResponse({ error: 'Unsupported file extension' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return jsonResponse({ error: 'Empty image file' }, 400)
    }

    // 10 MB cap — matches the bucket's file_size_limit (migration 148).
    const MAX_SIZE = 10 * 1024 * 1024
    if (buffer.length > MAX_SIZE) {
      return jsonResponse({ error: 'Image must be smaller than 10 MB' }, 400)
    }

    const filename = sanitizeFilename(originalName)
    const adminClient = createAdminClient()
    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Failed to upload product image:', uploadError)
      return jsonResponse({ error: 'Could not upload image' }, 500)
    }

    return jsonResponse({ image: publicUrlFor(filename) })
  } catch (err) {
    console.error('Failed to upload product image:', err)
    return jsonResponse({ error: 'Could not upload image' }, 500)
  }
}
