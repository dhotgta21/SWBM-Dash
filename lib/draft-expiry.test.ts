import { describe, expect, it } from 'vitest'
import {
  DRAFT_DELETE_DAYS,
  DRAFT_HARD_WARN_DAYS,
  DRAFT_WARN_DAYS,
  getDraftExpiryInfo,
} from './draft-expiry'

const NOW = new Date('2026-07-12T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('draft expiry thresholds', () => {
  it('uses the agreed 2 / 4 / 6 day thresholds', () => {
    expect(DRAFT_WARN_DAYS).toBe(2)
    expect(DRAFT_HARD_WARN_DAYS).toBe(4)
    expect(DRAFT_DELETE_DAYS).toBe(6)
  })
})

describe('getDraftExpiryInfo', () => {
  it('shows no warning for a fresh draft', () => {
    const info = getDraftExpiryInfo(daysAgo(1), NOW)
    expect(info.level).toBe('none')
    expect(info.daysLeft).toBe(5)
  })

  it('warns from day 2', () => {
    const info = getDraftExpiryInfo(daysAgo(2), NOW)
    expect(info.level).toBe('warn')
    expect(info.daysLeft).toBe(4)
  })

  it('still a soft warning on day 3', () => {
    expect(getDraftExpiryInfo(daysAgo(3), NOW).level).toBe('warn')
  })

  it('escalates to a hard warning from day 4', () => {
    const info = getDraftExpiryInfo(daysAgo(4), NOW)
    expect(info.level).toBe('hard')
    expect(info.daysLeft).toBe(2)
  })

  it('hard warning on day 5 with one day left', () => {
    const info = getDraftExpiryInfo(daysAgo(5), NOW)
    expect(info.level).toBe('hard')
    expect(info.daysLeft).toBe(1)
  })

  it('never reports negative days left once past the delete day', () => {
    const info = getDraftExpiryInfo(daysAgo(7), NOW)
    expect(info.level).toBe('hard')
    expect(info.daysLeft).toBe(0)
  })

  it('accepts Date objects as well as strings', () => {
    const info = getDraftExpiryInfo(new Date(daysAgo(2)), NOW)
    expect(info.level).toBe('warn')
  })
})
