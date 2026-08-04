'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  decryptSecret,
  getEncryptionEnvStatus,
  isEncryptedSecret,
  logEncryptionEnvStatus,
} from '@/lib/encryption/api-keys'
import { rateLimit } from '@/lib/rate-limit'
import {
  isPlaceholderToken,
  mapGoAddressPayload,
  normalizeGoAddressToken,
  type PostcodeLookupResult,
} from '@/lib/postcode/goaddress-map'

// Do NOT re-export types from this 'use server' file. Next.js treats every
// export as a Server Action entry and fails the build for non-async exports
// (including type re-exports that leak into the actions bundle).

function formatPostcode(postcode: string): string {
  return postcode.trim().toUpperCase()
}

function normalizePostcode(postcode: string): string {
  const cleaned = postcode.replace(/\s/g, '').toUpperCase()
  const match = cleaned.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/)
  if (!match) return cleaned
  return `${match[1]} ${match[2]}`
}

/** Compact form used in the GoAddress path segment (docs use N33RP). */
function compactPostcode(postcode: string): string {
  return postcode.replace(/\s/g, '').toUpperCase()
}

interface CachedGoAddressCredentials {
  token: string | null
  decryptFailed: boolean
  hasStoredCiphertext: boolean
  fetchedAt: number
}

let cachedGoAddressToken: CachedGoAddressCredentials | null = null
const CACHE_TTL_MS = 30_000
const FAIL_CACHE_TTL_MS = 5_000

/** Call after Settings → Integrations saves/clears the GoAddress token. */
export async function clearGoAddressTokenCache(): Promise<void> {
  cachedGoAddressToken = null
}

function logGoAddressStatus(
  reason: string,
  extra: Record<string, unknown> = {},
): void {
  const enc = getEncryptionEnvStatus()
  const envTokenRaw = process.env.GOADDRESS_TOKEN?.trim() ?? ''
  const envTokenNormalized = envTokenRaw ? normalizeGoAddressToken(envTokenRaw) : ''
  const envTokenPlaceholder = envTokenNormalized
    ? isPlaceholderToken(envTokenNormalized)
    : false

  console.error(
    `[goaddress] ${reason}\n` +
      `  --- encryption env (names only, no secret values) ---\n` +
      `  ENCRYPTION_KEY: ${enc.ENCRYPTION_KEY ? 'SET' : 'MISSING'}\n` +
      `  ENCRYPTION_KEY_PREVIOUS: ${enc.ENCRYPTION_KEY_PREVIOUS ? 'SET' : 'MISSING'}\n` +
      `  AI_DESIGNER_KEY_ENCRYPTION_KEY: ${enc.AI_DESIGNER_KEY_ENCRYPTION_KEY ? 'SET' : 'MISSING'}\n` +
      `  write key name: ${enc.writeKeyName ?? 'NONE'}\n` +
      `  --- goaddress token sources ---\n` +
      `  GOADDRESS_TOKEN env: ${
        !envTokenRaw
          ? 'MISSING'
          : envTokenPlaceholder
            ? 'PLACEHOLDER (ignored)'
            : `SET (len=${envTokenNormalized.length})`
      }\n` +
      `  ${Object.entries(extra)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n  ')}`,
  )
}

async function getGoAddressCredentials(): Promise<CachedGoAddressCredentials> {
  const now = Date.now()
  if (cachedGoAddressToken) {
    const ttl =
      cachedGoAddressToken.token || !cachedGoAddressToken.decryptFailed
        ? CACHE_TTL_MS
        : FAIL_CACHE_TTL_MS
    if (now - cachedGoAddressToken.fetchedAt < ttl) {
      return cachedGoAddressToken
    }
  }

  let token: string | null = null
  let decryptFailed = false
  let hasStoredCiphertext = false
  let dbLoadError: string | null = null
  let tokenSource: 'database' | 'environment' | 'none' = 'none'

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('company_integration_secrets')
      .select('goaddress_token_encrypted')
      .eq('id', 1)
      .maybeSingle()

    if (error) {
      dbLoadError = error.message
      console.error('[goaddress] failed to load stored token from DB:', error)
    }

    const encrypted = (data?.goaddress_token_encrypted as string | null) ?? null
    if (encrypted && isEncryptedSecret(encrypted)) {
      hasStoredCiphertext = true
      token = decryptSecret(encrypted)
      if (!token) {
        decryptFailed = true
        logGoAddressStatus(
          'STORED TOKEN DECRYPT FAILED - ciphertext in company_integration_secrets cannot be opened with current env keys',
          {
            hasStoredCiphertext: true,
            decryptFailed: true,
            fix: 'Re-save GoAddress token in Settings → Integrations, OR ensure AI_DESIGNER_KEY_ENCRYPTION_KEY matches the value used when the token was saved',
          },
        )
      } else {
        tokenSource = 'database'
      }
    } else if (encrypted && !isEncryptedSecret(encrypted)) {
      logGoAddressStatus(
        'stored goaddress_token_encrypted is present but is not valid salt:iv:tag:cipher format',
        { encryptedShape: 'invalid' },
      )
    }
  } catch (err) {
    dbLoadError = err instanceof Error ? err.message : String(err)
    logEncryptionEnvStatus('goaddress credential load threw')
    console.error('[goaddress] credential load failed:', err)
  }

  if (token) {
    token = normalizeGoAddressToken(token)
  }

  const envToken = process.env.GOADDRESS_TOKEN
    ? normalizeGoAddressToken(process.env.GOADDRESS_TOKEN)
    : null
  if (!token && envToken && !isPlaceholderToken(envToken)) {
    token = envToken
    tokenSource = 'environment'
  } else if (!token && envToken && isPlaceholderToken(envToken)) {
    console.error(
      '[goaddress] GOADDRESS_TOKEN env is a placeholder (e.g. ...replace-me) and will be ignored',
    )
  }

  if (token && isPlaceholderToken(token)) {
    console.error('[goaddress] rejecting placeholder token after normalize')
    token = null
    tokenSource = 'none'
  }

  if (!token) {
    logGoAddressStatus('NO USABLE GOADDRESS TOKEN', {
      hasStoredCiphertext,
      decryptFailed,
      dbLoadError: dbLoadError ?? 'none',
      tokenSource,
      fix:
        'Paste token in Settings → Integrations → GoAddress and Save, or set a real GOADDRESS_TOKEN env var (not a placeholder)',
    })
  } else {
    console.info(
      `[goaddress] token ready (source=${tokenSource}, len=${token.length}, storedCiphertext=${hasStoredCiphertext}, decryptFailed=${decryptFailed})`,
    )
  }

  cachedGoAddressToken = {
    token,
    decryptFailed,
    hasStoredCiphertext,
    fetchedAt: now,
  }
  return cachedGoAddressToken
}

async function lookupGoAddress(
  postcode: string,
  token: string
): Promise<PostcodeLookupResult | { error: string; auth?: boolean }> {
  const pathPostcode = compactPostcode(postcode)

  try {
    const response = await fetch(
      `https://portal.goaddress.io/api/address/${encodeURIComponent(pathPostcode)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return {
          error:
            'Invalid GoAddress token. Open Settings → Integrations, paste a fresh token from portal.goaddress.io, and save.',
          auth: true,
        }
      }
      const errorData = (await response.json().catch(() => ({}))) as {
        message?: string
      }
      console.error('[goaddress] lookup HTTP', response.status, errorData)
      return {
        error:
          errorData.message ||
          `Postcode lookup failed (${response.status}). Please enter the address manually.`,
      }
    }

    const data: unknown = await response.json()
    const mapped = mapGoAddressPayload(data, postcode)
    if ('error' in mapped) {
      const root =
        data !== null && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null
      console.warn('[goaddress] empty suggestions', {
        keys: root ? Object.keys(root) : [],
        count: root?.count,
        remaining: root?.remaining_today,
      })
    } else {
      const root =
        data !== null && typeof data === 'object' && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : null
      if (root && typeof root.remaining_today === 'number' && root.remaining_today < 10) {
        console.warn('[goaddress] low remaining_today:', root.remaining_today)
      }
    }
    return mapped
  } catch (err) {
    console.error('[goaddress] network error:', err)
    return { error: 'Unable to connect to GoAddress. Please enter the address manually.' }
  }
}

async function lookupPostcodesIO(
  postcode: string
): Promise<PostcodeLookupResult | { error: string }> {
  try {
    const response = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(compactPostcode(postcode))}`,
      { cache: 'no-store' }
    )
    const data = await response.json()

    if (data.status !== 200 || !data.result) {
      return { error: 'Postcode not found. Please check and try again.' }
    }

    const result = data.result
    return {
      postcode,
      town: result.parish || result.admin_district || '',
      county: result.admin_county || result.region || '',
      suggestions: [],
      provider: 'postcodes.io',
    }
  } catch {
    return { error: 'Unable to lookup postcode. Please enter the address manually.' }
  }
}

export async function lookupPostcode(
  rawPostcode: string
): Promise<PostcodeLookupResult | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const rl = await rateLimit(supabase, `postcode:${user.id}`, 60, 60_000, {
    failOpen: true,
  })
  if (!rl.allowed) {
    return { error: 'Postcode lookup is busy. Please slow down and try again.' }
  }

  const postcode = formatPostcode(rawPostcode)
  if (!postcode) {
    return { error: 'Please enter a postcode' }
  }

  const normalized = normalizePostcode(postcode)
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(normalized.replace(/\s+/g, ' ').trim())) {
    const compact = compactPostcode(normalized)
    if (compact.length < 5) {
      return { error: 'Please enter a full UK postcode' }
    }
  }

  const creds = await getGoAddressCredentials()

  if (creds.hasStoredCiphertext && creds.decryptFailed && !creds.token) {
    const msg =
      'GoAddress token is stored but cannot be decrypted. On Vercel you need AI_DESIGNER_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) set to the same value used when the token was saved. Then re-save the token in Settings → Integrations.'
    logGoAddressStatus('lookup blocked: decrypt failed', { userFacing: msg })
    return { error: msg }
  }

  if (creds.token) {
    const goAddressResult = await lookupGoAddress(normalized, creds.token)
    if (!('error' in goAddressResult)) {
      if ((goAddressResult.suggestions?.length ?? 0) === 0) {
        const msg =
          'GoAddress returned no address list for this postcode. Enter the address manually below.'
        logGoAddressStatus('lookup empty suggestions', {
          postcode: normalized,
          userFacing: msg,
        })
        return { error: msg }
      }
      console.info(
        `[goaddress] lookup ok postcode=${normalized} suggestions=${goAddressResult.suggestions?.length ?? 0}`,
      )
      return goAddressResult
    }
    if ('auth' in goAddressResult && goAddressResult.auth) {
      logGoAddressStatus('lookup auth failed (401/403)', {
        postcode: normalized,
        userFacing: goAddressResult.error,
      })
      return { error: goAddressResult.error }
    }
    logGoAddressStatus('lookup soft-fail, trying postcodes.io', {
      postcode: normalized,
      goAddressError: goAddressResult.error,
    })
    const fallback = await lookupPostcodesIO(normalized)
    if (!('error' in fallback)) {
      return {
        ...fallback,
        suggestions: [],
        provider: 'postcodes.io',
        softError: goAddressResult.error,
      }
    }
    return { error: goAddressResult.error }
  }

  const free = await lookupPostcodesIO(normalized)
  if (!('error' in free)) {
    const soft =
      'GoAddress is not configured. Add your token in Settings → Integrations (needs AI_DESIGNER_KEY_ENCRYPTION_KEY on the server) for full address suggestions.'
    logGoAddressStatus('lookup using postcodes.io only (no goaddress token)', {
      postcode: normalized,
      softError: soft,
    })
    return {
      ...free,
      softError: soft,
    }
  }
  return free
}

export interface GoAddressDiagnostics {
  ok: boolean
  message: string
  details: {
    encryptionKeyConfigured: boolean
    hasStoredCiphertext: boolean
    decryptOk: boolean
    envTokenConfigured: boolean
    tokenSource: 'database' | 'environment' | 'none'
    apiStatus: number | null
    suggestionCount: number | null
    remainingToday: number | null
    sampleLabel: string | null
  }
}

/**
 * Admin-only live check: decrypt the stored token (if any) and call GoAddress
 * with a known UK postcode. Never returns the token itself.
 */
export async function testGoAddressConnection(
  samplePostcode = 'SW1A 1AA'
): Promise<GoAddressDiagnostics> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      message: 'Not authenticated',
      details: {
        encryptionKeyConfigured: false,
        hasStoredCiphertext: false,
        decryptOk: false,
        envTokenConfigured: false,
        tokenSource: 'none',
        apiStatus: null,
        suggestionCount: null,
        remainingToday: null,
        sampleLabel: null,
      },
    }
  }

  const { hasEncryptionKeyConfigured } = await import('@/lib/encryption/api-keys')
  const { isAdminUser } = await import('@/lib/supabase/access')
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) {
    return {
      ok: false,
      message: 'Admin only',
      details: {
        encryptionKeyConfigured: hasEncryptionKeyConfigured(),
        hasStoredCiphertext: false,
        decryptOk: false,
        envTokenConfigured: false,
        tokenSource: 'none',
        apiStatus: null,
        suggestionCount: null,
        remainingToday: null,
        sampleLabel: null,
      },
    }
  }

  cachedGoAddressToken = null
  const creds = await getGoAddressCredentials()
  const envTokenRaw = process.env.GOADDRESS_TOKEN
    ? normalizeGoAddressToken(process.env.GOADDRESS_TOKEN)
    : null
  const envTokenConfigured = Boolean(envTokenRaw && !isPlaceholderToken(envTokenRaw))

  const tokenSource: GoAddressDiagnostics['details']['tokenSource'] = creds.token
    ? creds.hasStoredCiphertext && !creds.decryptFailed
      ? 'database'
      : envTokenConfigured && creds.token === envTokenRaw
        ? 'environment'
        : creds.hasStoredCiphertext
          ? 'database'
          : envTokenConfigured
            ? 'environment'
            : 'none'
    : 'none'

  const baseDetails = {
    encryptionKeyConfigured: hasEncryptionKeyConfigured(),
    hasStoredCiphertext: creds.hasStoredCiphertext,
    decryptOk: creds.hasStoredCiphertext ? !creds.decryptFailed : false,
    envTokenConfigured,
    tokenSource,
    apiStatus: null as number | null,
    suggestionCount: null as number | null,
    remainingToday: null as number | null,
    sampleLabel: null as string | null,
  }

  const encStatus = getEncryptionEnvStatus()
  console.error(
    '[goaddress] Test connection diagnostics\n' +
      `  ENCRYPTION_KEY: ${encStatus.ENCRYPTION_KEY ? 'SET' : 'MISSING'}\n` +
      `  ENCRYPTION_KEY_PREVIOUS: ${encStatus.ENCRYPTION_KEY_PREVIOUS ? 'SET' : 'MISSING'}\n` +
      `  AI_DESIGNER_KEY_ENCRYPTION_KEY: ${encStatus.AI_DESIGNER_KEY_ENCRYPTION_KEY ? 'SET' : 'MISSING'}\n` +
      `  writeKeyName: ${encStatus.writeKeyName ?? 'NONE'}\n` +
      `  hasStoredCiphertext: ${creds.hasStoredCiphertext}\n` +
      `  decryptFailed: ${creds.decryptFailed}\n` +
      `  token present: ${Boolean(creds.token)}\n` +
      `  env GOADDRESS_TOKEN: ${baseDetails.envTokenConfigured ? 'SET' : 'MISSING/PLACEHOLDER'}`,
  )

  if (!hasEncryptionKeyConfigured() && creds.hasStoredCiphertext) {
    return {
      ok: false,
      message:
        'No encryption passphrase on the server. Set AI_DESIGNER_KEY_ENCRYPTION_KEY in Vercel (this project already uses that name), redeploy, then re-save the GoAddress token in Settings.',
      details: baseDetails,
    }
  }

  if (creds.hasStoredCiphertext && creds.decryptFailed && !creds.token) {
    return {
      ok: false,
      message:
        'A GoAddress token is saved but cannot be decrypted with AI_DESIGNER_KEY_ENCRYPTION_KEY / ENCRYPTION_KEY. The env value may have changed. Paste the token again in Settings and Save (re-encrypts with the current key).',
      details: baseDetails,
    }
  }

  if (!creds.token) {
    return {
      ok: false,
      message:
        'No GoAddress token available. Paste your token in Settings → Integrations and Save, or set GOADDRESS_TOKEN in Vercel.',
      details: baseDetails,
    }
  }

  const normalized = normalizePostcode(formatPostcode(samplePostcode))
  const pathPostcode = compactPostcode(normalized)

  try {
    const response = await fetch(
      `https://portal.goaddress.io/api/address/${encodeURIComponent(pathPostcode)}`,
      {
        headers: {
          Authorization: `Bearer ${creds.token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      }
    )

    baseDetails.apiStatus = response.status
    const body: unknown = await response.json().catch(() => null)
    const root =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message:
          'GoAddress rejected the token (401/403). Generate a new token at portal.goaddress.io, paste it in Settings (without the word Bearer), and Save.',
        details: baseDetails,
      }
    }

    if (!response.ok) {
      const msg =
        root && typeof root.message === 'string'
          ? root.message
          : `GoAddress HTTP ${response.status}`
      return { ok: false, message: msg, details: baseDetails }
    }

    const mapped = mapGoAddressPayload(body, normalized)
    if ('error' in mapped) {
      return {
        ok: false,
        message: mapped.error,
        details: {
          ...baseDetails,
          remainingToday:
            root && typeof root.remaining_today === 'number' ? root.remaining_today : null,
        },
      }
    }

    const count = mapped.suggestions?.length ?? 0
    baseDetails.suggestionCount = count
    baseDetails.remainingToday =
      root && typeof root.remaining_today === 'number' ? root.remaining_today : null
    baseDetails.sampleLabel = mapped.suggestions?.[0]?.label ?? null

    if (count === 0) {
      return {
        ok: false,
        message: 'API responded OK but returned zero address suggestions for the test postcode.',
        details: baseDetails,
      }
    }

    return {
      ok: true,
      message: `GoAddress OK - ${count} address(es) for ${normalized}. Token source: ${tokenSource}.${
        baseDetails.remainingToday != null
          ? ` Remaining today: ${baseDetails.remainingToday}.`
          : ''
      }`,
      details: baseDetails,
    }
  } catch (err) {
    console.error('[goaddress] test connection failed:', err)
    return {
      ok: false,
      message: 'Could not reach portal.goaddress.io from the server.',
      details: baseDetails,
    }
  }
}
