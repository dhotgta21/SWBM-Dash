import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedSecret } from '@/lib/encryption/api-keys'

export const TURNSTILE_INPUT_NAME = 'cf-turnstile-response'

interface CachedTurnstileCredentials {
  secretKey: string | null
  siteKey: string | null
  fetchedAt: number
}

let cached: CachedTurnstileCredentials | null = null
const CACHE_TTL_MS = 30_000

async function loadStoredCredentials(): Promise<CachedTurnstileCredentials> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('company_integration_secrets')
    .select('turnstile_secret_key_encrypted, turnstile_site_key')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[turnstile] failed to load stored credentials:', error)
  }

  const encrypted = (data?.turnstile_secret_key_encrypted as string | null) ?? null
  let secretKey: string | null = null
  if (encrypted && isEncryptedSecret(encrypted)) {
    secretKey = decryptSecret(encrypted)
    if (!secretKey) {
      console.error('[turnstile] could not decrypt stored secret key. Has ENCRYPTION_KEY changed?')
    }
  }

  const siteKey = (data?.turnstile_site_key as string | null)?.trim() || null

  cached = {
    secretKey,
    siteKey,
    fetchedAt: Date.now(),
  }
  return cached
}

/**
 * Resolve the Cloudflare Turnstile secret key. Resolution order:
 *   1. Stored encrypted key in company_integration_secrets (admin-managed).
 *   2. TURNSTILE_SECRET_KEY environment variable.
 */
export async function getTurnstileSecretKey(): Promise<string | null> {
  const stored = await loadStoredCredentials()
  return stored.secretKey ?? process.env.TURNSTILE_SECRET_KEY ?? null
}

/**
 * Resolve the Cloudflare Turnstile site key. Resolution order:
 *   1. Stored value in company_integration_secrets (admin-managed).
 *   2. NEXT_PUBLIC_TURNSTILE_SITE_KEY environment variable.
 */
export async function getTurnstileSiteKey(): Promise<string | null> {
  const stored = await loadStoredCredentials()
  return stored.siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null
}

/**
 * Clear the in-memory credential cache. Useful in tests and after dashboard
 * updates where the next request should read the latest stored value.
 */
export function clearTurnstileCredentialCache(): void {
  cached = null
}

/**
 * Extract the Turnstile token from a FormData object without verifying it.
 * Use this when the token will be passed to Supabase Auth (which verifies it
 * itself) rather than verified directly by our server.
 */
export function getTurnstileToken(formData: FormData): string | null {
  const token = formData.get(TURNSTILE_INPUT_NAME)
  if (typeof token !== 'string' || !token.trim()) {
    return null
  }
  return token
}

interface TurnstileVerifyResponse {
  success: boolean
  'error-codes'?: string[]
  challenge_ts?: string
  hostname?: string
  action?: string
  cdata?: string
}

/**
 * Verify a Cloudflare Turnstile token with Cloudflare's siteverify endpoint.
 * Returns null on success, or an error string on failure.
 */
export async function verifyTurnstileToken(token: string): Promise<string | null> {
  if (!token || typeof token !== 'string') {
    return 'Please complete the security check.'
  }

  const secretKey = await getTurnstileSecretKey()
  if (!secretKey) {
    console.error('[turnstile] secret key is not configured')
    return 'Security check is not configured. Please contact support.'
  }

  const body = new URLSearchParams({
    secret: secretKey,
    response: token,
  })

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    console.error('Turnstile verification HTTP error:', res.status, await res.text().catch(() => ''))
    return 'Security check could not be verified. Please try again.'
  }

  const data = (await res.json()) as TurnstileVerifyResponse

  if (data.success === true) {
    return null
  }

  const errors = data['error-codes'] ?? []
  console.warn('Turnstile verification failed:', errors)

  // User-facing messages for common error codes.
  if (errors.includes('timeout-or-duplicate')) {
    return 'Security check expired. Please verify again.'
  }
  if (errors.includes('bad-request')) {
    return 'Security check failed. Please refresh and try again.'
  }

  return 'Security check failed. Please try again.'
}

function isTestKey(key: string): boolean {
  // Cloudflare's documented dummy/test keys all start with these prefixes.
  return key.startsWith('1x0000') || key.startsWith('2x0000') || key.startsWith('3x0000')
}

/**
 * Extract and verify the Turnstile token from a FormData object.
 * Returns an error string if verification fails, or null on success.
 *
 * In development, dummy/test keys cannot render on localhost because
 * Cloudflare still enforces domain checks for the challenge iframe.
 * To keep local development usable, verification is skipped when a test
 * key is used in development. Production deployments with real keys are
 * always verified.
 */
export async function verifyTurnstileFormField(formData: FormData): Promise<string | null> {
  const secretKey = await getTurnstileSecretKey()
  if (
    process.env.NODE_ENV === 'development' &&
    secretKey &&
    isTestKey(secretKey)
  ) {
    console.warn('[Turnstile] Test secret key detected in development — skipping verification.')
    return null
  }

  const token = formData.get(TURNSTILE_INPUT_NAME)
  if (typeof token !== 'string' || !token.trim()) {
    return 'Please complete the security check.'
  }
  return verifyTurnstileToken(token)
}
