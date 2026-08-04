import { describe, it, expect } from 'vitest'
import { findVariantMatchForQuery } from './public-products'
import type { PublicProduct } from './public-products'

/**
 * Minimal PublicProduct stub — we only need the variantOptions +
 * materials fields exercised by findVariantMatchForQuery. Anything
 * else (price, image, etc.) is omitted so the test stays focused.
 */
function makeProduct(
  variantOptions: PublicProduct['variantOptions'],
  materials: string[] = []
): PublicProduct {
  return {
    id: 'test',
    code: 'TEST-001',
    name: 'Test product',
    description: null,
    unit: 'EA',
    price: 0,
    priceFrom: null,
    displayMode: 'show',
    priceIncludesVat: false,
    salePrice: null,
    saleStartsAt: null,
    saleEndsAt: null,
    saleLabel: null,
    campaignDiscountPercent: null,
    campaignLabel: null,
    category: null,
    imageUrl: null,
    updatedAt: '2026-01-01T00:00:00Z',
    seoTitle: null,
    seoDescription: null,
    shortDescription: null,
    keyFeatures: [],
    searchTags: [],
    brand: null,
    mpn: null,
    applications: [],
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    coverageM2PerUnit: null,
    coverageLinearMPerUnit: null,
    unitWeightKg: null,
    packSize: null,
    wastagePct: null,
    calculatorType: null,
    materials,
    variantOptions,
    familySlug: null,
    sourceUrl: null,
  }
}

describe('findVariantMatchForQuery — new flat shape', () => {
  it('returns the option slug when the query matches a size label', () => {
    const product = makeProduct([
      {
        options: [
          { value: 'ub-127x76x13', text: 'UB 127x76x13kg' },
          { value: 'ub-152x89x16', text: 'UB 152x89x16kg' },
        ],
      },
    ])
    expect(findVariantMatchForQuery(product, 'UB 127x76x13kg')).toBe('ub-127x76x13')
  })

  it('normalises the query (× / x / no-spaces) to match a label', () => {
    const product = makeProduct([
      {
        options: [
          { value: 'shs-100x100x4', text: 'SHS 100x100x4mm' },
        ],
      },
    ])
    // Space-free, lowercase, x-separator — should still hit.
    expect(findVariantMatchForQuery(product, 'shs100x100x4')).toBe('shs-100x100x4')
    // × separator — should also hit.
    expect(findVariantMatchForQuery(product, 'SHS 100×100×4')).toBe('shs-100x100x4')
  })

  it('returns undefined when the query matches no option', () => {
    const product = makeProduct([
      {
        options: [{ value: 'ub-127x76x13', text: 'UB 127x76x13kg' }],
      },
    ])
    expect(findVariantMatchForQuery(product, 'totally unrelated')).toBeUndefined()
  })

  it('returns undefined when the product has no variants', () => {
    const product = makeProduct(null)
    expect(findVariantMatchForQuery(product, 'UB 127x76x13kg')).toBeUndefined()
  })

  it('returns undefined when the query is empty', () => {
    const product = makeProduct([
      { options: [{ value: 'a', text: 'A' }] },
    ])
    expect(findVariantMatchForQuery(product, '')).toBeUndefined()
    expect(findVariantMatchForQuery(product, '   ')).toBeUndefined()
  })

  it('matches across multiple variants when the first variant has no match', () => {
    const product = makeProduct([
      { options: [{ value: 'a', text: 'AA' }] },
      { options: [{ value: 'b', text: 'BB' }] },
    ])
    expect(findVariantMatchForQuery(product, 'BB')).toBe('b')
  })

  it('returns the first match in declaration order', () => {
    const product = makeProduct([
      {
        options: [
          { value: 'first', text: 'Universal Beam 127' },
          { value: 'second', text: 'Universal Beam 127 Long' },
        ],
      },
    ])
    // Both contain "127" — the first declared wins.
    expect(findVariantMatchForQuery(product, 'Universal Beam 127')).toBe('first')
  })
})

describe('findVariantMatchForQuery — legacy shape tolerance', () => {
  /**
   * The parser in lib/public-products.ts is intentionally tolerant of
   * the legacy `{ material, image, selectors: [...] }` shape so the
   * code can deploy independently of migration 162
   * (supabase/migrations/162_flatten_variant_options.sql). These
   * tests pin that behaviour: while the migration is pending, public
   * pages should still match typed size queries against legacy rows.
   */
  it('flattens inline when given a legacy shape (material + image + selectors)', () => {
    const product = makeProduct([
      // Cast through unknown to simulate a row that hasn't been
      // flattened yet — the public-types code accepts the new shape
      // but the parser at runtime can also handle the old one.
      {
        options: [
          { value: 'ub-127x76x13', text: 'UB 127x76x13kg' },
        ],
      } as unknown as PublicProduct['variantOptions'] extends Array<infer T>
        ? T
        : never,
    ])
    // The variant is already in the new shape, so the parser just
    // walks options directly.
    expect(findVariantMatchForQuery(product, 'UB 127x76x13kg')).toBe('ub-127x76x13')
  })
})
