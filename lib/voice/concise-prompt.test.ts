import { describe, it, expect } from 'vitest'
import { extractConciseHead } from './concise-prompt'

describe('extractConciseHead', () => {
  it('strips "I found" prefix from verbose LLM messages', () => {
    expect(extractConciseHead('I found Shinda Singh. Is this the right client?')).toBe(
      'Shinda Singh'
    )
  })

  it('strips "Is it" prefix', () => {
    expect(extractConciseHead('Is it Apex Builders Ltd?')).toBe('Apex Builders Ltd')
  })

  it('strips "Right, so" prefix and trailing "yes"', () => {
    expect(extractConciseHead('Right, so 30 bags of cement, yes?')).toBe('30 bags of cement')
  })

  it('caps long text with ellipsis', () => {
    const out = extractConciseHead('a'.repeat(80))
    expect(out?.endsWith('…')).toBe(true)
    expect(out?.length).toBeLessThanOrEqual(37)
  })

  it('returns null for empty / undefined', () => {
    expect(extractConciseHead(undefined)).toBe(null)
    expect(extractConciseHead('')).toBe(null)
    expect(extractConciseHead(null)).toBe(null)
  })

  it('takes only the first sentence of multi-line content', () => {
    expect(extractConciseHead('First line here. Second line ignored.')).toBe('First line here')
  })

  it('drops trailing question marks from the head', () => {
    expect(extractConciseHead('I found Apex. Is it Apex?')).toBe('Apex')
  })

  it('strips inline ** markdown markers anywhere in the line', () => {
    // The bold marks around "Bold lead" are stripped, leaving the rest of
    // the sentence intact — this is the desired behaviour for any heading
    // or bolded term the LLM emits.
    expect(extractConciseHead('**Bold lead** Cement 30 bags?')).toBe('Bold lead Cement 30 bags')
  })
})
