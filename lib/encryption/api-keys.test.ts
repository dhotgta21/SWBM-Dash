import { randomBytes } from 'crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  encryptApiKey,
  decryptApiKey,
  isEncryptedApiKey,
} from './api-keys'

describe('API key encryption', () => {
  const originalPrimary = process.env.ENCRYPTION_KEY
  const originalLegacy = process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY
  const testPassword = randomBytes(32).toString('hex')
  const rotatedPassword = randomBytes(32).toString('hex')

  beforeAll(() => {
    delete process.env.ENCRYPTION_KEY
    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = testPassword
  })

  afterAll(() => {
    if (originalPrimary === undefined) {
      delete process.env.ENCRYPTION_KEY
    } else {
      process.env.ENCRYPTION_KEY = originalPrimary
    }
    if (originalLegacy === undefined) {
      delete process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY
    } else {
      process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = originalLegacy
    }
  })

  it('encrypts and decrypts a secret', () => {
    const plaintext = `sk-test${randomBytes(16).toString('hex')}`
    const encrypted = encryptSecret(plaintext)

    expect(encrypted).not.toBe(plaintext)
    expect(encrypted.split(':')).toHaveLength(4)
    expect(isEncryptedSecret(encrypted)).toBe(true)

    const decrypted = decryptSecret(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('produces different ciphertexts for the same plaintext', () => {
    const plaintext = 'sk-test-same-value'
    const a = encryptSecret(plaintext)
    const b = encryptSecret(plaintext)

    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe(plaintext)
    expect(decryptSecret(b)).toBe(plaintext)
  })

  it('returns null for malformed ciphertext', () => {
    expect(decryptSecret('not-encrypted')).toBeNull()
    expect(decryptSecret('a:b:c')).toBeNull()
    expect(decryptSecret('')).toBeNull()
    expect(decryptSecret('::::')).toBeNull()
  })

  it('detects unencrypted values', () => {
    expect(isEncryptedSecret('sk-plaintext-key')).toBe(false)
    expect(isEncryptedSecret(null)).toBe(false)
    expect(isEncryptedSecret(undefined)).toBe(false)
    expect(isEncryptedSecret('')).toBe(false)
  })

  it('returns null when the encryption key has changed since the row was written', () => {
    const plaintext = `sk-rotated${randomBytes(16).toString('hex')}`
    const encrypted = encryptSecret(plaintext)

    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = rotatedPassword
    expect(decryptSecret(encrypted)).toBeNull()

    // Restore so afterAll doesn't trip.
    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = testPassword
  })

  it('decrypts with ENCRYPTION_KEY_PREVIOUS after a primary key rotation', () => {
    process.env.ENCRYPTION_KEY = testPassword
    delete process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY
    const plaintext = `sk-prev${randomBytes(16).toString('hex')}`
    const encrypted = encryptSecret(plaintext)

    process.env.ENCRYPTION_KEY = rotatedPassword
    process.env.ENCRYPTION_KEY_PREVIOUS = testPassword
    expect(decryptSecret(encrypted)).toBe(plaintext)

    // New writes use the new primary key.
    const reencrypted = encryptSecret(plaintext)
    delete process.env.ENCRYPTION_KEY_PREVIOUS
    expect(decryptSecret(reencrypted)).toBe(plaintext)

    // Cleanup for other tests.
    delete process.env.ENCRYPTION_KEY
    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = testPassword
  })

  it('prefers ENCRYPTION_KEY for new writes but still decrypts legacy keys', () => {
    const plaintext = 'sk-primary-key'
    // Encrypt with legacy env only.
    delete process.env.ENCRYPTION_KEY
    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = testPassword
    const legacyEncrypted = encryptSecret(plaintext)

    // Primary key is now set for new writes; legacy passphrase still decrypts old rows.
    process.env.ENCRYPTION_KEY = rotatedPassword
    expect(decryptSecret(legacyEncrypted)).toBe(plaintext)

    const primaryEncrypted = encryptSecret(plaintext)
    // Primary ciphertext decrypts with ENCRYPTION_KEY alone.
    delete process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY
    expect(decryptSecret(primaryEncrypted)).toBe(plaintext)

    delete process.env.ENCRYPTION_KEY
    process.env.AI_DESIGNER_KEY_ENCRYPTION_KEY = testPassword
  })

  it('exposes backward-compatible aliases', () => {
    const plaintext = 'sk-alias-test'
    const encrypted = encryptApiKey(plaintext)
    expect(isEncryptedApiKey(encrypted)).toBe(true)
    expect(decryptApiKey(encrypted)).toBe(plaintext)
  })
})
