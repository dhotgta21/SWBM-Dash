import { randomBytes, pbkdf2, timingSafeEqual } from 'crypto'

// Omit visually ambiguous characters.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PASSWORD_LENGTH = 8
const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_LENGTH = 32
const DIGEST = 'sha256'

/**
 * Generate a human-friendly random password for a protected share link.
 */
export function generateSharePassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH)
  let password = ''
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length]
  }
  return password
}

function pbkdf2Promise(
  password: string,
  salt: string,
  iterations: number,
  keylen: number,
  digest: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, keylen, digest, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })
}

/**
 * Hash a share password with PBKDF2. Returns "salt:hash" (both base64url).
 */
export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('base64url')
  const hash = await pbkdf2Promise(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST)
  return `${salt}:${hash.toString('base64url')}`
}

/**
 * Verify a candidate password against a stored "salt:hash" value.
 * Uses a constant-time comparison.
 */
export async function verifySharePassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false

  let expected: Buffer
  try {
    expected = Buffer.from(hash, 'base64url')
  } catch {
    return false
  }

  try {
    const actual = await pbkdf2Promise(password, salt, PBKDF2_ITERATIONS, expected.length, DIGEST)
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
