import { randomBytes } from 'crypto'

/**
 * Regex for the opaque share key used in public URLs.
 * 12 random bytes encoded with base64url = 16 URL-safe characters.
 */
export const SHARE_KEY_RE = /^[A-Za-z0-9_-]{16}$/

/**
 * Regex for the legacy share token stored in invoices.share_token.
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Generate a new opaque, URL-safe share key.
 */
export function generateShareKey(): string {
  return randomBytes(12).toString('base64url')
}

/**
 * True if the value looks like the legacy UUID share_token.
 */
export function isLegacyShareToken(value: string): boolean {
  return UUID_RE.test(value)
}

/**
 * True if the value looks like an opaque share key.
 */
export function isShareKey(value: string): boolean {
  return SHARE_KEY_RE.test(value)
}
