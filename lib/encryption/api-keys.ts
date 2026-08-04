import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 16

/**
 * Passphrases tried for encryption/decryption, in order.
 * - ENCRYPTION_KEY: preferred name for new deploys
 * - ENCRYPTION_KEY_PREVIOUS: optional previous value after a key rotation
 * - AI_DESIGNER_KEY_ENCRYPTION_KEY: supported name used by existing Vercel
 *   projects (invoice assistant era). Fully supported for both encrypt and decrypt.
 */
function listEncryptionPassphrases(): string[] {
  const keys: string[] = []
  const primary = process.env.ENCRYPTION_KEY?.trim()
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS?.trim()
  const designer = process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY?.trim()

  if (primary) keys.push(primary)
  if (previous && previous !== primary) keys.push(previous)
  if (designer && designer !== primary && designer !== previous) {
    keys.push(designer)
  }

  return keys
}

export interface EncryptionEnvStatus {
  ENCRYPTION_KEY: boolean
  ENCRYPTION_KEY_PREVIOUS: boolean
  AI_DESIGNER_KEY_ENCRYPTION_KEY: boolean
  anyKeyConfigured: boolean
  /** Env var name used for new encrypt writes (never the secret value). */
  writeKeyName: 'ENCRYPTION_KEY' | 'AI_DESIGNER_KEY_ENCRYPTION_KEY' | null
  /** How many distinct passphrases are available for decrypt attempts. */
  decryptKeyCount: number
}

/** Safe presence report for operator logs - never includes secret values. */
export function getEncryptionEnvStatus(): EncryptionEnvStatus {
  const hasPrimary = Boolean(process.env.ENCRYPTION_KEY?.trim())
  const hasPrevious = Boolean(process.env.ENCRYPTION_KEY_PREVIOUS?.trim())
  const hasDesigner = Boolean(process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY?.trim())
  const writeKeyName: EncryptionEnvStatus['writeKeyName'] = hasPrimary
    ? 'ENCRYPTION_KEY'
    : hasDesigner
      ? 'AI_DESIGNER_KEY_ENCRYPTION_KEY'
      : null

  return {
    ENCRYPTION_KEY: hasPrimary,
    ENCRYPTION_KEY_PREVIOUS: hasPrevious,
    AI_DESIGNER_KEY_ENCRYPTION_KEY: hasDesigner,
    anyKeyConfigured: hasPrimary || hasPrevious || hasDesigner,
    writeKeyName,
    decryptKeyCount: listEncryptionPassphrases().length,
  }
}

/**
 * Log a one-shot, high-visibility snapshot of encryption env presence.
 * Safe for production logs (names + booleans only).
 */
export function logEncryptionEnvStatus(context: string): EncryptionEnvStatus {
  const status = getEncryptionEnvStatus()
  console.error(
    `[encryption] ${context}\n` +
      `  ENCRYPTION_KEY set: ${status.ENCRYPTION_KEY}\n` +
      `  ENCRYPTION_KEY_PREVIOUS set: ${status.ENCRYPTION_KEY_PREVIOUS}\n` +
      `  AI_DESIGNER_KEY_ENCRYPTION_KEY set: ${status.AI_DESIGNER_KEY_ENCRYPTION_KEY}\n` +
      `  write key: ${status.writeKeyName ?? 'NONE'}\n` +
      `  decrypt candidates: ${status.decryptKeyCount}\n` +
      (status.anyKeyConfigured
        ? '  ok: at least one encryption passphrase is available'
        : '  MISSING: set AI_DESIGNER_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) in Vercel env, then re-save secrets in Settings'),
  )
  return status
}

function getEncryptionKey(): Buffer {
  const keys = listEncryptionPassphrases()
  if (keys.length === 0) {
    logEncryptionEnvStatus('encrypt/decrypt aborted - no passphrase configured')
    throw new Error(
      'No encryption passphrase configured. Set AI_DESIGNER_KEY_ENCRYPTION_KEY (or ENCRYPTION_KEY) in the server environment.',
    )
  }
  return Buffer.from(keys[0], 'utf8')
}

/**
 * Encrypt a plaintext secret for storage in the database.
 *
 * Format (colon-delimited, each segment base64url):
 *   salt:iv:authTag:ciphertext
 *
 * Salt and IV are random per encryption so the same plaintext stored twice
 * produces different ciphertexts.
 */
export function encryptSecret(plaintext: string): string {
  const password = getEncryptionKey()
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const key = scryptSync(password, salt, KEY_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    salt.toString('base64url'),
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

function decryptWithPassphrase(ciphertext: string, passphrase: string): string | null {
  try {
    const parts = ciphertext.split(':')
    if (parts.length !== 4) return null

    const [saltB64, ivB64, authTagB64, encryptedB64] = parts
    const salt = Buffer.from(saltB64, 'base64url')
    const iv = Buffer.from(ivB64, 'base64url')
    const authTag = Buffer.from(authTagB64, 'base64url')
    const encrypted = Buffer.from(encryptedB64, 'base64url')

    if (
      salt.length !== SALT_LENGTH ||
      iv.length !== IV_LENGTH ||
      authTag.length === 0 ||
      encrypted.length === 0
    ) {
      return null
    }

    const key = scryptSync(Buffer.from(passphrase, 'utf8'), salt, KEY_LENGTH)
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Decrypt a secret that was stored with encryptSecret.
 * Returns null if the ciphertext is malformed or decryption fails.
 *
 * After an ENCRYPTION_KEY rotation, set ENCRYPTION_KEY_PREVIOUS to the old
 * value so existing rows still decrypt until each secret is re-saved.
 */
export function decryptSecret(ciphertext: string): string | null {
  const status = getEncryptionEnvStatus()
  const passphrases = listEncryptionPassphrases()
  if (passphrases.length === 0) {
    logEncryptionEnvStatus('decrypt failed - no passphrase configured')
    return null
  }

  for (let i = 0; i < passphrases.length; i++) {
    const plaintext = decryptWithPassphrase(ciphertext, passphrases[i])
    if (plaintext !== null) {
      if (i > 0) {
        console.warn(
          `[encryption] decrypted with fallback passphrase #${i + 1} (not the primary write key ${status.writeKeyName}). Re-save secrets in Settings so they re-encrypt with the primary key.`,
        )
      }
      return plaintext
    }
  }

  logEncryptionEnvStatus(
    'decrypt failed - ciphertext did not match any configured passphrase (wrong/rotated key, or secret was encrypted with a different value)',
  )
  console.error(
    '[encryption] fix: re-save the secret in Settings → Integrations with the current AI_DESIGNER_KEY_ENCRYPTION_KEY / ENCRYPTION_KEY, or set ENCRYPTION_KEY_PREVIOUS to the old passphrase temporarily.',
  )
  return null
}

/**
 * Returns true if the value looks like one of our encrypted payloads.
 * Used to guard against accidental plaintext storage when reading a row.
 */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 4 && parts.every((part) => part.length > 0)
}

/**
 * Extract the last 4 characters of the encrypted blob's ciphertext segment.
 * This is a safe metadata value that can be shown to operators without
 * revealing the plaintext secret.
 */
export function extractEncryptedLast4(encrypted: string): string | null {
  const parts = encrypted.split(':')
  const tail = parts[parts.length - 1] ?? ''
  if (tail.length < 4) return tail || null
  return tail.slice(-4)
}

/**
 * True when at least one encryption passphrase is configured.
 * Used by diagnostics; never returns the passphrase itself.
 */
export function hasEncryptionKeyConfigured(): boolean {
  return listEncryptionPassphrases().length > 0
}

// ---------------------------------------------------------------------------
// Backward-compatible aliases for the original invoice-assistant helpers.
// These keep the existing DeepSeek code working without changes.
// ---------------------------------------------------------------------------
export const encryptApiKey = encryptSecret
export const decryptApiKey = decryptSecret
export const isEncryptedApiKey = isEncryptedSecret
