// app/api/cron/draft-invoices-cleanup/route.ts
// Triggered by Vercel Cron (see vercel.json) to remove draft invoices that
// have not been updated in 7 days and have no recorded payments. Protected by
// CRON_SECRET so it cannot be invoked by anonymous callers.
//
// Environment:
//   CRON_SECRET                 Shared secret Vercel sends in the Authorization header.
//   SUPABASE_SERVICE_ROLE_KEY   Service-role key for calling the cleanup RPC.
//   NEXT_PUBLIC_SUPABASE_URL    Project URL.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  // Constant-time comparison so the secret can't be probed byte-by-byte via
  // response timing. Length must match first (timingSafeEqual throws on
  // unequal buffers).
  const expected = process.env.CRON_SECRET
  const secretBuf = Buffer.from(secret ?? '')
  const expectedBuf = Buffer.from(expected ?? '')
  if (
    !secret ||
    !expected ||
    secretBuf.length !== expectedBuf.length ||
    !timingSafeEqual(secretBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase environment variables for cron cleanup')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: deleted, error } = await admin.rpc('cleanup_stale_draft_invoices')

    if (error) {
      console.error('cleanup_stale_draft_invoices failed:', error)
      return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
    }

    console.log(`Draft-invoice cleanup finished. Removed ${deleted ?? 0} stale draft(s).`)
    return NextResponse.json({ ok: true, deleted: deleted ?? 0 })
  } catch (err) {
    console.error('Unexpected error in draft-invoice cleanup cron:', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
