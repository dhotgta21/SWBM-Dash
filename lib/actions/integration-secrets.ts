'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import {
  encryptSecret,
  extractEncryptedLast4,
  isEncryptedSecret,
} from '@/lib/encryption/api-keys'

const secretSchema = z
  .string()
  .trim()
  .min(8, 'API key looks too short.')
  .max(256, 'API key is too long.')

const siteKeySchema = z
  .string()
  .trim()
  .max(64, 'Site key is too long.')

const fromAddressSchema = z
  .string()
  .trim()
  .max(256, 'From address is too long.')
  .transform((value) => value.replace(/^"(.*)"$/, '$1'))
  .refine(
    (value) => {
      if (!value) return true
      // Accepts email@domain.com or Name <email@domain.com>.
      const simple = /^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/
      const named = /^[^<>]+ <[^\s<>]+@[^\s<>]+\.[^\s<>]+>$/
      return simple.test(value) || named.test(value)
    },
    { message: 'Enter a valid email address or Name <email@domain.com> format.' },
  )

const providerSchema = z.enum(['resend', 'turnstile', 'goaddress'])

const updateSchema = z.object({
  resendApiKey: z.string().trim().optional(),
  resendFromAddress: fromAddressSchema.optional().or(z.literal('')),
  turnstileSecretKey: z.string().trim().optional(),
  turnstileSiteKey: siteKeySchema.optional().or(z.literal('')),
  goaddressToken: z.string().trim().optional(),
})

export interface IntegrationSecrets {
  resend: {
    hasApiKey: boolean
    apiKeyLast4: string | null
    fromAddress: string | null
    updatedAt: string | null
  }
  turnstile: {
    hasSecretKey: boolean
    secretKeyLast4: string | null
    siteKey: string | null
    updatedAt: string | null
  }
  goaddress: {
    hasToken: boolean
    tokenLast4: string | null
    updatedAt: string | null
  }
  rotationWarningDays: number
  updatedAt: string | null
}

/**
 * Read the current integration secrets configuration. Returns safe metadata
 * only — never the plaintext secrets. Admin only.
 */
export async function getIntegrationSecrets(): Promise<IntegrationSecrets> {
  await assertAdmin()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('company_integration_secrets')
    .select(
      'resend_api_key_encrypted, resend_from_address, resend_api_key_updated_at, turnstile_secret_key_encrypted, turnstile_site_key, turnstile_secret_key_updated_at, goaddress_token_encrypted, goaddress_token_updated_at, rotation_warning_days, updated_at',
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[integration-secrets] get failed:', error)
    return {
      resend: { hasApiKey: false, apiKeyLast4: null, fromAddress: null, updatedAt: null },
      turnstile: { hasSecretKey: false, secretKeyLast4: null, siteKey: null, updatedAt: null },
      goaddress: { hasToken: false, tokenLast4: null, updatedAt: null },
      rotationWarningDays: 90,
      updatedAt: null,
    }
  }

  const resendEncrypted = (data?.resend_api_key_encrypted as string | null) ?? null
  const turnstileEncrypted = (data?.turnstile_secret_key_encrypted as string | null) ?? null
  const goaddressEncrypted = (data?.goaddress_token_encrypted as string | null) ?? null

  return {
    resend: {
      hasApiKey: isEncryptedSecret(resendEncrypted),
      apiKeyLast4: resendEncrypted ? extractEncryptedLast4(resendEncrypted) : null,
      fromAddress: (data?.resend_from_address as string | null) ?? null,
      updatedAt: (data?.resend_api_key_updated_at as string | null) ?? null,
    },
    turnstile: {
      hasSecretKey: isEncryptedSecret(turnstileEncrypted),
      secretKeyLast4: turnstileEncrypted ? extractEncryptedLast4(turnstileEncrypted) : null,
      siteKey: (data?.turnstile_site_key as string | null) ?? null,
      updatedAt: (data?.turnstile_secret_key_updated_at as string | null) ?? null,
    },
    goaddress: {
      hasToken: isEncryptedSecret(goaddressEncrypted),
      tokenLast4: goaddressEncrypted ? extractEncryptedLast4(goaddressEncrypted) : null,
      updatedAt: (data?.goaddress_token_updated_at as string | null) ?? null,
    },
    rotationWarningDays: (data?.rotation_warning_days as number) ?? 90,
    updatedAt: (data?.updated_at as string | null) ?? null,
  }
}

/**
 * Update integration secrets. Values supplied as non-empty strings are
 * AES-256-GCM encrypted before being written to the database. Empty strings
 * clear the corresponding column. Admin only.
 */
export async function updateIntegrationSecrets(
  input: Partial<{
    resendApiKey?: string
    resendFromAddress?: string
    turnstileSecretKey?: string
    turnstileSiteKey?: string
    goaddressToken?: string
  }>,
): Promise<{ success?: true; error?: string }> {
  const user = await assertAdmin()

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid settings payload.' }
  }

  const {
    resendApiKey,
    resendFromAddress,
    turnstileSecretKey,
    turnstileSiteKey,
    goaddressToken,
  } = parsed.data

  const patch: Record<string, unknown> = {
    id: 1,
    updated_by: user.id,
  }

  try {
    if (resendApiKey !== undefined) {
      if (resendApiKey.length > 0) {
        const validated = secretSchema.safeParse(resendApiKey)
        if (!validated.success) {
          return { error: validated.error.issues[0]?.message ?? 'Invalid Resend API key.' }
        }
        patch.resend_api_key_encrypted = encryptSecret(validated.data)
        patch.resend_api_key_updated_at = new Date().toISOString()
      } else {
        patch.resend_api_key_encrypted = null
        patch.resend_api_key_updated_at = new Date().toISOString()
      }
    }

    if (resendFromAddress !== undefined) {
      const normalised = resendFromAddress.trim().replace(/^"(.*)"$/, '$1')
      patch.resend_from_address = normalised.length > 0 ? normalised : null
    }

    if (turnstileSecretKey !== undefined) {
      if (turnstileSecretKey.length > 0) {
        const validated = secretSchema.safeParse(turnstileSecretKey)
        if (!validated.success) {
          return { error: validated.error.issues[0]?.message ?? 'Invalid Turnstile secret key.' }
        }
        patch.turnstile_secret_key_encrypted = encryptSecret(validated.data)
        patch.turnstile_secret_key_updated_at = new Date().toISOString()
      } else {
        patch.turnstile_secret_key_encrypted = null
        patch.turnstile_secret_key_updated_at = new Date().toISOString()
      }
    }

    if (turnstileSiteKey !== undefined) {
      patch.turnstile_site_key = turnstileSiteKey.trim().length > 0 ? turnstileSiteKey.trim() : null
    }

    if (goaddressToken !== undefined) {
      if (goaddressToken.length > 0) {
        // Strip accidental "Bearer " prefix from portal docs copy-paste.
        const cleaned = goaddressToken.trim().replace(/^Bearer\s+/i, '').trim()
        const validated = secretSchema.safeParse(cleaned)
        if (!validated.success) {
          return { error: validated.error.issues[0]?.message ?? 'Invalid GoAddress token.' }
        }
        patch.goaddress_token_encrypted = encryptSecret(validated.data)
        patch.goaddress_token_updated_at = new Date().toISOString()
      } else {
        patch.goaddress_token_encrypted = null
        patch.goaddress_token_updated_at = new Date().toISOString()
      }
    }
  } catch (error) {
    console.error('[integration-secrets] encryption failed:', error)
    return {
      error:
        'Could not encrypt a secret. Make sure AI_DESIGNER_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) is set in the server environment (Vercel).',
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('company_integration_secrets')
    .upsert(patch, { onConflict: 'id' })

  if (error) {
    console.error('[integration-secrets] upsert failed:', error)
    return { error: 'Could not save settings. Please try again.' }
  }

  // Bust the in-process GoAddress token cache so the next postcode lookup
  // picks up the newly saved / cleared token immediately.
  if (goaddressToken !== undefined) {
    try {
      const { clearGoAddressTokenCache } = await import('@/lib/actions/postcode')
      await clearGoAddressTokenCache()
    } catch (err) {
      console.warn('[integration-secrets] could not clear GoAddress cache:', err)
    }
  }

  return { success: true }
}

/**
 * Update the number of days after which stored secrets are flagged as needing
 * rotation. Admin only.
 */
export async function updateRotationWarningDays(
  days: number,
): Promise<{ success?: true; error?: string }> {
  const user = await assertAdmin()

  const parsed = z
    .number()
    .int('Enter a whole number.')
    .min(1, 'Warning period must be at least 1 day.')
    .max(730, 'Warning period cannot exceed 730 days.')
    .safeParse(days)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid warning period.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('company_integration_secrets')
    .upsert({ id: 1, rotation_warning_days: parsed.data, updated_by: user.id }, { onConflict: 'id' })

  if (error) {
    console.error('[integration-secrets] updateRotationWarningDays failed:', error)
    return { error: 'Could not save the warning period. Please try again.' }
  }

  return { success: true }
}

/** Remove a stored secret for a single provider. Admin only. */
export async function clearIntegrationSecret(
  provider: 'resend' | 'turnstile' | 'goaddress',
): Promise<{ success?: true; error?: string }> {
  const user = await assertAdmin()

  const parsed = providerSchema.safeParse(provider)
  if (!parsed.success) {
    return { error: 'Unknown provider.' }
  }

  const columnMap = {
    resend: {
      encrypted: 'resend_api_key_encrypted',
      updatedAt: 'resend_api_key_updated_at',
    },
    turnstile: {
      encrypted: 'turnstile_secret_key_encrypted',
      updatedAt: 'turnstile_secret_key_updated_at',
    },
    goaddress: {
      encrypted: 'goaddress_token_encrypted',
      updatedAt: 'goaddress_token_updated_at',
    },
  } as const

  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { error } = await admin
    .from('company_integration_secrets')
    .upsert(
      {
        id: 1,
        [columnMap[parsed.data].encrypted]: null,
        [columnMap[parsed.data].updatedAt]: now,
        updated_by: user.id,
      },
      { onConflict: 'id' },
    )

  if (error) {
    console.error('[integration-secrets] clear failed:', error)
    return { error: 'Could not remove the stored secret. Please try again.' }
  }

  if (parsed.data === 'goaddress') {
    try {
      const { clearGoAddressTokenCache } = await import('@/lib/actions/postcode')
      await clearGoAddressTokenCache()
    } catch (err) {
      console.warn('[integration-secrets] could not clear GoAddress cache:', err)
    }
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function assertAdmin(): Promise<{ id: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) {
    throw new Error('Not authorised')
  }

  return { id: user.id }
}
