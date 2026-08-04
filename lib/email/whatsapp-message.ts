// lib/email/whatsapp-message.ts
// Builds the short text body the team will see in WhatsApp when an
// invoice link is shared to the group chat. Kept as a small pure
// function so it can also be unit-tested or surfaced in a preview before
// the user hits Share.
//
// Intentionally compact (under ~280 chars on a typical invoice) so it
// reads cleanly in WhatsApp without being scrolled past. Each line is one
// fact the team needs to triage the delivery / collection.
//
// SECURITY: every user-controlled field is sanitised before it lands in
// the message body. We strip C0 / C1 control characters (which are
// invisible / destructive in some terminals) and cap the length so a
// pathological 100KB name doesn't blow up a wa.me URL. This is defence
// in depth: the data originates from the database, where it was
// validated on insert, but a corrupted / hand-edited row would still
// reach this code path.

export type WhatsAppShareTarget = 'client' | 'staff' | 'driver'

export interface WhatsAppShareMessageInput {
  target?: WhatsAppShareTarget
  invoice: {
    document_number: string
    type: string // 'invoice' | 'quotation'
    total?: number | null
    operator_name?: string | null
    delivery_method?: 'delivery' | 'collection' | null
    delivery_address_line_1?: string | null
    delivery_address_line_2?: string | null
    delivery_town?: string | null
    delivery_county?: string | null
    delivery_postcode?: string | null
    // The "delivery date" — falls back to issue_date when no explicit
    // date is set. We don't have a separate delivery_date column on the
    // invoice, so this is whatever date the operator wants to flag.
    issue_date: string
    delivery_date?: string | null
  }
  client: {
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
  }
  // Public web-view URL. Optional — when missing, the link line is
  // omitted. Callers SHOULD always pass this in the new flow.
  shareUrl?: string | null
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

// Strip ASCII + Unicode control characters and collapse whitespace
// runs. We keep visible whitespace (space, NBSP) but drop the
// dangerous ones (NUL, BS, ESC, vertical tabs, etc.) that some
// terminals interpret and that can mess with terminal / chat rendering.
function sanitizeText(value: string | null | undefined, maxLen = 200): string {
  if (!value) return ''
  const stripped = value
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) : stripped
}

// WhatsApp markdown links use the syntax [text](url). Remove characters from
// the display text that would otherwise break the link parsing (square brackets
// or parentheses). This keeps the link clickable even if the raw address
// contains those characters.
function sanitizeLinkDisplayText(value: string): string {
  return value.replace(/[[\]()]/g, '')
}

function formatDateUK(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount || 0)
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  }).format(n)
}

function clientName(c: WhatsAppShareMessageInput['client']): string {
  if (c.company_name) {
    const contact = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
    const company = sanitizeText(c.company_name, 100)
    const person = sanitizeText(contact, 100)
    return person ? `${company} (${person})` : company
  }
  const combined = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return sanitizeText(combined, 100) || 'Unknown client'
}

function docTypeLabel(type: string): string {
  return type === 'quotation' ? 'Quotation' : 'Invoice'
}

function formatDeliveryAddress(input: WhatsAppShareMessageInput['invoice']): string | null {
  const parts = [
    input.delivery_address_line_1,
    input.delivery_address_line_2,
    input.delivery_town,
    input.delivery_county,
    input.delivery_postcode,
  ]
    .filter(Boolean)
    .map((p) => sanitizeText(String(p), 120))
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null
  return parts.join(', ')
}

function buildGoogleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function buildWhatsAppShareText(input: WhatsAppShareMessageInput): string {
  const { target = 'client', invoice, client, shareUrl } = input
  const lines: string[] = []
  const docLabel = docTypeLabel(invoice.type)

  if (target === 'driver') {
    const driverLabel = invoice.type === 'quotation' ? 'Quotation' : invoice.delivery_method === 'collection' ? 'Picker Note' : 'Delivery Note'
    lines.push(`${driverLabel} ${invoice.document_number}`)
  } else {
    lines.push(`${docLabel} ${invoice.document_number}`)
  }

  // Use plain text labels instead of emoji. Some team phones / WhatsApp
  // Web clients render emoji as empty boxes or diamonds, which makes the
  // message look broken. Labels keep it readable everywhere.
  const name = clientName(client)
  if (name && name !== 'Unknown client') {
    lines.push(`- Client: ${name}`)
  }

  if (target !== 'driver' && typeof invoice.total === 'number' && !Number.isNaN(invoice.total)) {
    lines.push(`- Amount: ${formatCurrency(invoice.total)}`)
  }

  const deliveryDate = invoice.delivery_date || invoice.issue_date
  if (deliveryDate) {
    lines.push(`- Delivery: ${formatDateUK(deliveryDate)}`)
  }

  const operator = sanitizeText(invoice.operator_name, 100)
  if (operator) {
    lines.push(`- Prepared by: ${operator}`)
  }

  const address = formatDeliveryAddress(invoice)
  if (address) {
    if (target === 'driver') {
      // Make the address a clickable link that opens directly in Google Maps.
      lines.push('')
      lines.push('Address:')
      lines.push(`[${sanitizeLinkDisplayText(address)}](${buildGoogleMapsUrl(address)})`)
    } else {
      lines.push(`- Address: ${address}`)
    }
  }

  if (shareUrl) {
    lines.push('')
    if (target === 'staff') {
      lines.push(`Staff view: ${shareUrl}`)
    } else if (target === 'driver') {
      const noteLabel = invoice.delivery_method === 'collection' ? 'Picker note' : 'Delivery note'
      lines.push(`${noteLabel}:`)
      lines.push(`[View here](${shareUrl})`)
    } else {
      lines.push(`View: ${shareUrl}`)
    }
  }

  return lines.join('\n')
}

export function buildWhatsAppShareTextForDriver(input: Omit<WhatsAppShareMessageInput, 'target'>): string {
  return buildWhatsAppShareText({ ...input, target: 'driver' })
}

export function buildWhatsAppShareTitle(input: WhatsAppShareMessageInput): string {
  return `${docTypeLabel(input.invoice.type)} ${input.invoice.document_number}`
}
