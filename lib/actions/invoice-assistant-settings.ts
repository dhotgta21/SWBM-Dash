'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { encryptApiKey, extractEncryptedLast4 } from '@/lib/encryption/api-keys'

const modelSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[a-zA-Z0-9._-]*$/, 'Model name may only contain letters, numbers, dots, dashes and underscores.')
  .optional()
  .or(z.literal(''))

const apiKeySchema = z
  .string()
  .trim()
  .min(8, 'API key looks too short.')
  .max(256, 'API key is too long.')

const updateSchema = z.object({
  deepseekApiKey: z.string().trim().optional(),
  deepseekModel: modelSchema,
})

export interface InvoiceAssistantSettings {
  /** True if a stored encrypted key exists. The plaintext is never returned. */
  has_api_key: boolean
  /** Last 4 chars of the stored key, for the operator to confirm which key is in use. */
  api_key_last4: string | null
  /** Currently configured model override, if any. */
  model: string | null
  updated_at: string | null
}

/**
 * Read the current invoice-assistant configuration. Returns safe metadata
 * only — never the plaintext key. Admin only.
 */
export async function getInvoiceAssistantSettings(): Promise<InvoiceAssistantSettings> {
  await assertAdmin()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invoice_assistant_api_key')
    .select('deepseek_api_key_encrypted, deepseek_model, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    console.error('[invoice-assistant-settings] get failed:', error)
    return { has_api_key: false, api_key_last4: null, model: null, updated_at: null }
  }

  const encrypted = (data?.deepseek_api_key_encrypted as string | null) ?? null
  const model = (data?.deepseek_model as string | null) ?? null
  const updatedAt = (data?.updated_at as string | null) ?? null

  return {
    has_api_key: !!encrypted,
    api_key_last4: encrypted ? extractEncryptedLast4(encrypted) : null,
    model: model?.trim() ? model.trim() : null,
    updated_at: updatedAt,
  }
}

/**
 * Update the assistant configuration. The API key (when supplied) is
 * AES-256-GCM encrypted before being written to the database.
 *
 * - Empty `deepseekApiKey` leaves the existing key in place.
 * - Empty `deepseekModel` clears the override so the env / default wins.
 */
export async function updateInvoiceAssistantSettings(input: {
  deepseekApiKey?: string
  deepseekModel?: string
}): Promise<{ success?: true; error?: string }> {
  const user = await assertAdmin()

  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid settings payload.' }
  }

  const { deepseekApiKey, deepseekModel } = parsed.data

  // Build the patch — only include columns the caller is changing.
  const patch: Record<string, unknown> = {
    id: 1,
    updated_by: user.id,
  }

  if (deepseekApiKey !== undefined) {
    if (deepseekApiKey.length > 0) {
      const validated = apiKeySchema.safeParse(deepseekApiKey)
      if (!validated.success) {
        return { error: validated.error.issues[0]?.message ?? 'Invalid API key.' }
      }
      try {
        patch.deepseek_api_key_encrypted = encryptApiKey(validated.data)
      } catch (error) {
        console.error('[invoice-assistant-settings] encryption failed:', error)
        return {
          error:
            'Could not encrypt the API key. Make sure AI_DESIGNER_KEY_ENCRYPTION_KEY is set in the server environment.',
        }
      }
    }
    // Empty string explicitly clears the stored key (handled by the dedicated
    // clearInvoiceAssistantApiKey action, but we honour the empty-string case
    // here as well so a single save can do both).
    if (deepseekApiKey.length === 0) {
      patch.deepseek_api_key_encrypted = null
    }
  }

  if (deepseekModel !== undefined) {
    patch.deepseek_model = deepseekModel.trim().length > 0 ? deepseekModel.trim() : null
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('invoice_assistant_api_key')
    .upsert(patch, { onConflict: 'id' })

  if (error) {
    console.error('[invoice-assistant-settings] upsert failed:', error)
    return { error: 'Could not save settings. Please try again.' }
  }

  return { success: true }
}

/** Remove the stored API key. Admin only. Model override is left untouched. */
export async function clearInvoiceAssistantApiKey(): Promise<{ success?: true; error?: string }> {
  const user = await assertAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from('invoice_assistant_api_key')
    .upsert(
      { id: 1, deepseek_api_key_encrypted: null, updated_by: user.id },
      { onConflict: 'id' },
    )

  if (error) {
    console.error('[invoice-assistant-settings] clear failed:', error)
    return { error: 'Could not clear the API key. Please try again.' }
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

