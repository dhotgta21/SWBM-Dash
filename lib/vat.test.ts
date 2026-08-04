import { describe, it, expect } from 'vitest'
import {
  calculateDocumentTotalsPence,
  penceToPounds,
} from './vat'

describe('calculateDocumentTotalsPence — baseline (no discount)', () => {
  it('matches the existing math when no discount is set', () => {
    const result = calculateDocumentTotalsPence(
      [
        { quantity: 2, pricePence: 1000, vat_rate: 20 },
        { quantity: 1, pricePence: 500, vat_rate: 20 },
      ],
      { applyVat: true },
    )
    // 2×£10 + 1×£5 = £25 net, 20% VAT = £5, total = £30
    expect(result.subtotal_pre_discount).toBeCloseTo(25)
    expect(result.discount).toBe(0)
    expect(result.subtotal).toBeCloseTo(25)
    expect(result.vatTotal).toBeCloseTo(5)
    expect(result.total).toBeCloseTo(30)
  })

  it('omits VAT when applyVat is false', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 1000, vat_rate: 0 }],
      { applyVat: false },
    )
    expect(result.subtotal).toBeCloseTo(10)
    expect(result.vatTotal).toBe(0)
    expect(result.total).toBeCloseTo(10)
  })

  it('does not re-introduce document VAT when applyVat is false even if line rates are non-zero', () => {
    // Regression: form used to zero line rates but leave applyVat default true,
    // so order-level VAT still charged 20% of subtotal.
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 1000, vat_rate: 20 }],
      { applyVat: false, documentVatRate: 20 },
    )
    expect(result.vatTotal).toBe(0)
    expect(result.total).toBeCloseTo(10)
  })

  it('uses a custom documentVatRate for order-level VAT', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 1000, vat_rate: 5 }],
      { applyVat: true, documentVatRate: 5 },
    )
    // £10 net + 5% = £0.50 VAT
    expect(result.vatTotal).toBeCloseTo(0.5)
    expect(result.total).toBeCloseTo(10.5)
  })
})

describe('calculateDocumentTotalsPence — per-line amount discount (per-unit)', () => {
  it('multiplies the per-unit amount by quantity (10 × £5 line with £0.50/unit)', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 10, pricePence: 500, vat_rate: 20, discountAmountPence: 50 }],
      { applyVat: true },
    )
    // 10 × £5 = £50 net; discount = £0.50 × 10 = £5; net after = £45; VAT = £9; total = £54
    expect(result.items[0].line_discount_pence).toBe(500)
    expect(result.items[0].line_net_post_discount_pence).toBe(4500)
    expect(result.subtotal_pre_discount).toBeCloseTo(45)
    expect(result.subtotal).toBeCloseTo(45)
    expect(result.vatTotal).toBeCloseTo(9)
    expect(result.total).toBeCloseTo(54)
  })

  it('caps the discount at the line net (never below 0)', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 500, vat_rate: 20, discountAmountPence: 10000 }],
      { applyVat: true },
    )
    expect(result.items[0].line_discount_pence).toBe(500) // line net itself
    expect(result.items[0].line_net_post_discount_pence).toBe(0)
    expect(result.subtotal).toBe(0)
    expect(result.vatTotal).toBe(0)
    expect(result.total).toBe(0)
  })

  it('treats discountAmountPence = 0 as no discount', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 2, pricePence: 1000, vat_rate: 20, discountAmountPence: 0 }],
      { applyVat: true },
    )
    expect(result.items[0].line_discount_pence).toBe(0)
    expect(result.subtotal).toBeCloseTo(20)
  })

  it('treats missing discountAmountPence as no discount', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 2, pricePence: 1000, vat_rate: 20 }],
      { applyVat: true },
    )
    expect(result.items[0].line_discount_pence).toBe(0)
    expect(result.subtotal).toBeCloseTo(20)
  })
})

describe('calculateDocumentTotalsPence — per-line percent discount', () => {
  it('applies 10% to a 10 × £5 line and matches the £/unit result (£45)', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 10, pricePence: 500, vat_rate: 20, discountPercent: 10 }],
      { applyVat: true },
    )
    // 10% of £50 = £5; net after = £45; VAT = £9; total = £54
    expect(result.items[0].line_discount_pence).toBe(500)
    expect(result.items[0].line_net_post_discount_pence).toBe(4500)
    expect(result.subtotal).toBeCloseTo(45)
    expect(result.total).toBeCloseTo(54)
  })

  it('treats percent = 0 as no discount', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 2, pricePence: 1000, vat_rate: 20, discountPercent: 0 }],
      { applyVat: true },
    )
    expect(result.items[0].line_discount_pence).toBe(0)
  })

  it('rounds percent discount to the nearest penny (half-up)', () => {
    // 3 × £1.11 = £3.33 net; 33% of 333 pence = 109.89 → 110 pence
    const result = calculateDocumentTotalsPence(
      [{ quantity: 3, pricePence: 111, vat_rate: 20, discountPercent: 33 }],
      { applyVat: true },
    )
    expect(result.items[0].line_discount_pence).toBe(110)
    expect(result.items[0].line_net_post_discount_pence).toBe(223)
  })

  it('clamps silly inputs above 100% to 100%', () => {
    // Caller-side validation should reject > 100, but defence in depth.
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 1000, vat_rate: 20, discountPercent: 150 }],
      { applyVat: true },
    )
    expect(result.items[0].line_net_post_discount_pence).toBe(0)
    expect(result.items[0].line_discount_pence).toBe(1000)
  })
})

describe('calculateDocumentTotalsPence — order-level discount', () => {
  it('flat £10 off a £50 subtotal drops VAT too', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 5000, vat_rate: 20 }],
      {
        applyVat: true,
        orderDiscount: { amountPence: 1000 },
      },
    )
    // subtotal_pre_discount = £50, order disc = £10, subtotal post = £40
    // VAT = 20% × £40 = £8, total = £48
    expect(result.subtotal_pre_discount).toBeCloseTo(50)
    expect(result.discount).toBeCloseTo(10)
    expect(result.subtotal).toBeCloseTo(40)
    expect(result.vatTotal).toBeCloseTo(8)
    expect(result.total).toBeCloseTo(48)
  })

  it('percent discount on the post-line subtotal', () => {
    // 2 lines × £10 = £20 net, 10% order disc → £2 off, subtotal £18
    // VAT = £3.60, total = £21.60
    const result = calculateDocumentTotalsPence(
      [
        { quantity: 1, pricePence: 1000, vat_rate: 20 },
        { quantity: 1, pricePence: 1000, vat_rate: 20 },
      ],
      {
        applyVat: true,
        orderDiscount: { percent: 10 },
      },
    )
    expect(result.subtotal_pre_discount).toBeCloseTo(20)
    expect(result.discount).toBeCloseTo(2)
    expect(result.subtotal).toBeCloseTo(18)
    expect(result.vatTotal).toBeCloseTo(3.6)
    expect(result.total).toBeCloseTo(21.6)
  })

  it('caps the order discount at the subtotal (never below 0)', () => {
    const result = calculateDocumentTotalsPence(
      [{ quantity: 1, pricePence: 500, vat_rate: 20 }],
      {
        applyVat: true,
        orderDiscount: { amountPence: 999_999_99 }, // way more than the line
      },
    )
    expect(result.discount).toBeCloseTo(5)
    expect(result.subtotal).toBe(0)
    expect(result.vatTotal).toBe(0)
    expect(result.total).toBe(0)
  })

  it('order discount + per-line discount: per-line first, order second', () => {
    const result = calculateDocumentTotalsPence(
      [
        // 10 × £5 line with 10% per-line discount → net £45
        // 1 × £10 line with no discount → net £10
        // subtotal_pre_discount = £55
        // 10% order discount on £55 = £5.50
        // subtotal_post = £49.50
        // VAT = £9.90
        // total = £59.40
        { quantity: 10, pricePence: 500, vat_rate: 20, discountPercent: 10 },
        { quantity: 1, pricePence: 1000, vat_rate: 20 },
      ],
      {
        applyVat: true,
        orderDiscount: { percent: 10 },
      },
    )
    expect(result.subtotal_pre_discount).toBeCloseTo(55)
    expect(result.discount).toBeCloseTo(5.5)
    expect(result.subtotal).toBeCloseTo(49.5)
    expect(result.vatTotal).toBeCloseTo(9.9)
    expect(result.total).toBeCloseTo(59.4)
  })
})

describe('calculateDocumentTotalsPence — zero-discount path stays unchanged', () => {
  it('zero-discount multi-line matches the legacy totals', () => {
    const result = calculateDocumentTotalsPence(
      [
        { quantity: 3, pricePence: 1250, vat_rate: 20 },
        { quantity: 2, pricePence: 250, vat_rate: 20 },
      ],
      { applyVat: true },
    )
    // 3 × £12.50 = £37.50; 2 × £2.50 = £5; net = £42.50; VAT = £8.50; total = £51
    expect(result.subtotal_pre_discount).toBeCloseTo(42.5)
    expect(result.discount).toBe(0)
    expect(result.subtotal).toBeCloseTo(42.5)
    expect(result.vatTotal).toBeCloseTo(8.5)
    expect(result.total).toBeCloseTo(51)
  })
})

describe('penceToPounds / poundsToPence sanity (existing helpers)', () => {
  it('roundtrips cleanly', () => {
    const pence = 1234
    expect(Math.round(penceToPounds(pence) * 100)).toBe(pence)
  })
})
