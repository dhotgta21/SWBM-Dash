import { afterEach, describe, expect, it } from 'vitest'
import {
  DEMO_COMPANY_NAME,
  PRODUCTION_COMPANY_NAME,
  getDefaultCompanyName,
  getDefaultShortName,
  isDemoMode,
  useStarHawkWordmark,
} from './brand'

const keys = [
  'NEXT_PUBLIC_DEMO_MODE',
  'DEMO_MODE',
  'NEXT_PUBLIC_DEMO_VERTICAL',
  'DEMO_VERTICAL',
] as const

afterEach(() => {
  for (const k of keys) delete process.env[k]
})

describe('demo brand', () => {
  it('defaults to production Star Hawk when demo mode is off', () => {
    expect(isDemoMode()).toBe(false)
    expect(getDefaultCompanyName()).toBe(PRODUCTION_COMPANY_NAME)
    expect(getDefaultShortName()).toBe('Star Hawk')
    expect(useStarHawkWordmark(null)).toBe(true)
    expect(useStarHawkWordmark(PRODUCTION_COMPANY_NAME)).toBe(true)
  })

  it('switches to Demo Builder Merchant when NEXT_PUBLIC_DEMO_MODE=true', () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = 'true'
    expect(isDemoMode()).toBe(true)
    expect(getDefaultCompanyName()).toBe(DEMO_COMPANY_NAME)
    expect(getDefaultShortName()).toBe('Demo BM')
    expect(useStarHawkWordmark(null)).toBe(false)
    expect(useStarHawkWordmark(DEMO_COMPANY_NAME)).toBe(false)
  })
})
