import { describe, it, expect } from 'vitest'
import {
  parseDiscountInput,
  parseOrderDiscountInput,
  sanitizeDiscountString,
  formatDiscountLabel,
  buildLinePreview,
  toRowColumns,
  fromRowColumns,
} from './discount'

describe('parseDiscountInput — empty cases', () => {
  it('returns empty for an empty string', () => {
    expect(parseDiscountInput('')).toEqual({ kind: 'empty' })
  })

  it('returns empty for whitespace only', () => {
    expect(parseDiscountInput('   ')).toEqual({ kind: 'empty' })
  })

  it('returns empty for a bare £', () => {
    expect(parseDiscountInput('£')).toEqual({ kind: 'empty' })
  })
})

describe('parseDiscountInput — amount cases', () => {
  it('parses "5" as £5 in pence', () => {
    expect(parseDiscountInput('5')).toEqual({ kind: 'amount', valuePence: 500 })
  })

  it('parses "£5" as £5 in pence', () => {
    expect(parseDiscountInput('£5')).toEqual({ kind: 'amount', valuePence: 500 })
  })

  it('parses "5£" as £5 in pence', () => {
    expect(parseDiscountInput('5£')).toEqual({ kind: 'amount', valuePence: 500 })
  })

  it('parses "£50.00" as £50 in pence', () => {
    expect(parseDiscountInput('£50.00')).toEqual({ kind: 'amount', valuePence: 5000 })
  })

  it('parses "10.50" (no £) as £10.50 in pence', () => {
    expect(parseDiscountInput('10.50')).toEqual({ kind: 'amount', valuePence: 1050 })
  })

  it('parses "£  5  " (whitespace) as £5', () => {
    expect(parseDiscountInput('£  5  ')).toEqual({ kind: 'amount', valuePence: 500 })
  })

  it('parses "0" as zero amount (treated as empty by form)', () => {
    // 0 is valid syntactic input — caller can decide to treat as empty.
    expect(parseDiscountInput('0')).toEqual({ kind: 'amount', valuePence: 0 })
  })
})

describe('parseDiscountInput — percent cases', () => {
  it('parses "10%" as 10', () => {
    expect(parseDiscountInput('10%')).toEqual({ kind: 'percent', value: 10 })
  })

  it('parses "10 %" (space) as 10', () => {
    expect(parseDiscountInput('10 %')).toEqual({ kind: 'percent', value: 10 })
  })

  it('parses "10.5%" as 10.5', () => {
    expect(parseDiscountInput('10.5%')).toEqual({ kind: 'percent', value: 10.5 })
  })

  it('parses "100%" as 100 (boundary)', () => {
    expect(parseDiscountInput('100%')).toEqual({ kind: 'percent', value: 100 })
  })

  it('rejects "0%"', () => {
    const result = parseDiscountInput('0%')
    expect(result.kind).toBe('invalid')
  })

  it('rejects amount greater than max (product cost)', () => {
    const result = parseDiscountInput('£12', { maxAmountPence: 1000 })
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.error).toMatch(/cannot be greater than the cost/i)
    }
  })

  it('accepts amount equal to max (product cost)', () => {
    expect(parseDiscountInput('£10', { maxAmountPence: 1000 })).toEqual({
      kind: 'amount',
      valuePence: 1000,
    })
  })

  it('rejects "101%" (above range)', () => {
    const result = parseDiscountInput('101%')
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.error).toMatch(/100%/)
    }
  })
})

describe('parseDiscountInput — invalid cases', () => {
  it('rejects letters', () => {
    const result = parseDiscountInput('abc')
    expect(result.kind).toBe('invalid')
  })

  it('rejects "10.5" treated as percent (it parses as amount — both are valid)', () => {
    // "10.5" matches the amount shape — nothing invalid about that.
    expect(parseDiscountInput('10.5')).toEqual({ kind: 'amount', valuePence: 1050 })
  })

  it('rejects mixed £ and %', () => {
    const result = parseDiscountInput('£10%')
    expect(result.kind).toBe('invalid')
  })
})

describe('parseOrderDiscountInput — same parser, called via alias', () => {
  it('parses amount', () => {
    expect(parseOrderDiscountInput('25')).toEqual({ kind: 'amount', valuePence: 2500 })
  })

  it('parses percent', () => {
    expect(parseOrderDiscountInput('5%')).toEqual({ kind: 'percent', value: 5 })
  })

  it('handles empty', () => {
    expect(parseOrderDiscountInput('')).toEqual({ kind: 'empty' })
  })
})

describe('sanitizeDiscountString', () => {
  it('keeps digits, . space £ %', () => {
    expect(sanitizeDiscountString('£10.5 %')).toBe('£10.5 %')
  })

  it('strips letters', () => {
    expect(sanitizeDiscountString('abc£10def%')).toBe('£10%')
  })

  it('strips commas and other punctuation', () => {
    expect(sanitizeDiscountString('1,000.00')).toBe('1000.00')
  })

  it('keeps the result of a percent input', () => {
    expect(sanitizeDiscountString(' 10% ')).toBe(' 10% ')
  })
})

describe('formatDiscountLabel', () => {
  it('formats an amount with a leading minus', () => {
    expect(formatDiscountLabel({ kind: 'amount', valuePence: 5000 }, '£50')).toBe('−£50.00')
  })

  it('formats a percent with a leading minus', () => {
    expect(formatDiscountLabel({ kind: 'percent', value: 10 }, '10%')).toBe('−10%')
  })

  it('formats a fractional percent without trailing zeros', () => {
    expect(formatDiscountLabel({ kind: 'percent', value: 12.5 }, '12.5%')).toBe('−12.5%')
  })

  it('falls back to raw input for empty/invalid (lets caller decide)', () => {
    expect(formatDiscountLabel({ kind: 'empty' }, '')).toBe('')
    expect(formatDiscountLabel({ kind: 'invalid', error: 'x' }, 'abc')).toBe('abc')
  })
})

describe('buildLinePreview', () => {
  it('renders per-unit preview for amount kind', () => {
    // Line net = £50 (qty 10 × £5), amount = £0.50/unit, total £5
    const parsed = { kind: 'amount', valuePence: 50 } as const
    expect(buildLinePreview(parsed, 10, 5000)).toBe('−£0.50/unit × 10 = −£5.00')
  })

  it('renders percent preview', () => {
    const parsed = { kind: 'percent', value: 10 } as const
    expect(buildLinePreview(parsed, 5, 5000)).toBe('−10% (−£5.00)')
  })

  it('caps total at line net for amount kind', () => {
    // amount = £100/unit, line net = £5 — total clamps to line net
    const parsed = { kind: 'amount', valuePence: 10000 } as const
    expect(buildLinePreview(parsed, 1, 500)).toBe('−£100.00/unit × 1 = −£5.00')
  })

  it('returns null for empty/invalid', () => {
    expect(buildLinePreview({ kind: 'empty' }, 1, 500)).toBeNull()
    expect(buildLinePreview({ kind: 'invalid', error: 'x' }, 1, 500)).toBeNull()
  })

  it('returns null when quantity is 0', () => {
    expect(
      buildLinePreview({ kind: 'amount', valuePence: 50 }, 0, 500),
    ).toBeNull()
  })
})

describe('toRowColumns / fromRowColumns roundtrip', () => {
  it('amount → row columns', () => {
    expect(toRowColumns({ kind: 'amount', valuePence: 5000 })).toEqual({
      discountAmount: 50,
      discountPercent: null,
    })
  })

  it('percent → row columns', () => {
    expect(toRowColumns({ kind: 'percent', value: 10 })).toEqual({
      discountAmount: null,
      discountPercent: 10,
    })
  })

  it('empty → row columns', () => {
    expect(toRowColumns({ kind: 'empty' })).toEqual({
      discountAmount: null,
      discountPercent: null,
    })
  })

  it('roundtrips amount', () => {
    const original = { kind: 'amount' as const, valuePence: 1250 }
    const columns = toRowColumns(original)
    expect(fromRowColumns(columns.discountAmount, columns.discountPercent)).toEqual(original)
  })

  it('roundtrips percent', () => {
    const original = { kind: 'percent' as const, value: 12.5 }
    const columns = toRowColumns(original)
    expect(fromRowColumns(columns.discountAmount, columns.discountPercent)).toEqual(original)
  })

  it('handles both NULL (no discount) on read', () => {
    expect(fromRowColumns(null, null)).toEqual({ kind: 'empty' })
  })

  it('amount wins on read when both columns are non-null (DB CHECK prevents this, but be defensive)', () => {
    expect(fromRowColumns(50, 10)).toEqual({ kind: 'amount', valuePence: 5000 })
  })
})
