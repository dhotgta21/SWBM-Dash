import { describe, it, expect } from 'vitest'
import { buildWhatsAppShareText, buildWhatsAppShareTextForDriver } from './whatsapp-message'

describe('buildWhatsAppShareText for driver', () => {
  const baseInput = {
    invoice: {
      document_number: 'INV-1234',
      type: 'invoice' as const,
      delivery_method: 'delivery' as const,
      delivery_address_line_1: '123 Main Street',
      delivery_town: 'London',
      delivery_postcode: 'W1A 1AA',
      issue_date: '2026-07-07',
    },
    client: { first_name: 'John', last_name: 'Doe', company_name: 'Acme Ltd' },
    shareUrl: 'https://example.com/delivery-note/abc',
  }

  it('includes a clickable Google Maps link for the address', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'driver' })
    expect(text).toContain('Address:')
    expect(text).toContain(
      '[123 Main Street, London, W1A 1AA](https://www.google.com/maps/search/?api=1&query=123%20Main%20Street%2C%20London%2C%20W1A%201AA)'
    )
  })

  it('includes a clickable delivery note link', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'driver' })
    expect(text).toContain('Delivery note:')
    expect(text).toContain('[View here](https://example.com/delivery-note/abc)')
  })

  it('uses "Picker note" label for collections', () => {
    const text = buildWhatsAppShareText({
      ...baseInput,
      target: 'driver',
      invoice: { ...baseInput.invoice, delivery_method: 'collection' },
    })
    expect(text).toContain('Picker note:')
  })

  it('puts operator before address and note sections', () => {
    const text = buildWhatsAppShareText({
      ...baseInput,
      target: 'driver',
      invoice: { ...baseInput.invoice, operator_name: 'Jane Smith' },
    })
    const operatorIndex = text.indexOf('- Prepared by: Jane Smith')
    const addressIndex = text.indexOf('Address:')
    const noteIndex = text.indexOf('Delivery note:')
    expect(operatorIndex).toBeGreaterThan(-1)
    expect(addressIndex).toBeGreaterThan(operatorIndex)
    expect(noteIndex).toBeGreaterThan(addressIndex)
  })

  it('strips markdown-breaking characters from the address link text', () => {
    const text = buildWhatsAppShareText({
      ...baseInput,
      target: 'driver',
      invoice: {
        ...baseInput.invoice,
        delivery_address_line_1: 'Flat [A] (rear)',
      },
    })
    expect(text).toContain('[Flat A rear, London, W1A 1AA]')
    expect(text).not.toContain('[Flat [A] (rear), London, W1A 1AA]')
  })

  it('omits address section when no address is provided', () => {
    const text = buildWhatsAppShareText({
      ...baseInput,
      target: 'driver',
      invoice: {
        ...baseInput.invoice,
        delivery_address_line_1: null,
        delivery_town: null,
        delivery_postcode: null,
      },
    })
    expect(text).not.toContain('Address:')
  })

  it('omits note link when shareUrl is missing', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'driver', shareUrl: null })
    expect(text).not.toContain('Delivery note:')
    expect(text).not.toContain('[View here]')
  })

  it('produces identical output via buildWhatsAppShareTextForDriver', () => {
    const explicit = buildWhatsAppShareText({ ...baseInput, target: 'driver' })
    const helper = buildWhatsAppShareTextForDriver(baseInput)
    expect(helper).toBe(explicit)
  })

  it('produces a wa.me-safe URL that round-trips the message', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'driver' })
    const waLink = `https://wa.me/?text=${encodeURIComponent(text)}`
    expect(waLink.length).toBeLessThan(4000)
    const decoded = decodeURIComponent(waLink.replace('https://wa.me/?text=', ''))
    expect(decoded).toBe(text)
  })
})

describe('buildWhatsAppShareText for non-driver targets', () => {
  const baseInput = {
    invoice: {
      document_number: 'INV-1234',
      type: 'invoice' as const,
      delivery_method: 'delivery' as const,
      delivery_address_line_1: '123 Main Street',
      delivery_town: 'London',
      delivery_postcode: 'W1A 1AA',
      issue_date: '2026-07-07',
      total: 150.0,
    },
    client: { first_name: 'John', last_name: 'Doe' },
    shareUrl: 'https://example.com/invoice/abc',
  }

  it('keeps address as a plain bullet for clients', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'client' })
    expect(text).toContain('- Address: 123 Main Street, London, W1A 1AA')
    expect(text).not.toContain('google.com/maps')
  })

  it('keeps address as a plain bullet for staff', () => {
    const text = buildWhatsAppShareText({ ...baseInput, target: 'staff' })
    expect(text).toContain('- Address: 123 Main Street, London, W1A 1AA')
    expect(text).not.toContain('google.com/maps')
  })
})
