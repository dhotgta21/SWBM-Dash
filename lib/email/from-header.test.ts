import { describe, it, expect } from 'vitest'
import { buildEmailFromHeader } from './from-header'

describe('buildEmailFromHeader', () => {
  it('returns error when envFrom is empty', () => {
    const result = buildEmailFromHeader('', 'Star Hawk')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('RESEND_FROM_ADDRESS is not set')
    }
  })

  it('returns error when envFrom is undefined', () => {
    const result = buildEmailFromHeader(undefined, 'Star Hawk')
    expect(result.ok).toBe(false)
  })

  it('wraps a plain email with the friendly name', () => {
    const result = buildEmailFromHeader('noreply@starhawkbm.com', 'Star Hawk Builders Merchant')
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk Builders Merchant <noreply@starhawkbm.com>',
    })
  })

  it('uses just the email when no friendly name is provided', () => {
    const result = buildEmailFromHeader('noreply@starhawkbm.com', null)
    expect(result).toEqual({
      ok: true,
      fromHeader: 'noreply@starhawkbm.com',
    })
  })

  it('preserves an already-formatted Name <email> value', () => {
    const result = buildEmailFromHeader('Star Hawk <noreply@starhawkbm.com>', 'Ignored')
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk <noreply@starhawkbm.com>',
    })
  })

  it('strips surrounding quotes from an already-formatted display name', () => {
    const result = buildEmailFromHeader('"Star Hawk" <noreply@starhawkbm.com>', 'Ignored')
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk <noreply@starhawkbm.com>',
    })
  })

  it('quotes display names containing commas', () => {
    const result = buildEmailFromHeader('noreply@starhawkbm.com', 'Star Hawk Builders Merchant, Ltd')
    expect(result).toEqual({
      ok: true,
      fromHeader: '"Star Hawk Builders Merchant, Ltd" <noreply@starhawkbm.com>',
    })
  })

  it('quotes display names containing angle brackets', () => {
    const result = buildEmailFromHeader('noreply@starhawkbm.com', 'Star Hawk <Team>')
    expect(result).toEqual({
      ok: true,
      fromHeader: '"Star Hawk <Team>" <noreply@starhawkbm.com>',
    })
  })

  it('returns error for a malformed email', () => {
    const result = buildEmailFromHeader('not-an-email', 'Star Hawk')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid RESEND_FROM_ADDRESS')
    }
  })

  it('returns error for a missing email inside brackets', () => {
    const result = buildEmailFromHeader('Star Hawk <>', 'Star Hawk')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid email address in RESEND_FROM_ADDRESS')
    }
  })

  it('returns error for a malformed email inside brackets', () => {
    const result = buildEmailFromHeader('Star Hawk <not-an-email>', 'Star Hawk')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid email address in RESEND_FROM_ADDRESS')
    }
  })

  it('trims whitespace from inputs', () => {
    const result = buildEmailFromHeader('  noreply@starhawkbm.com  ', '  Star Hawk  ')
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk <noreply@starhawkbm.com>',
    })
  })

  it('strips surrounding quotes from the whole value', () => {
    const result = buildEmailFromHeader(
      '"Star Hawk Builders Merchants <noreply@starhawkbm.com>"',
      'Ignored',
    )
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk Builders Merchants <noreply@starhawkbm.com>',
    })
  })

  it('strips surrounding quotes from a plain email', () => {
    const result = buildEmailFromHeader('"noreply@starhawkbm.com"', 'Star Hawk')
    expect(result).toEqual({
      ok: true,
      fromHeader: 'Star Hawk <noreply@starhawkbm.com>',
    })
  })
})
