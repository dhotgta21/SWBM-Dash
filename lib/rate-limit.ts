// lib/rate-limit.ts
// Shared rate limiter backed by a Supabase table (public.rate_limits) so the
// budget survives across serverless instances. The auth.ts actions still keep
// an in-memory pre-filter for cheap, but the source of truth is the DB — a
// determined attacker can't bypass it by warming a different instance.
//
// Usage:
//   const supabase = await createClient()
//   const result = await rateLimit(supabase, `signin:${email}`, 5, 60_000)
//   if (!result.allowed) return { error: `Too many attempts. Retry in ${result.retryAfter}s.` }
//
// The Supabase table + RPC (public.check_rate_limit) are defined in
// supabase/migrations/019_security_hardening.sql (inlined into schema.sql).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets (only meaningful when allowed === false). */
  retryAfter: number
  /** Current count in the window (useful for tests / X-RateLimit-* headers). */
  count: number
}

export interface RateLimitOptions {
  /**
   * What to do when the underlying RPC is unavailable (migration missing,
   * transient DB error, network issue).
   *
   * - `false` (default) → fail closed: return `allowed: false`. Use this for
   *   security-critical paths (auth, invites, email send, public views).
   * - `true` → fail open: return `allowed: true` and log a warning. Only use
   *   this for non-security paths where a rate-limit outage should not block
   *   legitimate users.
   */
  failOpen?: boolean
}

// The generated supabase-js type pins the postgrest version via a generic
// that varies by installed version. The generated Database type also
// doesn't include the check_rate_limit RPC (added in a migration after
// types were generated), so we cast through unknown below. The first
// generic just needs to satisfy SupabaseClient's PostgrestVersion
// constraint.
type AnySupabase = SupabaseClient<Database, 'public'>

/**
 * Atomically increment the counter for `key` and check whether it exceeds
 * `max` within the current `windowMs` window. Returns an object describing
 * whether the call is allowed and how long until the window resets.
 *
 * By default this fails closed when the rate-limit RPC is unavailable. Pass
 * `{ failOpen: true }` for non-security-critical paths.
 */
export async function rateLimit(
  supabase: AnySupabase,
  key: string,
  max: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const { failOpen = false } = options

  // Defensive: reject obviously bad keys client-side. The RPC also
  // validates, but rejecting here saves a round-trip on accidental junk.
  if (!key || key.length > 200) {
    return { allowed: failOpen, retryAfter: 0, count: 0 }
  }
  if (!Number.isFinite(max) || max <= 0) {
    return { allowed: failOpen, retryAfter: 0, count: 0 }
  }
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000))

  try {
    // The check_rate_limit RPC is defined in 019_security_hardening.sql
    // and not present in the generated database.types.ts. Cast through
    // `unknown` so we don't have to regenerate types for a single
    // security helper.
    const { data, error } = await (supabase.rpc as unknown as (
      fn: string,
      args: { p_key: string; p_max: number; p_window_seconds: number }
    ) => Promise<{ data: number | null; error: { message: string } | null }>)(
      'check_rate_limit',
      { p_key: key, p_max: max, p_window_seconds: windowSeconds }
    )

    if (error) {
      console.warn(`rateLimit(${key}): RPC failed, failing ${failOpen ? 'open' : 'closed'}:`, error.message)
      return { allowed: failOpen, retryAfter: failOpen ? 0 : windowSeconds, count: 0 }
    }

    const count = typeof data === 'number' ? data : Number(data)
    if (count > max) {
      // Conservative retry-after: one full window. The next window may
      // have already started; the user can retry at the top of the
      // next minute (or whatever the window length is).
      return { allowed: false, retryAfter: windowSeconds, count }
    }
    return { allowed: true, retryAfter: 0, count }
  } catch (err) {
    console.warn(`rateLimit(${key}): unexpected error, failing ${failOpen ? 'open' : 'closed'}:`, err)
    return { allowed: failOpen, retryAfter: failOpen ? 0 : windowSeconds, count: 0 }
  }
}
