import { describe, it, expect } from 'vitest'
import { emptyDraft, addLineItem, updateLineItem, removeLineItem, formatDraftClient, clientDisplayName } from './draft'

describe('invoice assistant draft helpers', () => {
  it('empty draft starts at zero', () => {
    const draft = emptyDraft('invoice')
    expect(draft.items).toEqual([])
    expect(draft.subtotal).toBe(0)
    expect(draft.vat_total).toBe(0)
    expect(draft.total).toBe(0)
  })

  it('adds a VAT-inclusive line item and recomputes totals', () => {
    let draft = emptyDraft('invoice')
    draft = addLineItem(draft, {
      product_name: 'Cement',
      quantity: 10,
      price: 5,
      unit: 'bag',
    })
    expect(draft.items).toHaveLength(1)
    expect(draft.subtotal).toBe(50)
    expect(draft.vat_total).toBe(10)
    expect(draft.total).toBe(60)
  })

  it('updates a line item by index', () => {
    let draft = emptyDraft('invoice')
    draft = addLineItem(draft, { product_name: 'Sand', quantity: 2, price: 10 })
    const updated = updateLineItem(draft, 0, { quantity: 5 })
    expect(updated.error).toBeUndefined()
    expect(updated.draft.total).toBe(60) // 5 * 10 = 50 + 10 VAT
  })

  it('returns an error for invalid update index', () => {
    const draft = emptyDraft('invoice')
    const updated = updateLineItem(draft, 0, { quantity: 5 })
    expect(updated.error).toBeDefined()
  })

  it('removes a line item by index', () => {
    let draft = emptyDraft('invoice')
    draft = addLineItem(draft, { product_name: 'Bricks', quantity: 100, price: 0.5 })
    draft = addLineItem(draft, { product_name: 'Mortar', quantity: 1, price: 20 })
    const removed = removeLineItem(draft, 0)
    expect(removed.error).toBeUndefined()
    expect(removed.draft.items).toHaveLength(1)
    expect(removed.draft.items[0]?.product_name).toBe('Mortar')
  })

  it('formats client name with company', () => {
    expect(
      formatDraftClient({
        id: '1',
        first_name: 'John',
        last_name: 'Doe',
        company_name: 'Builders Ltd',
        email: null,
        phone: null,
      })
    ).toBe('Builders Ltd (John Doe)')
  })

  it('client display name ignores contact details', () => {
    expect(
      clientDisplayName({
        first_name: 'Jane',
        last_name: 'Doe',
        company_name: 'Apex Builders Ltd',
        email: 'jane@example.com',
        phone: '07700 900000',
      } as Parameters<typeof clientDisplayName>[0])
    ).toBe('Apex Builders Ltd (Jane Doe)')
  })
})
