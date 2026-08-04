import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret, isEncryptedSecret } from '@/lib/encryption/api-keys'

interface CachedResendCredentials {
  apiKey: string | null
  fromAddress: string | null
  fetchedAt: number
}

let cached: CachedResendCredentials | null = null
const CACHE_TTL_MS = 30_000

async function loadStoredCredentials(): Promise<CachedResendCredentials> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('company_integration_secrets')
    .select('resend_api_key_encrypted, resend_from_address')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[resend] failed to load stored credentials:', error)
  }

  const encrypted = (data?.resend_api_key_encrypted as string | null) ?? null
  let apiKey: string | null = null
  if (encrypted && isEncryptedSecret(encrypted)) {
    apiKey = decryptSecret(encrypted)
    if (!apiKey) {
      console.error('[resend] could not decrypt stored API key. Has ENCRYPTION_KEY changed?')
    }
  }

  const fromAddress = (data?.resend_from_address as string | null)?.trim() || null

  cached = {
    apiKey,
    fromAddress,
    fetchedAt: Date.now(),
  }
  return cached
}

/**
 * Resolve the Resend API key. Resolution order:
 *   1. Stored encrypted key in company_integration_secrets (admin-managed).
 *   2. RESEND_API_KEY environment variable.
 */
export async function getResendApiKey(): Promise<string | null> {
  const stored = await loadStoredCredentials()
  return stored.apiKey ?? process.env.RESEND_API_KEY ?? null
}

/**
 * Resolve the Resend From address. Resolution order:
 *   1. Stored value in company_integration_secrets (admin-managed).
 *   2. RESEND_FROM_ADDRESS environment variable.
 */
export async function getResendFromAddress(): Promise<string | null> {
  const stored = await loadStoredCredentials()
  return stored.fromAddress ?? process.env.RESEND_FROM_ADDRESS ?? null
}

/**
 * Clear the in-memory credential cache. Useful in tests and after dashboard
 * updates where the next request should read the latest stored value.
 */
export function clearResendCredentialCache(): void {
  cached = null
}
