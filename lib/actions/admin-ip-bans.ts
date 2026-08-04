'use server'

// IP ban administration. Lives here (not inside admin-quote-requests.ts)
// because it touches a different table and the operations are stateless —
// list, lift, manually add. Admin-only on every action.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'

export interface IpBanRow {
  id: string
  ip_address: string
  reason: string
  banned_at: string
  expires_at: string | null
  banned_by: string | null // null = auto-banned by record_ip_email
  is_automatic: boolean
}

/**
 * Active IP bans — those without an expiry, or with an expiry in the
 * future. Ordered most-recent first. The admin client bypasses RLS
 * (ip_bans has no policies for anon / authenticated).
 */
async function checkIpBanPermission() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const isAdminUserRow = await isAdminUser(supabase, user.id)
  if (!isAdminUserRow) return { ok: false }
  return { ok: true, supabase, userId: user.id }
}

export async function listActiveIpBans(): Promise<IpBanRow[]> {
  const guard = await checkIpBanPermission()
  if (!guard.ok) return []

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('listActiveIpBans: admin client unavailable:', e)
    return []
  }
  // PostgREST does not evaluate SQL functions inside .or() — `now()` would be
  // sent as a literal string and rejected as an invalid timestamptz, making
  // this query fail (and silently return []) on every call. Interpolate an
  // ISO timestamp instead.
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('ip_bans')
    .select('id, ip_address, reason, banned_at, expires_at, banned_by')
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('banned_at', { ascending: false })

  if (error) {
    console.error('listActiveIpBans failed:', error)
    return []
  }

  return (data ?? []).map((row) => {
    const r = row as {
      id: string
      ip_address: string
      reason: string
      banned_at: string
      expires_at: string | null
      banned_by: string | null
    }
    return {
      ...r,
      is_automatic: r.banned_by === null,
    }
  })
}

/**
 * Lift a ban by id. Uses the unban_ip RPC which sets expires_at to the
 * past so the existing index on active bans stops matching it.
 */
export async function unbanIpById(banId: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await checkIpBanPermission()
  if (!guard.ok) return { ok: false, error: 'You do not have permission to lift IP bans.' }

  const parsed = z.string().uuid('Invalid ban id.').safeParse(banId)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid ban id.' }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('unbanIpById: admin client unavailable:', e)
    return { ok: false, error: 'IP ban service is not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }
  }
  // We need the IP off the row to call unban_ip (it takes an inet, not
  // a uuid). Two round trips but the action is rare.
  const { data: row, error: lookupErr } = await admin
    .from('ip_bans')
    .select('ip_address')
    .eq('id', parsed.data)
    .maybeSingle()

  if (lookupErr || !row) {
    return { ok: false, error: 'Ban not found.' }
  }

  const ip = (row as { ip_address: string }).ip_address
  const { error } = await admin.rpc('unban_ip', { p_ip: ip })
  if (error) {
    console.error('unban_ip RPC failed:', error)
    return { ok: false, error: 'Could not lift the ban.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}

const manualBanSchema = z.object({
  ip: z.string().trim().min(1, 'IP address is required.').max(64),
  reason: z.string().trim().min(3, 'Please give a short reason.').max(280),
  // Empty string → no expiry (NULL). Otherwise must be a parseable date.
  expiresAt: z
    .string()
    .trim()
    .optional()
    .refine(
      (v) => !v || !Number.isNaN(Date.parse(v)),
      'Expiry must be a valid date or left blank.'
    ),
})

export interface ManualBanInput {
  ip: string
  reason: string
  expiresAt?: string
}

/**
 * Manually ban an IP. Admins reach for this when an abuse report
 * arrives outside the auto-ban threshold (e.g. a single persistent
 * spammer who never rotates emails).
 *
 * Idempotent: re-banning an already-banned IP is a no-op rather than
 * an error — easier for the admin than a duplicate-key error message.
 */
export async function banIpManually(input: ManualBanInput): Promise<{ ok: boolean; error?: string }> {
  const guard = await checkIpBanPermission()
  if (!guard.ok) return { ok: false, error: 'You do not have permission to ban IPs.' }

  const parsed = manualBanSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
  }

  const { ip, reason } = parsed.data
  const expiresAt = parsed.data.expiresAt?.trim()
    ? new Date(parsed.data.expiresAt.trim()).toISOString()
    : null

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('banIpManually: admin client unavailable:', e)
    return { ok: false, error: 'IP ban service is not configured. Set SUPABASE_SERVICE_ROLE_KEY.' }
  }
  const { error } = await admin.from('ip_bans').insert({
    ip_address: ip,
    reason,
    banned_by: guard.userId,
    expires_at: expiresAt,
  })

  if (error) {
    // 23505 = unique_violation on ip_address. Already banned — treat
    // as success so the admin doesn't think their click did nothing.
    if (error.code === '23505') {
      revalidatePath('/settings')
      return { ok: true }
    }
    // Bad IP literal (Postgres rejects malformed inet with code 22P02).
    if (error.code === '22P02') {
      return { ok: false, error: 'That IP address is not valid.' }
    }
    console.error('ban_ip insert failed:', error)
    return { ok: false, error: 'Could not save the ban.' }
  }

  revalidatePath('/settings')
  return { ok: true }
}
