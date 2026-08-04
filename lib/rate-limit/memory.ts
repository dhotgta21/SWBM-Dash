// lib/rate-limit/memory.ts
// In-memory token-bucket pre-filter used by security-sensitive server
// actions before they hit the shared Supabase-backed rate limiter.
//
// Keeping this in one place means all auth / public-form paths share
// the same pruning, sizing, and math instead of copy-pasting the same
// helpers into every action file.

import type { RateLimitResult } from '@/lib/rate-limit'

export interface MemoryBucket {
  tokens: number
  last: number
}

export interface MemoryRateLimiterOptions {
  /** Maximum number of buckets to retain in memory at one time. */
  maxBuckets: number
  /** Buckets idle longer than this (ms) are pruned. */
  staleMs?: number
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions) {
  const { maxBuckets, staleMs = 10 * 60_000 } = options
  const buckets = new Map<string, MemoryBucket>()

  function prune(now: number) {
    const staleCutoff = now - staleMs
    for (const [key, bucket] of buckets) {
      if (bucket.last < staleCutoff) buckets.delete(key)
    }
    if (buckets.size > maxBuckets) {
      const sorted = [...buckets.entries()].sort((a, b) => a[1].last - b[1].last)
      sorted.slice(0, sorted.length - maxBuckets).forEach(([key]) => buckets.delete(key))
    }
  }

  function check(key: string, max: number, windowMs: number, now = Date.now()): RateLimitResult {
    prune(now)
    const bucket = buckets.get(key) || { tokens: max, last: now }
    const elapsed = now - bucket.last
    bucket.tokens = Math.min(max, bucket.tokens + (elapsed / windowMs) * max)
    bucket.last = now
    if (bucket.tokens < 1) {
      return {
        allowed: false,
        retryAfter: Math.ceil((1 - bucket.tokens) * windowMs / max) / 1000,
        count: max,
      }
    }
    bucket.tokens -= 1
    buckets.set(key, bucket)
    return { allowed: true, retryAfter: 0, count: max - Math.floor(bucket.tokens) }
  }

  return { check, buckets }
}
