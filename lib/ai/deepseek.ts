// This module is intentionally NOT marked with 'use server'. It is a
// server-only utility that reads encrypted credentials from the database.
// Keeping it out of the public server-action surface prevents a browser
// client from invoking DeepSeek directly and consuming API quota or
// probing the configured model. It is only imported by other server code
// (server actions and API routes) which already enforce their own auth.

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptApiKey, isEncryptedApiKey } from '@/lib/encryption/api-keys'
import {
  type DeepSeekMessage,
  type DeepSeekTool,
} from './invoice-assistant/types'

const API_BASE = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const REQUEST_TIMEOUT_MS = 20_000

const deepSeekToolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
})

const deepSeekContentPartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image_url'), image_url: z.object({ url: z.string() }) }),
])

const deepSeekMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z
    .union([z.string().nullable(), z.array(deepSeekContentPartSchema)])
    .optional()
    .default(''),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
  tool_calls: z.array(deepSeekToolCallSchema).optional(),
})

const deepSeekResponseSchema = z.object({
  id: z.string(),
  object: z.string(),
  choices: z.array(
    z.object({
      message: deepSeekMessageSchema,
      finish_reason: z.string(),
      index: z.number(),
    })
  ),
})

export interface DeepSeekChatOptions {
  messages: DeepSeekMessage[]
  tools?: DeepSeekTool[]
  temperature?: number
  model?: string
  apiKey?: string
}

export async function callDeepSeek(options: DeepSeekChatOptions): Promise<{
  id: string
  object: string
  choices: {
    message: DeepSeekMessage
    finish_reason: string
    index: number
  }[]
}> {
  // Resolution order:
  //   1. Caller-supplied apiKey (escape hatch for tests / rotation scripts).
  //   2. Stored encrypted key in invoice_assistant_api_key (admin-managed via
  //      Settings → AI).
  // The DEEPSEEK_API_KEY env var was removed: the Settings page is now the
  // single source of truth, so rotating or revoking a key never requires a
  // server restart or environment redeploy.
  const apiKey = options.apiKey?.trim() || (await loadStoredApiKey())

  if (!apiKey) {
    throw new Error(
      'DeepSeek API key is not configured. Save one in Settings → AI as an admin.',
    )
  }

  const model = options.model ?? (await loadStoredModel()) ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools
    body.tool_choice = 'auto'
    // Force the model to emit at most one tool call per turn. Without
    // this, DeepSeek can fire `search_products` AND `prepare_line_item`
    // (or `add_line_item`) in the same response — bypassing the UI gate
    // and making the operator's confirmation irrelevant.
    body.parallel_tool_calls = false
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('DeepSeek request timed out. Please try again.')
    }
    throw new Error(`DeepSeek request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    throw new Error(`DeepSeek API error ${res.status}: ${text}`)
  }

  const raw = await res.json()
  const parsed = deepSeekResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[callDeepSeek] unexpected response shape:', raw)
    throw new Error('Unexpected response from DeepSeek')
  }

  return {
    ...parsed.data,
    choices: parsed.data.choices.map((choice) => ({
      ...choice,
      message: {
        ...choice.message,
        content: choice.message.content ?? '',
      } as DeepSeekMessage,
    })),
  }
}

// ---------------------------------------------------------------------------
// Stored credentials lookup (DB-backed admin-managed override)
// ---------------------------------------------------------------------------

interface StoredCredentials {
  apiKey: string | null
  model: string | null
  fetchedAt: number
}

let cached: StoredCredentials | null = null
const CACHE_TTL_MS = 30_000

async function loadStoredCredentials(): Promise<StoredCredentials> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('invoice_assistant_api_key')
      .select('deepseek_api_key_encrypted, deepseek_model')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      console.error('[callDeepSeek] failed to load stored credentials:', error)
      cached = { apiKey: null, model: null, fetchedAt: Date.now() }
      return cached
    }

    const encrypted = (data?.deepseek_api_key_encrypted as string | null) ?? null
    let apiKey: string | null = null

    if (encrypted) {
      // Guard against accidentally-plaintext rows from an old migration.
      if (!isEncryptedApiKey(encrypted)) {
        console.error(
          '[callDeepSeek] stored DeepSeek key is not in the expected encrypted format — refusing to use it.',
        )
      } else {
        const decrypted = decryptApiKey(encrypted)
        if (!decrypted) {
          console.error(
            '[callDeepSeek] stored DeepSeek key could not be decrypted (encryption key may have changed).',
          )
        } else {
          apiKey = decrypted
        }
      }
    }

    const modelRaw = (data?.deepseek_model as string | null) ?? null
    const model = modelRaw?.trim() ? modelRaw.trim() : null

    cached = { apiKey, model, fetchedAt: Date.now() }
    return cached
  } catch (error) {
    // Missing admin client (e.g. local dev without service role) shouldn't
    // crash the assistant — env-var path still works.
    console.warn('[callDeepSeek] stored credentials unavailable:', error)
    cached = { apiKey: null, model: null, fetchedAt: Date.now() }
    return cached
  }
}

async function loadStoredApiKey(): Promise<string | null> {
  const creds = await loadStoredCredentials()
  return creds.apiKey
}

async function loadStoredModel(): Promise<string | null> {
  const creds = await loadStoredCredentials()
  return creds.model
}

/**
 * Test/dev hook — drop the in-process cache so the next call re-reads the
 * database. Not exported from the public action surface; only used by tests.
 *
 * Marked async because the parent file uses 'use server', and Next.js
 * Server Actions can only export async functions. The body is still
 * synchronous; the async wrapper is just to satisfy the action
 * protocol so a non-action utility helper doesn't get optimised out.
 */
export async function __resetDeepSeekCredentialCache(): Promise<void> {
  cached = null
}