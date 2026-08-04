import {
  type AssistantDraft,
  type AssistantLineItem,
  type AssistantDeliveryAddress,
} from './types'
import { sanitizePromptText } from './sanitize'
import { calculateDocumentTotals } from '@/lib/vat'

export function emptyDraft(type: 'invoice' | 'quotation' = 'invoice'): AssistantDraft {
  return {
    type,
    client: null,
    items: [],
    pendingItem: null,
    apply_vat: true,
    subtotal: 0,
    vat_total: 0,
    total: 0,
  }
}

export function setPendingItem(
  draft: AssistantDraft,
  item: Partial<Omit<AssistantLineItem, 'vat_rate' | 'vat_amount' | 'line_total'>>
): AssistantDraft {
  return {
    ...draft,
    pendingItem: {
      ...draft.pendingItem,
      ...item,
      product_id: item.product_id ?? draft.pendingItem?.product_id ?? null,
      product_code: item.product_code ?? draft.pendingItem?.product_code ?? null,
      product_name: item.product_name ?? draft.pendingItem?.product_name,
      unit: item.unit ?? draft.pendingItem?.unit,
      quantity: item.quantity ?? draft.pendingItem?.quantity,
      price: item.price ?? draft.pendingItem?.price,
    },
  }
}

export function clearPendingItem(draft: AssistantDraft): AssistantDraft {
  return { ...draft, pendingItem: null }
}

export function formatPendingItem(item: Partial<AssistantLineItem> | null | undefined): string {
  if (!item) return 'None'
  const parts: string[] = []
  if (item.product_name) parts.push(item.product_name)
  if (item.quantity !== undefined && item.quantity !== null) {
    parts.push(`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`)
  }
  if (item.price !== undefined && item.price !== null) parts.push(`£${item.price.toFixed(2)}`)
  if (parts.length === 0) return 'None'
  return parts.join(' — ')
}

export function recomputeDraftTotals(draft: AssistantDraft): AssistantDraft {
  const rate = draft.vat_rate_percent ?? 20
  const result = calculateDocumentTotals(
    draft.items.map((item) => ({
      quantity: item.quantity,
      price: item.price,
      vat_rate: draft.apply_vat ? rate : 0,
    })),
    { applyVat: draft.apply_vat !== false }
  )

  return {
    ...draft,
    items: draft.items.map((item, index) => ({
      ...item,
      vat_amount: result.items[index]?.vat_amount ?? 0,
      line_total: result.items[index]?.line_total ?? 0,
      vat_rate: draft.apply_vat ? rate : 0,
    })),
    subtotal: result.subtotal,
    vat_total: result.vatTotal,
    total: result.total,
  }
}

export function addLineItem(
  draft: AssistantDraft,
  item: Omit<AssistantLineItem, 'vat_rate' | 'vat_amount' | 'line_total'>
): AssistantDraft {
  const rate = draft.vat_rate_percent ?? 20
  const newItem: AssistantLineItem = {
    ...item,
    product_id: item.product_id ?? null,
    product_code: item.product_code ?? null,
    unit: item.unit?.trim() || 'EA',
    vat_rate: draft.apply_vat ? rate : 0,
  }
  return recomputeDraftTotals({
    ...draft,
    items: [...draft.items, newItem],
  })
}

export function updateLineItem(
  draft: AssistantDraft,
  index: number,
  changes: Partial<Pick<AssistantLineItem, 'product_name' | 'quantity' | 'price' | 'unit'>>
): { draft: AssistantDraft; error?: string } {
  if (index < 0 || index >= draft.items.length) {
    return { draft, error: `Item ${index + 1} does not exist.` }
  }
  const updated = [...draft.items]
  updated[index] = {
    ...updated[index],
    ...(changes.product_name !== undefined && { product_name: changes.product_name }),
    ...(changes.quantity !== undefined && { quantity: changes.quantity }),
    ...(changes.price !== undefined && { price: changes.price }),
    ...(changes.unit !== undefined && { unit: changes.unit }),
  }
  return { draft: recomputeDraftTotals({ ...draft, items: updated }) }
}

export function removeLineItem(draft: AssistantDraft, index: number): { draft: AssistantDraft; error?: string } {
  if (index < 0 || index >= draft.items.length) {
    return { draft, error: `Item ${index + 1} does not exist.` }
  }
  const updated = draft.items.filter((_, i) => i !== index)
  return { draft: recomputeDraftTotals({ ...draft, items: updated }) }
}

export function clientDisplayName(
  client: Pick<NonNullable<AssistantDraft['client']>, 'first_name' | 'last_name' | 'company_name'>
): string {
  const name = [client.first_name, client.last_name].filter(Boolean).join(' ')
  const company = client.company_name
  if (company && name) return `${company} (${name})`
  return company || name || 'Unknown'
}

export function formatDraftClient(client: AssistantDraft['client']): string {
  if (!client) return 'None'
  return clientDisplayName(client)
}

export function formatDraftItems(items: AssistantLineItem[]): string {
  if (items.length === 0) return 'No items yet.'
  return items
    .map((item, i) => {
      const total = item.line_total ?? item.quantity * item.price
      const name = sanitizePromptText(item.product_name, 200)
      return `${i + 1}. ${name} — ${item.quantity} × £${item.price.toFixed(2)} = £${total.toFixed(2)}`
    })
    .join('\n')
}

export function formatDraftTotals(draft: AssistantDraft): string {
  const st = draft.subtotal ?? 0
  const vt = draft.vat_total ?? 0
  const t = draft.total ?? 0
  const rate = draft.vat_rate_percent ?? 20
  const vatLabel = draft.apply_vat ? `VAT (${rate}%)` : 'VAT'
  return `Subtotal: £${st.toFixed(2)}\n${vatLabel}: £${vt.toFixed(2)}\nTotal: £${t.toFixed(2)}`
}

export function setDeliveryAddress(
  draft: AssistantDraft,
  address: AssistantDeliveryAddress
): AssistantDraft {
  return {
    ...draft,
    deliveryAddress: {
      line_1: address.line_1?.trim() || undefined,
      line_2: address.line_2?.trim() || undefined,
      town: address.town?.trim() || undefined,
      county: address.county?.trim() || undefined,
      postcode: address.postcode?.trim().toUpperCase() || undefined,
    },
  }
}

export function formatDeliveryAddress(address?: AssistantDeliveryAddress | null): string {
  if (!address) return 'Not set'
  const parts = [
    address.line_1,
    address.line_2,
    address.town,
    address.county,
    address.postcode,
  ].filter(Boolean)
  return parts.join(', ') || 'Not set'
}
