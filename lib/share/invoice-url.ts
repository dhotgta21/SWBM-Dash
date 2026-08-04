// lib/share/invoice-url.ts
// Build the absolute public URL for an invoice's share view.
// The public path segment is either the opaque share key (preferred) or the
// legacy UUID share_token. The base URL is sourced (in priority order) from:
//   1. an explicit override passed in (e.g. the request origin in API routes)
//   2. window.location.origin on the client (browser fallback)
//
// The trailing slash is normalised so we can safely concatenate the path.

export interface BuildInvoiceShareUrlInput {
  /** Opaque share key — used in the URL when available. */
  shareKey?: string | null
  /** Legacy UUID share token — used as a fallback. */
  shareToken?: string | null
  /** Deprecated alias for shareToken / shareKey. Kept for back-compat. */
  token?: string | null
  baseUrl?: string | null
}

/**
 * Server-safe: build a clean absolute URL. Trims trailing slashes on the
 * base, validates a non-empty segment.
 */
export function buildInvoiceShareUrl(input: BuildInvoiceShareUrlInput): string {
  const segment = input.shareKey || input.token || input.shareToken
  if (!segment) {
    throw new Error('buildInvoiceShareUrl: shareKey, shareToken, or token is required')
  }
  const base = (input.baseUrl || '').trim().replace(/\/+$/, '')
  if (!base) {
    // Caller error — server routes should always pass a baseUrl (we
    // resolve from request headers there). Throwing makes the bug obvious.
    throw new Error('buildInvoiceShareUrl: baseUrl is required (no client fallback on the server)')
  }
  return `${base}/invoice/${segment}`
}

/**
 * Convenience for server contexts: derive the base URL from a Next.js
 * request URL, honouring x-forwarded-proto so it works behind a proxy
 * (Vercel, Cloudflare, etc.). Falls back to the raw request origin.
 *
 * SECURITY: x-forwarded-* headers are only trusted when the deployment
 * opts in via the `TRUST_PROXY` env var. Without that opt-in, a bare
 * Node / Next.js deploy that receives a request with attacker-set
 * `X-Forwarded-Host: evil.com` would otherwise let that attacker
 * influence URLs placed in outbound emails (phishing vector). Vercel
 * and most managed platforms strip these headers before the app sees
 * them, so the env var stays off there. Bare / self-hosted deployments
 * that genuinely sit behind a reverse proxy should set TRUST_PROXY=1
 * (and ensure the proxy is the only thing that can reach the app).
 */
export function baseUrlFromRequest(request: Request | URL): string {
  const url = request instanceof URL ? request : new URL(request.url)
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true'

  let protocol = url.protocol.replace(':', '')
  let host = url.hostname
  let port = url.port || ''

  if (trustProxy && request instanceof Request) {
    const fwdProto = request.headers.get('x-forwarded-proto')
    const fwdHost = request.headers.get('x-forwarded-host')
    const fwdPort = request.headers.get('x-forwarded-port')

    if (fwdProto) protocol = fwdProto.split(',')[0]?.trim() || protocol
    if (fwdHost) host = fwdHost.split(',')[0]?.trim() || host
    if (fwdPort) port = fwdPort.split(',')[0]?.trim() || port
  }

  // SECURITY: when TRUST_PROXY is set we trust the upstream-set
  // x-forwarded-host. A misconfigured proxy that forwards an
  // attacker-controlled Host header here would let that attacker
  // influence the base URL we put into outbound emails (a phishing
  // pivot — the link in the customer's inbox would point at the
  // attacker's domain). For multi-tenant / multi-domain deployments
  // add an explicit allow-list check against an env var like
  // TRUSTED_FORWARDED_HOSTS=starhawkbm.com,app.starhawkbm.com before
  // applying fwdHost. For a single-domain deployment behind a sane
  // reverse proxy, the x-forwarded-host *should* match what the proxy
  // itself received from the public DNS, and this is safe.

  const hostWithPort =
    port && !host.includes(':') && !['80', '443'].includes(port) ? `${host}:${port}` : host

  return `${protocol}://${hostWithPort}`
}

/**
 * Pick the best base URL from the request, or a provided client origin.
 * Returns an empty string if neither is usable so the caller can decide
 * what to do (we never silently default to "").
 */
export function resolveBaseUrl(opts: {
  request?: Request | URL
  clientOrigin?: string | null
}): string {
  if (opts.request) return baseUrlFromRequest(opts.request)
  if (opts.clientOrigin) return opts.clientOrigin.replace(/\/+$/, '')
  return ''
}
