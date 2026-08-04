/**
 * Extract a client IP address from request headers in a proxy-aware way.
 *
 * SECURITY: only trust x-forwarded-for / x-real-ip / cf-connecting-ip /
 * true-client-ip when TRUST_PROXY=1 is set. Without that opt-in, a bare Node /
 * Next.js deploy that receives a request with attacker-set
 * X-Forwarded-For: 1.2.3.4 would let that attacker influence the per-IP
 * rate-limit bucket — letting them dodge bans or pin a quota on an innocent IP.
 * Vercel and most managed platforms strip these headers before the app sees
 * them, so the env var stays off there. Bare / self-hosted deployments that
 * genuinely sit behind a reverse proxy should set TRUST_PROXY=1 (and ensure
 * the proxy is the only thing that can reach the app).
 */
export function getClientIp(headersList: Headers): string {
  const trustProxy =
    process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'

  if (!trustProxy) {
    return '0.0.0.0'
  }

  // Standard reverse-proxy headers, first match wins. For x-forwarded-for we
  // take the RIGHTMOST non-empty entry: appending proxies (Vercel, Cloudflare,
  // most managed platforms) append the client IP they observed to the right of
  // any chain the request arrived with, so the leftmost entry is
  // attacker-controllable while the rightmost is what the trusted proxy saw.
  const xffEntries = headersList
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const candidates = [
    xffEntries && xffEntries.length > 0 ? xffEntries[xffEntries.length - 1] : undefined,
    headersList.get('x-real-ip')?.trim(),
    headersList.get('cf-connecting-ip')?.trim(),
    headersList.get('true-client-ip')?.trim(),
  ]
  for (const c of candidates) {
    if (c) return c
  }
  return '0.0.0.0'
}
