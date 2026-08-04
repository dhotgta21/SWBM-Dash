import { describe, it, expect } from 'vitest'
import {
  sanitizeLikeTerm,
  sanitizeRegexTerm,
  buildProductSearchFilter,
  buildSmartProductSearchFilter,
  buildClientSearchFilter,
  extractProductSearchTerms,
  productMatchesSearch,
  clientMatchesSearch,
} from './search'

describe('sanitizeLikeTerm', () => {
  it('escapes wildcard and escape characters', () => {
    expect(sanitizeLikeTerm('100%')).toBe('100\\%')
    expect(sanitizeLikeTerm('under_score')).toBe('under\\_score')
    expect(sanitizeLikeTerm('a\\b')).toBe('a\\\\b')
  })

  it('removes characters that break PostgREST .or() filter strings', () => {
    expect(sanitizeLikeTerm('a,b')).toBe('ab')
    expect(sanitizeLikeTerm('(foo)')).toBe('foo')
  })

  it('trims whitespace', () => {
    expect(sanitizeLikeTerm('  hello  ')).toBe('hello')
  })
})

describe('sanitizeRegexTerm', () => {
  it('escapes regex metacharacters', () => {
    expect(sanitizeRegexTerm('a.b')).toBe('a\\.b')
    expect(sanitizeRegexTerm('c*d')).toBe('c\\*d')
    expect(sanitizeRegexTerm('e+f')).toBe('e\\+f')
    expect(sanitizeRegexTerm('g?h')).toBe('g\\?h')
  })

  it('removes commas', () => {
    expect(sanitizeRegexTerm('a,b')).toBe('ab')
  })
})

describe('buildProductSearchFilter', () => {
  it('builds a word-prefix filter for names and a prefix filter for codes', () => {
    const filter = buildProductSearchFilter('Shi')
    expect(filter).toContain('name.imatch.^Shi')
    expect(filter).toContain('name.imatch.[[:space:][:punct:]]Shi')
    expect(filter).toContain('code.ilike.%Shi%')
  })

  it('escapes regex metacharacters in the search term', () => {
    const filter = buildProductSearchFilter('6x4')
    expect(filter).toContain('name.imatch.^6x4')
  })

  it('returns empty string for an empty or fully-sanitised term', () => {
    expect(buildProductSearchFilter('')).toBe('')
    expect(buildProductSearchFilter('   ')).toBe('')
    expect(buildProductSearchFilter(',')).toBe('')
  })

  it('requires every whitespace-separated token to match', () => {
    const filter = buildProductSearchFilter('30mm gravel')
    expect(filter.startsWith('and(')).toBe(true)
    expect(filter).toContain('name.imatch.^30mm')
    expect(filter).toContain('name.imatch.[[:space:][:punct:]]30mm')
    expect(filter).toContain('name.imatch.^gravel')
    expect(filter).toContain('code.ilike.%30mm%')
    expect(filter).toContain('code.ilike.%gravel%')
  })

})

describe('buildClientSearchFilter', () => {
  it('uses prefix matching for names and company, substring for contacts', () => {
    const filter = buildClientSearchFilter('Smi')
    expect(filter).toContain('first_name.ilike.Smi%')
    expect(filter).toContain('last_name.ilike.Smi%')
    expect(filter).toContain('company_name.ilike.Smi%')
    expect(filter).toContain('account_number.ilike.%Smi%')
    expect(filter).toContain('phone.ilike.%Smi%')
    expect(filter).toContain('email.ilike.%Smi%')
  })
})

describe('extractProductSearchTerms', () => {
  it('strips quantities, units and stop words', () => {
    expect(extractProductSearchTerms('50 bags of gravel')).toEqual(['gravel'])
    expect(extractProductSearchTerms('T 30 gravel 50')).toEqual(['gravel'])
    expect(extractProductSearchTerms('I need 100 bricks please')).toEqual(['bricks'])
  })

  it('keeps size descriptors and product codes', () => {
    expect(extractProductSearchTerms('20mm shingle')).toEqual(['20mm', 'shingle'])
    expect(extractProductSearchTerms('6x4 lintel')).toEqual(['6x4', 'lintel'])
  })

  it('returns empty array for queries with no usable terms', () => {
    expect(extractProductSearchTerms('50 bags of the')).toEqual([])
    expect(extractProductSearchTerms('')).toEqual([])
  })
})

describe('buildSmartProductSearchFilter', () => {
  it('builds an AND of ORs across product fields', () => {
    const filter = buildSmartProductSearchFilter(['gravel', '20mm'])
    expect(filter).toContain('or(name.ilike.%gravel%,code.ilike.%gravel%,category.ilike.%gravel%,description.ilike.%gravel%,brand.ilike.%gravel%)')
    expect(filter).toContain('or(name.ilike.%20mm%,code.ilike.%20mm%,category.ilike.%20mm%,description.ilike.%20mm%,brand.ilike.%20mm%)')
    expect(filter.startsWith('and(')).toBe(true)
  })

  it('returns empty string when no terms are provided', () => {
    expect(buildSmartProductSearchFilter([])).toBe('')
    expect(buildSmartProductSearchFilter(['', '   '])).toBe('')
  })
})

describe('productMatchesSearch', () => {
  const product = { name: '10 mm Shingle', code: 'SHI-001' }

  it('matches the start of the product name', () => {
    expect(productMatchesSearch(product, '10')).toBe(true)
    expect(productMatchesSearch(product, '10 mm')).toBe(true)
  })

  it('matches a word in the middle of the product name', () => {
    expect(productMatchesSearch(product, 'Shi')).toBe(true)
    expect(productMatchesSearch(product, 'shi')).toBe(true)
  })

  it('matches a product code fragment', () => {
    expect(productMatchesSearch(product, 'SHI')).toBe(true)
    expect(productMatchesSearch(product, 'shi')).toBe(true)
    expect(productMatchesSearch(product, '001')).toBe(true)
  })

  it('does not match fragments that are not at a word boundary', () => {
    expect(productMatchesSearch(product, 'ingle')).toBe(false)
  })

  it('returns true for an empty query', () => {
    expect(productMatchesSearch(product, '')).toBe(true)
    expect(productMatchesSearch(product, '   ')).toBe(true)
  })

  it('requires all whitespace-separated tokens to match', () => {
    expect(productMatchesSearch(product, '10 mm')).toBe(true)
    expect(productMatchesSearch(product, '10 Shi')).toBe(true)
    expect(productMatchesSearch(product, 'mm Shi')).toBe(true)
    expect(productMatchesSearch(product, '10 xyz')).toBe(false)
    expect(productMatchesSearch(product, 'xyz Shi')).toBe(false)
  })
})

describe('clientMatchesSearch', () => {
  const client = {
    first_name: 'John',
    last_name: 'Smith',
    company_name: 'Smith & Sons Ltd',
    account_number: 'ACC-12345',
    phone: '07123 456789',
    email: 'john.smith@example.com',
  }

  it('matches name/company prefixes', () => {
    expect(clientMatchesSearch(client, 'Joh')).toBe(true)
    expect(clientMatchesSearch(client, 'Smi')).toBe(true)
    expect(clientMatchesSearch(client, 'smith &')).toBe(true)
  })

  it('matches fragments of account, phone and email', () => {
    expect(clientMatchesSearch(client, '12345')).toBe(true)
    expect(clientMatchesSearch(client, '456789')).toBe(true)
    expect(clientMatchesSearch(client, 'example.com')).toBe(true)
  })

  it('matches fragments in email/phone/account even when they are not name prefixes', () => {
    expect(clientMatchesSearch(client, 'mith')).toBe(true) // inside smith@example.com
    expect(clientMatchesSearch(client, '12345')).toBe(true) // account/phone
  })

  it('returns false when the term appears nowhere', () => {
    expect(clientMatchesSearch(client, 'xyz')).toBe(false)
  })
})
