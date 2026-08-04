'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createInvoice, updateInvoice, InvoiceFormData, InvoiceLineItem } from '@/lib/actions/invoices'
import { ClientPicker, Client as ClientType } from '@/components/clients/ClientPicker'
import { ProductSearch, ProductSearchRef, type Product, type ProductSearchMatchedVariant } from '@/components/products/ProductSearch'
import { QuickProductAdder } from '@/components/products/QuickProductAdder'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { InvoiceCreatedActions } from '@/components/invoices/InvoiceCreatedActions'
import { ScaledInvoiceDocument } from '@/components/invoices/ScaledInvoiceDocument'
import { DiscountInput } from '@/components/invoices/DiscountInput'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { AddressAutocomplete } from '@/components/clients/AddressAutocomplete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { formatCurrency, formatDateInput, formatTimeInput, addDays, getDocumentStatusLabel } from '@/lib/utils'
import { DEFAULT_PAYMENT_TERMS_DAYS } from '@/lib/client-credit'
import { NEW_DOCUMENT_STATUSES, getSelectableStatuses, isHardLocked, isSoftLocked, type DocumentType } from '@/lib/invoice-status'
import { calculateDocumentTotalsPence, normalizeVatRatePercent, VAT_RATE_PERCENTAGE } from '@/lib/vat'
import {
  fromRowColumns,
  parseDiscountInput,
  parseOrderDiscountInput,
  toRowColumns,
} from '@/lib/format/discount'
import { Trash2, FileText, Quote, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Line item with a client-side stable id used as the React key. The id is
// never sent to the server; it only exists to keep DOM nodes stable across
// add/remove/reorder operations so inputs don't briefly bind to the wrong row.
interface ClientLineItem extends InvoiceLineItem {
  _clientId: string
}

interface ExistingInvoice {
  id: string
  type: 'invoice' | 'quotation'
  status: string
  issue_date: string
  issue_time?: string | null
  due_date?: string | null
  expiry_date?: string | null
  order_number?: string | null
  account_number?: string | null
  operator_name?: string
  your_reference?: string | null
  notes?: string | null
  show_payment_terms?: boolean | null
  show_watermark?: boolean | null
  // Status-stamp fields — passed through into the preview so the form
  // preview matches what the saved PDF/email/public share will render.
  status_stamps_enabled?: boolean | null
  status_stamps_mode?: 'auto' | 'manual' | null
  show_paid_watermark?: boolean | null
  show_partially_paid_watermark?: boolean | null
  show_overdue_watermark?: boolean | null
  paid_by?: string | null
  paid_at?: string | null
  overdue_at?: string | null
  updated_at?: string | null
  client_id: string
  delivery_method?: 'delivery' | 'collection' | null
  delivery_address_line_1?: string | null
  delivery_address_line_2?: string | null
  delivery_town?: string | null
  delivery_county?: string | null
  delivery_postcode?: string | null
  // Order-level discount values hydrated off the row (pounds / percent).
  // Either one may be set, never both — DB CHECK enforces this.
  discount_amount?: number | null
  discount_percent?: number | null
  invoice_items: {
    id: string
    product_id: string | null
    product_name: string
    product_code: string | null
    unit: string | null
    quantity: number
    price: number
    vat_rate: number
    // Per-line discount values (one of these, never both).
    discount_amount?: number | null
    discount_percent?: number | null
  }[]
}

function parseTime(value: string): number | null {
  if (!value) return null
  const match = value.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (!match) return null
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

interface InvoiceFormProps {
  initialData?: ExistingInvoice
  // Operator name for the active user. The form no longer surfaces this as an
  // input — it is server-owned, pulled from the active user's profile at
  // create time. It is passed in here so the PDF preview can render it before
  // the row hits the database.
  operatorName?: string | null
  company?: InvoicePdfProps['company']
  bankDetails?: InvoicePdfProps['bankDetails']
  logoSrc?: string | null
  isAdmin?: boolean
  /** When false, the post-create success dialog hides the Email action.
   *  Driven by the invoices_send_email permission. Default true so
   *  existing call sites (the standalone /invoices/new page, tests)
   *  keep working unchanged. */
  canSendEmail?: boolean
  /** When false, the status <select> is disabled (and any status change
   *  is blocked from submitting). Driven by invoices_change_status. Default true. */
  canChangeStatus?: boolean
  /**
   * Company default VAT percentage (e.g. 20). From company_settings.default_vat_rate.
   * Applied to new lines when VAT is on.
   */
  defaultVatRate?: number
}

/**
 * Inline size dropdown rendered under the product search in the draft
 * line item. Only shown when the picked product has at least one
 * variant option (e.g. STL-073 Universal Beam with 21 size variants).
 *
 * Walks every variant's `options` list and renders a single dropdown
 * for the operator to pick a size. Picking an option bubbles up to
 * the parent which re-bakes the product name with the size text.
 */
function DraftSizeSelector({
  product,
  selectedSizeValue,
  onChange,
  disabled,
}: {
  product: Product
  selectedSizeValue: string
  onChange: (value: string, text: string) => void
  disabled?: boolean
}) {
  const variants = product.variantOptions ?? []
  const options = variants.flatMap((v) => v.options ?? [])
  if (variants.length === 0 || options.length === 0) return null

  return (
    <div className="mt-1.5 space-y-1.5">
      <select
        value={selectedSizeValue}
        onChange={(e) => {
          const value = e.target.value
          const option = options.find((o) => o.value === value)
          onChange(value, option?.text ?? '')
        }}
        disabled={disabled}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
        aria-label="Variant size"
      >
        <option value="">Select a size</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </div>
  )
}

// `_clientId` is a client-only stable id used as the React key for line
// items. It never leaves the browser, so it only needs to be unique per
// component instance — we keep the counter in a useRef so it can't
// survive HMR, can't be shared across form instances, and resets on
// remount. See the `lineItemIdCounterRef` declared inside the component.

function parseNumberInput(value: string): number {
  const parsed = parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function poundsToPence(value: string | number): number {
  const parsed = typeof value === 'string' ? parseFloat(value) : value
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100)
}

function penceToPounds(value: number): number {
  return Math.round(value) / 100
}

// 'paid' and 'partial' are hard-locked — the server (lib/actions/invoices.ts
// `updateInvoice`) refuses edits, even for admins, once money is in. We mirror
// that here so the form doesn't offer inputs the action will reject.
//
// Calculates the totals using the same math the server runs, so what the
// form shows is what the DB will store. Discounts are forward-compatible:
// per-line discounts land on each item, order-level discount sits on the
// invoice.
function calculateLineTotals(
  items: ClientLineItem[],
  applyVat: boolean,
  orderLevel: {
    discountAmountPence?: number | null
    discountPercent?: number | null
  } | null = null,
  documentVatRate: number = VAT_RATE_PERCENTAGE
) {
  const rate = normalizeVatRatePercent(documentVatRate)
  const vatRate = applyVat ? rate : 0
  const result = calculateDocumentTotalsPence(
    items.map((item) => ({
      quantity: item.quantity,
      // Note: `item.price` is already in pence on the form (we convert £ →
      // pence on keystroke for the price field). Passing it as `pricePence`
      // avoids a second multiplication.
      pricePence: item.price,
      vat_rate: vatRate,
      discountAmountPence: item.discount_amount ?? null,
      discountPercent: item.discount_percent ?? null,
    })),
    {
      applyVat,
      documentVatRate: rate,
      orderDiscount: orderLevel
        ? {
            amountPence: orderLevel.discountAmountPence ?? null,
            percent: orderLevel.discountPercent ?? null,
          }
        : null,
    }
  )

  return {
    items: result.items.map((calculated, index) => {
      const original = items[index]
      return {
        product_name: original.product_name,
        product_code: original.product_code ?? null,
        unit: original.unit ?? null,
        quantity: original.quantity,
        price: penceToPounds(original.price),
        vat_rate: calculated.vat_rate,
        vat_amount: penceToPounds(calculated.vat_amount_pence),
        line_total: penceToPounds(calculated.line_total_pence),
        // Per-line discount figures, so the preview PDF / detail view can
        // render the "−£0.50 × 10" annotation.
        discount_amount: original.discount_amount ?? null,
        discount_percent: original.discount_percent ?? null,
        line_discount: penceToPounds(calculated.line_discount_pence),
      }
    }),
    subtotal_pre_discount: result.subtotal_pre_discount,
    discount: result.discount,
    subtotal: result.subtotal,
    vatTotal: result.vatTotal,
    total: result.total,
  }
}

export function InvoiceForm({
  initialData,
  operatorName,
  company,
  bankDetails,
  logoSrc,
  isAdmin = false,
  canSendEmail = true,
  canChangeStatus = true,
  defaultVatRate = VAT_RATE_PERCENTAGE,
}: InvoiceFormProps) {
  const router = useRouter()
  const companyVatRate = normalizeVatRatePercent(defaultVatRate)
  // Per-component counter for line-item client ids. Kept in a useRef so it
  // can't survive HMR, can't leak between form instances, and resets on
  // remount. (Previously a module-level `let` that shared state across
  // every form on the page and across hot reloads.)
  // Seeded past the hydrated rows — they occupy li_1..li_n, so a new line
  // added while editing an existing document must not collide with them
  // (duplicate React keys bind inputs/discounts to the wrong row).
  const lineItemIdCounterRef = useRef(initialData?.invoice_items.length ?? 0)
  const nextLineItemId = (): string => {
    lineItemIdCounterRef.current += 1
    return `li_${lineItemIdCounterRef.current}`
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Non-fatal message (e.g. stock failed after document was already saved). */
  const [warning, setWarning] = useState<string | null>(null)
  const [selectedClient, setSelectedClient] = useState<ClientType | null>(null)
  // Once the operator picks a due date by hand we stop auto-defaulting it
  // from the client's payment terms (new documents only).
  const [dueDateManual, setDueDateManual] = useState(false)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [createdInvoice, setCreatedInvoice] = useState<(InvoicePdfProps['invoice'] & { id: string }) | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const hasVat = initialData
    ? initialData.invoice_items.some((item) => item.vat_rate > 0)
    : true

  const showPaymentTerms = initialData?.show_payment_terms === true

  // order_number / account_number / operator_name are no longer user-editable
  // — the server owns them. We keep the form state free of these so the
  // payload we send to createInvoice / updateInvoice matches reality.
  const [formData, setFormData] = useState({
    type: initialData?.type || 'invoice',
    clientId: initialData?.client_id || '',
    issueDate: initialData?.issue_date || formatDateInput(),
    // Default the clock only for NEW documents — editing a row with NULL
    // issue_time must stay empty (and submit undefined), not capture now.
    issueTime: initialData ? initialData.issue_time || '' : formatTimeInput(),
    dueDate: initialData?.due_date || addDays(new Date(), 30),
    expiryDate: initialData?.expiry_date || '',
    yourReference: initialData?.your_reference || '',
    notes: initialData?.notes || '',
    status: initialData?.status || 'sent',
    applyVat: hasVat,
    showPaymentTerms,
    // Watermark defaults to ON for new invoices and respects whatever the
    // operator previously saved for edits (the migration backfilled existing
    // rows to false, so legacy documents don't suddenly start watermarking).
    showWatermark: initialData ? initialData.show_watermark !== false : true,
    deliveryMethod: initialData?.delivery_method || 'delivery',
    deliveryAddressLine1: initialData?.delivery_address_line_1 || '',
    deliveryAddressLine2: initialData?.delivery_address_line_2 || '',
    deliveryTown: initialData?.delivery_town || '',
    deliveryCounty: initialData?.delivery_county || '',
    deliveryPostcode: initialData?.delivery_postcode || '',
  })

  const [items, setItems] = useState<ClientLineItem[]>(() => {
    let counter = 0
    return (
      initialData?.invoice_items.map((item) => {
        counter += 1
        return {
          _clientId: `li_${counter}`,
          product_id: item.product_id,
          product_name: item.product_name,
          product_code: item.product_code || undefined,
          unit: item.unit || undefined,
          quantity: item.quantity,
          price: poundsToPence(item.price),
          vat_rate: item.vat_rate,
          // Per-line discount hydration. Either column may be set; both
          // null is the common (no-discount) case.
          discount_amount: item.discount_amount ?? null,
          discount_percent: item.discount_percent ?? null,
        }
      }) || []
    )
  })

  const [draftItem, setDraftItem] = useState({
    product: null as Product | null,
    productName: '',
    quantity: 1,
    unit: 'EA',
    price: 0,
    // For variant products (size-only SKUs like STL-073 Universal Beam)
    // the operator picks a size from the search match or the inline
    // dropdown. Both update these so the line item name and the
    // committed invoice line both carry the chosen size.
    selectedSizeValue: '' as string,
    selectedSizeText: '' as string,
  })

  // Editable string values for the quantity input. Storing the raw string
  // lets users clear the field (showing an empty input) while the numeric
  // state falls back to 0. Keys are `${clientId}:quantity` for committed
  // items and `draft:quantity` for the draft row. Price fields are NOT
  // tracked here — MoneyInput owns its own in-progress digit string
  // internally so it can do reverse-entry correctly.
  const [itemInputs, setItemInputs] = useState<Record<string, string>>({})

  // Per-line discount raw input (so each row can show the operator's
  // in-progress text independently of the parsed value). Hydrated from the
  // stored row on edit so a saved discount re-renders as e.g. "£5.00" or
  // "10%".
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    initialData?.invoice_items.forEach((item, index) => {
      const parsed = fromRowColumns(item.discount_amount, item.discount_percent)
      const clientId = `li_${index + 1}`
      if (parsed.kind === 'amount') {
        out[`${clientId}:discount`] = `£${(parsed.valuePence / 100).toFixed(2)}`
      } else if (parsed.kind === 'percent') {
        const v = parsed.value
        out[`${clientId}:discount`] = `${Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '')}%`
      }
    })
    return out
  })

  // Order-level discount raw input.
  const initialOrder = initialData
    ? fromRowColumns(initialData.discount_amount, initialData.discount_percent)
    : null
  const [orderDiscountRaw, setOrderDiscountRaw] = useState<string>(() => {
    if (!initialOrder) return ''
    if (initialOrder.kind === 'amount') {
      return `£${(initialOrder.valuePence / 100).toFixed(2)}`
    }
    if (initialOrder.kind === 'percent') {
      const v = initialOrder.value
      return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '')}%`
    }
    return ''
  })

  function itemInputKey(clientId: string, field: 'quantity' | 'price') {
    return `${clientId}:${field}`
  }

  function discountInputKey(clientId: string) {
    return `${clientId}:discount`
  }

  function updateExistingQuantity(index: number, raw: string) {
    setItemInputs((prev) => ({ ...prev, [itemInputKey(items[index]._clientId, 'quantity')]: raw }))
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], quantity: parseNumberInput(raw) }
      return updated
    })
  }

  function updateExistingPrice(index: number, pence: number) {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], price: pence }
      return updated
    })
  }

  function updateExistingDiscount(index: number, raw: string) {
    setDiscountInputs((prev) => ({ ...prev, [discountInputKey(items[index]._clientId)]: raw }))
    const item = items[index]
    // Cap per-unit £ discount to the unit price so it cannot exceed cost.
    const unitPricePence = Math.max(0, Math.round(item.price))
    const parsed = parseDiscountInput(raw, { maxAmountPence: unitPricePence })
    // Only commit valid (or empty) discounts — invalid input is kept in the
    // raw field for the inline error but not written into the line item.
    if (parsed.kind === 'invalid') {
      updateItemDiscount(index, null, null)
      return
    }
    const cols = toRowColumns(parsed)
    updateItemDiscount(index, cols.discountAmount, cols.discountPercent)
  }

  function updateDraftQuantity(raw: string) {
    setItemInputs((prev) => ({ ...prev, 'draft:quantity': raw }))
    updateDraftItem({ quantity: parseNumberInput(raw) })
  }

  function updateDraftPrice(pence: number) {
    // MoneyInput owns its own digit string, so we don't write anything to
    // `itemInputs` here — we just push the parsed pence into draft state.
    updateDraftItem({ price: pence })
  }

  function resetDraftInputs() {
    setItemInputs((prev) => {
      const next = { ...prev }
      delete next['draft:quantity']
      return next
    })
  }

  const productSearchRef = useRef<ProductSearchRef>(null)
  const draftQtyRef = useRef<HTMLInputElement>(null)
  const draftPriceRef = useRef<HTMLInputElement>(null)

  const mobileProductSearchRef = useRef<ProductSearchRef>(null)
  const mobileDraftQtyRef = useRef<HTMLInputElement>(null)
  const mobileDraftPriceRef = useRef<HTMLInputElement>(null)

  const officeAddressLines = [
    company?.company_name || 'Head Office',
    company?.address_line_1,
    company?.address_line_2,
    company?.town,
    company?.county,
    company?.postcode,
  ].filter(Boolean) as string[]

  // Pre-order-discount line nets (pence). Used both for totals and as the
  // hard cap for a flat £ order discount (cannot exceed product cost sum).
  const lineSubtotalPence = useMemo(() => {
    return items.reduce((sum, item) => {
      const lineNet = Math.round(item.quantity * item.price)
      const amountPence =
        item.discount_amount != null && item.discount_amount > 0
          ? Math.round(item.discount_amount * 100)
          : null
      const percent =
        item.discount_percent != null && item.discount_percent > 0
          ? item.discount_percent
          : null
      let disc = 0
      if (percent != null) {
        disc = Math.round((lineNet * Math.min(100, percent)) / 100)
      } else if (amountPence != null) {
        disc = Math.min(lineNet, Math.max(0, Math.round(amountPence * item.quantity)))
      }
      return sum + Math.max(0, lineNet - disc)
    }, 0)
  }, [items])

  // Commit the order-level discount raw text to typed state, so the
  // server payload + the totals calculator see the parsed values.
  // Cap flat £ order discounts to the post-line-discount subtotal.
  const orderDiscountParsed = useMemo(
    () =>
      parseOrderDiscountInput(orderDiscountRaw, {
        maxAmountPence: lineSubtotalPence,
      }),
    [orderDiscountRaw, lineSubtotalPence],
  )
  const orderDiscountColumns = useMemo(
    () => toRowColumns(orderDiscountParsed),
    [orderDiscountParsed],
  )

  // The form's source-of-truth totals + per-line breakdown. Computed
  // once per change of items / VAT / order-discount, then consumed by the
  // items table, totals card, and PDF preview so they never drift.
  const { totals, perLine } = useMemo(() => {
    const r = calculateDocumentTotalsPence(
      items.map((item) => ({
        quantity: item.quantity,
        // `item.price` is stored as integer pence on the form (typed from
        // the £ input). Pass straight through.
        pricePence: item.price,
        vat_rate: formData.applyVat ? companyVatRate : 0,
        discountAmountPence:
          item.discount_amount != null && item.discount_amount > 0
            ? Math.round(item.discount_amount * 100)
            : null,
        discountPercent:
          item.discount_percent != null && item.discount_percent > 0
            ? item.discount_percent
            : null,
      })),
      {
        applyVat: formData.applyVat,
        documentVatRate: companyVatRate,
        orderDiscount: {
          amountPence:
            orderDiscountColumns.discountAmount != null && orderDiscountColumns.discountAmount > 0
              ? Math.round(orderDiscountColumns.discountAmount * 100)
              : null,
          percent:
            orderDiscountColumns.discountPercent != null && orderDiscountColumns.discountPercent > 0
              ? orderDiscountColumns.discountPercent
              : null,
        },
      }
    )
    return {
      totals: {
        subtotal: r.subtotal,
        subtotal_pre_discount: r.subtotal_pre_discount,
        discount: r.discount,
        vatTotal: r.vatTotal,
        total: r.total,
      },
      perLine: r.items.map((calc) => ({
        vatPence: calc.vat_amount_pence,
        totalPence: calc.line_total_pence,
        netPostPence: calc.line_net_post_discount_pence,
        discountPence: calc.line_discount_pence,
      })),
    }
  }, [items, formData.applyVat, orderDiscountColumns, companyVatRate])

  // Recompute lock state from the current form status, not just the initial
  // status, so changing to a hard-locked status (paid/partial) immediately
  // disables editing. 'sent' is treated as a tag and no longer locks inputs.
  const hardLocked = isHardLocked(formData.status)
  const softLocked = isSoftLocked(formData.status)
  // Server action blocks everyone (incl. admins) on hard-locked docs. Only
  // converted quotes remain soft-locked for non-admins. Mirror that here so
  // the UI doesn't show editable inputs the server will reject.
  const isEditingDisabled = hardLocked || (softLocked && !isAdmin)
  // Document type can only be flipped while the document is still editable
  // and in a pre-commit state (draft or sent). Hard-locked (paid/partial)
  // documents never reach the edit tab; converted quotes are treated as
  // committed and should use the dedicated conversion flow instead.
  const canChangeType = !isEditingDisabled && ['draft', 'sent'].includes(formData.status)

  function updateForm(field: keyof typeof formData, value: string | boolean) {
    setFormData((prev) => {
      const next = { ...prev, [field]: value }

      // When the issue date changes and the due date is empty, default the due
      // date by the client's payment terms (system default 30 days).
      if (field === 'issueDate' && next.type === 'invoice' && !next.dueDate && typeof value === 'string' && value) {
        next.dueDate = addDays(value, selectedClient?.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS)
      }

      // When flipping between invoice and quotation, carry the single relevant
      // date over so the operator doesn't have to re-enter it. Invoices use a
      // due date; quotations use an expiry date.
      if (field === 'type' && typeof value === 'string') {
        if (value === 'invoice') {
          if (!next.dueDate && next.expiryDate) {
            next.dueDate = next.expiryDate
          }
        } else {
          if (!next.expiryDate && next.dueDate) {
            next.expiryDate = next.dueDate
          }
        }
      }

      return next
    })

    if (field === 'applyVat') {
      const newRate = value ? companyVatRate : 0
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          vat_rate: newRate,
        }))
      )
    }
  }

  function updateItem(index: number, field: keyof InvoiceLineItem, value: string | number) {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Per-line discount setter. Called from the DiscountInput onChange path;
  // the parser has already turned the raw text into the two nullable
  // columns, so we just need to write them and clear the other one (the
  // parser guarantees they're mutually exclusive).
  function updateItemDiscount(index: number, amount: number | null, percent: number | null) {
    setItems((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        discount_amount: amount ?? null,
        discount_percent: percent ?? null,
      }
      return updated
    })
  }

  function removeItem(index: number) {
    if (isEditingDisabled) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateDraftItem(updates: Partial<typeof draftItem>) {
    setDraftItem((prev) => ({ ...prev, ...updates }))
  }

  function resetDraftItem() {
    setDraftItem({
      product: null,
      productName: '',
      quantity: 1,
      unit: 'EA',
      price: 0,
      selectedSizeValue: '',
      selectedSizeText: '',
    })
    resetDraftInputs()
  }

  function commitDraftItem(searchRef: React.RefObject<ProductSearchRef | null>) {
    if (!draftItem.productName.trim()) return

    const newItem: ClientLineItem = {
      _clientId: nextLineItemId(),
      product_id: draftItem.product?.id || null,
      product_name: draftItem.productName,
      product_code: draftItem.product?.code,
      unit: draftItem.unit,
      quantity: draftItem.quantity,
      price: draftItem.price,
      vat_rate: formData.applyVat ? companyVatRate : 0,
      // New lines start with no discount; the operator adds one in the
      // committed row's DiscountInput.
      discount_amount: null,
      discount_percent: null,
    }

    setItems((prev) => [...prev, newItem])
    resetDraftItem()

    // Move focus back to the product field so the user can immediately enter
    // the next line.
    setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 0)
  }

  /**
   * Build the line-item product name from the consolidated product
   * name and the currently-selected size text. Returns the bare name
   * when there is no size (regular product) or when the size is empty.
   * The " · " separator mirrors the ProductVariantSelector's "Selected:"
   * line so the line item looks identical to the public PDP display.
   */
  function buildLineItemName(productName: string, sizeText: string): string {
    if (!sizeText || !sizeText.trim()) return productName
    if (productName.includes(sizeText)) return productName
    return `${productName} · ${sizeText}`
  }

  /**
   * Called when the operator picks a product from the search dropdown.
   * If the product has variants and the search query matched one of
   * them (e.g. admin typed "UB 127x76x13kg" and clicked STL-073
   * Universal Beam) the matched size is pre-baked into the line item
   * name so the invoice line reads "Universal Beam · UB 127x76x13kg".
   * Otherwise the line item gets the bare product name and the inline
   * size dropdown lets the operator pick a size before committing.
   */
  function handleDraftProductSelect(
    product: Product,
    matchedVariant: ProductSearchMatchedVariant | null | undefined,
    qtyRef: React.RefObject<HTMLInputElement | null>
  ) {
    const sizeText = matchedVariant?.text ?? ''
    const sizeValue = matchedVariant?.value ?? ''
    const productName = buildLineItemName(product.name, sizeText)
    updateDraftItem({
      product,
      productName,
      unit: product.unit,
      price: poundsToPence(product.default_price),
      selectedSizeValue: sizeValue,
      selectedSizeText: sizeText,
    })
    setTimeout(() => qtyRef.current?.focus(), 0)
  }

  /**
   * Update the selected size from the inline dropdown next to the
   * draft line. Re-bakes the line item name with the new size. If the
   * operator picks the empty placeholder value we clear the size and
   * fall back to the bare product name.
   */
  function handleDraftSizeChange(
    sizeValue: string,
    sizeText: string
  ) {
    const product = draftItem.product
    if (!product) return
    const nextSizeText = sizeValue ? sizeText : ''
    const nextSizeValue = sizeValue
    updateDraftItem({
      productName: buildLineItemName(product.name, nextSizeText),
      selectedSizeValue: nextSizeValue,
      selectedSizeText: nextSizeText,
    })
  }

  function validateForm(): string | null {
    if (!formData.clientId) return 'Please select a client'
    if (items.length === 0) return 'Please add at least one item'

    for (const item of items) {
      if (item.quantity <= 0) return 'Quantity must be greater than zero'
      if (item.price < 0) return 'Price cannot be negative'
      if (!item.product_name.trim()) return 'Product name is required for all items'
    }

    if (!formData.issueDate) return 'Issue date is required'

    // Validate the issue time string early — every other check below assumes
    // it's a well-formed HH:MM[:SS] (or empty).
    const issueMinutes = parseTime(formData.issueTime)
    if (formData.issueTime && issueMinutes === null) {
      return 'Issue time is not a valid time'
    }

    if (formData.type === 'invoice' && formData.dueDate) {
      if (formData.dueDate < formData.issueDate) {
        return 'Due date cannot be before issue date'
      }
      // Issue timestamp must fall on or before the due date. The due date
      // is date-only, so we treat it as end-of-day (23:59) — an invoice
      // issued at 17:00 on the same day as the due date is fine. We only
      // need to look at the time when the dates are the same.
      if (formData.dueDate === formData.issueDate && (issueMinutes ?? 0) > 23 * 60 + 59) {
        return 'Issue time cannot be after 23:59 on the due date'
      }
    }

    if (formData.type === 'quotation' && formData.expiryDate) {
      if (formData.expiryDate < formData.issueDate) {
        return 'Expiry date cannot be before issue date'
      }
      if (formData.expiryDate === formData.issueDate && (issueMinutes ?? 0) > 23 * 60 + 59) {
        return 'Issue time cannot be after 23:59 on the expiry date'
      }
    }

    // Reject malformed / over-cost discount text — toRowColumns would
    // otherwise silently persist an invalid input as NULL on save.
    for (const item of items) {
      const raw = discountInputs[discountInputKey(item._clientId)]
      if (!raw) continue
      const unitPricePence = Math.max(0, Math.round(item.price))
      if (parseDiscountInput(raw, { maxAmountPence: unitPricePence }).kind === 'invalid') {
        return 'Discount cannot be greater than the product cost. Fix the highlighted discount before saving.'
      }
    }
    if (
      orderDiscountRaw &&
      parseOrderDiscountInput(orderDiscountRaw, { maxAmountPence: lineSubtotalPence }).kind ===
        'invalid'
    ) {
      return 'Discount cannot be greater than the product cost. Fix the highlighted discount before saving.'
    }

    return null
  }

  function buildPreviewInvoice(documentNumber = 'PREVIEW'): InvoicePdfProps['invoice'] {
    const { items: calculatedItems, subtotal, vatTotal, total } = calculateLineTotals(
      items,
      formData.applyVat,
      {
        // The order-level discount fields live on `items.discount_amount /
        // .discount_percent` only by convention — the actual order-level
        // state is `orderDiscountColumns`. Pass them through explicitly so
        // the preview / server agree.
        discountAmountPence:
          orderDiscountColumns.discountAmount != null && orderDiscountColumns.discountAmount > 0
            ? Math.round(orderDiscountColumns.discountAmount * 100)
            : null,
        discountPercent:
          orderDiscountColumns.discountPercent != null && orderDiscountColumns.discountPercent > 0
            ? orderDiscountColumns.discountPercent
            : null,
      },
      companyVatRate
    )
    // For new docs we use the server-side operator from props and the selected
    // client's account number; for existing docs we keep the values the row was
    // created with so the preview matches what the user expects to see after
    // saving. order_number is auto-generated server-side and only exists on the
    // row post-create.
    // If a stored operator is missing/"Unknown Operator", fall back to the
    // current user's full name from settings so the document shows whoever is
    // generating it.
    const storedOperator = initialData?.operator_name
    const resolvedOperatorName =
      storedOperator && storedOperator !== 'Unknown Operator'
        ? storedOperator
        : operatorName || storedOperator || 'Unknown Operator'
    const resolvedAccountNumber =
      initialData?.account_number ?? selectedClient?.account_number ?? null
    const resolvedOrderNumber = initialData?.order_number ?? null
    const resolvedYourReference =
      formData.yourReference?.trim() || resolvedOrderNumber
    return {
      type: formData.type,
      document_number: documentNumber,
      issue_date: formData.issueDate,
      issue_time: formData.issueTime || null,
      due_date: formData.dueDate || null,
      expiry_date: formData.expiryDate || null,
      order_number: resolvedOrderNumber,
      account_number: resolvedAccountNumber,
      operator_name: resolvedOperatorName,
      your_reference: resolvedYourReference,
      notes: formData.notes || null,
      show_payment_terms: formData.showPaymentTerms,
      show_watermark: formData.showWatermark,
      // Status-stamp fields — passed through from initialData so the preview
      // matches what the saved PDF/email/public share will render. New
      // invoices (no initialData) have no status yet, so the stamp logic
      // simply returns null.
      status_stamps_enabled: initialData?.status_stamps_enabled ?? null,
      status_stamps_mode: initialData?.status_stamps_mode ?? null,
      show_paid_watermark: initialData?.show_paid_watermark ?? null,
      show_partially_paid_watermark: initialData?.show_partially_paid_watermark ?? null,
      show_overdue_watermark: initialData?.show_overdue_watermark ?? null,
      paid_by: initialData?.paid_by ?? null,
      paid_at: initialData?.paid_at ?? null,
      overdue_at: initialData?.overdue_at ?? null,
      status: initialData?.status ?? null,
      updated_at: initialData?.updated_at ?? null,
      subtotal,
      vat_total: vatTotal,
      total,
      amount_paid: 0,
      balance_due: total,
      delivery_method: formData.deliveryMethod,
      delivery_address_line_1: formData.deliveryAddressLine1 || null,
      delivery_address_line_2: formData.deliveryAddressLine2 || null,
      delivery_town: formData.deliveryTown || null,
      delivery_county: formData.deliveryCounty || null,
      delivery_postcode: formData.deliveryPostcode || null,
      // Order-level discount, surfaced onto the invoice-shaped payload so
      // the PDF and on-screen preview can render the "Discount −£X" row.
      discount_amount: orderDiscountColumns.discountAmount,
      discount_percent: orderDiscountColumns.discountPercent,
      clients: selectedClient as InvoicePdfProps['invoice']['clients'],
      invoice_items: calculatedItems,
    }
  }

  function closePreview() {
    setPreviewOpen(false)
  }

  async function handlePreview() {
    setLoading(true)
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setLoading(false)
      return
    }

    setPreviewOpen(true)
    setLoading(false)
  }

  async function confirmCreate() {
    setLoading(true)
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setLoading(false)
      return
    }

    const itemsInPounds = items.map((item) => ({
      ...item,
      price: penceToPounds(item.price),
    }))

    const data: InvoiceFormData = {
      type: formData.type as 'invoice' | 'quotation',
      client_id: formData.clientId,
      issue_date: formData.issueDate,
      issue_time: formData.issueTime || undefined,
      due_date: formData.dueDate || undefined,
      expiry_date: formData.expiryDate || undefined,
      // order_number / account_number / operator_name are server-owned and
      // intentionally not in the payload — see lib/actions/invoices.ts.
      your_reference: formData.yourReference,
      notes: formData.notes,
      status: formData.status,
      items: itemsInPounds,
      apply_vat: formData.applyVat,
      show_payment_terms: formData.showPaymentTerms,
      show_watermark: formData.showWatermark,
      delivery_method: formData.deliveryMethod as 'delivery' | 'collection',
      delivery_address_line_1: formData.deliveryAddressLine1,
      delivery_address_line_2: formData.deliveryAddressLine2,
      delivery_town: formData.deliveryTown,
      delivery_county: formData.deliveryCounty,
      delivery_postcode: formData.deliveryPostcode,
      // Order-level discount. Always sent (even as null) so a previously
      // saved discount gets cleared if the operator emptied the field.
      discount_amount: orderDiscountColumns.discountAmount,
      discount_percent: orderDiscountColumns.discountPercent,
    }

    const result = await createInvoice(data)
    setLoading(false)

    // Partial success: document may already exist (e.g. stock failed after
    // promote). Never treat that as a hard failure — that caused retries
    // and duplicate invoices.
    if (!result.invoice) {
      setError(result.error || 'Failed to create document')
      setWarning(null)
      closePreview()
      return
    }

    if (result.error) {
      setWarning(result.error)
      setError(null)
    } else {
      setWarning(null)
      setError(null)
    }

    const created = result.invoice
    const applyVat = Number(created.vat_total) > 0
    const { items: calculatedItems } = calculateLineTotals(
      items,
      applyVat,
      {
        discountAmountPence:
          orderDiscountColumns.discountAmount != null && orderDiscountColumns.discountAmount > 0
            ? Math.round(orderDiscountColumns.discountAmount * 100)
            : null,
        discountPercent:
          orderDiscountColumns.discountPercent != null && orderDiscountColumns.discountPercent > 0
            ? orderDiscountColumns.discountPercent
            : null,
      },
      companyVatRate
    )

    const invoiceForActions: InvoicePdfProps['invoice'] & { id: string } = {
      ...(created as InvoicePdfProps['invoice'] & { id: string }),
      clients: selectedClient as InvoicePdfProps['invoice']['clients'],
      invoice_items: calculatedItems,
      amount_paid: 0,
      balance_due: created.total,
    }

    setCreatedInvoice(invoiceForActions)
    closePreview()
    setActionsOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!initialData?.id) {
      await handlePreview()
      return
    }

    setLoading(true)
    setError(null)

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      setLoading(false)
      return
    }

    const itemsInPounds = items.map((item) => ({
      ...item,
      price: penceToPounds(item.price),
    }))

    const data: InvoiceFormData = {
      type: formData.type as 'invoice' | 'quotation',
      client_id: formData.clientId,
      issue_date: formData.issueDate,
      issue_time: formData.issueTime || undefined,
      due_date: formData.dueDate || undefined,
      expiry_date: formData.expiryDate || undefined,
      // order_number / account_number / operator_name are server-owned and
      // intentionally not in the payload — see lib/actions/invoices.ts.
      your_reference: formData.yourReference,
      notes: formData.notes,
      // Force the status back to what's already on the document when
      // the operator can't change it — even if the (disabled) select
      // somehow shows a stale value. The server re-validates; this just
      // makes the payload honest.
      status: canChangeStatus ? formData.status : initialData.status,
      items: itemsInPounds,
      apply_vat: formData.applyVat,
      show_payment_terms: formData.showPaymentTerms,
      show_watermark: formData.showWatermark,
      delivery_method: formData.deliveryMethod as 'delivery' | 'collection',
      delivery_address_line_1: formData.deliveryAddressLine1,
      delivery_address_line_2: formData.deliveryAddressLine2,
      delivery_town: formData.deliveryTown,
      delivery_county: formData.deliveryCounty,
      delivery_postcode: formData.deliveryPostcode,
      // Order-level discount — same as the create path: always send so a
      // cleared field becomes a cleared row.
      discount_amount: orderDiscountColumns.discountAmount,
      discount_percent: orderDiscountColumns.discountPercent,
    }

    const result = await updateInvoice(initialData.id, data)
    setLoading(false)

    // updateInvoice is transactional (migration 119): on failure nothing is
    // saved; on success the row is complete including stock reconcile.
    if (result.error || !result.invoice) {
      setError(result.error || 'Could not save changes.')
      setWarning(null)
      return
    }

    setError(null)
    setWarning(null)
    router.push('/invoices')
    router.refresh()
  }

  // Status options are derived from the shared transition table so the UI
  // can never offer a status the server will reject. For brand-new documents
  // we restrict to the small set of valid initial statuses.
  const statusOptions = initialData?.id
    ? getSelectableStatuses(formData.type as DocumentType, formData.status)
    : [...NEW_DOCUMENT_STATUSES]

  const previewInvoice = buildPreviewInvoice('PREVIEW')

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {warning && (
          <Alert>
            <AlertDescription>
              <span className="font-medium">Saved with a warning: </span>
              {warning}
            </AlertDescription>
          </Alert>
        )}

        {isEditingDisabled && (
          <Alert>
            <AlertDescription>
              {hardLocked
                ? 'This document is locked once any payment has been recorded. Edit payments instead.'
                : isAdmin
                  ? 'This document is locked.'
                  : 'This document is locked. Contact an admin to edit.'}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Document Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => canChangeType && updateForm('type', 'invoice')}
                disabled={!canChangeType}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  formData.type === 'invoice'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                  !canChangeType && 'opacity-60 cursor-not-allowed'
                )}
              >
                <FileText className="w-4 h-4" />
                Invoice
              </button>
              <button
                type="button"
                onClick={() => canChangeType && updateForm('type', 'quotation')}
                disabled={!canChangeType}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  formData.type === 'quotation'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                  !canChangeType && 'opacity-60 cursor-not-allowed'
                )}
              >
                <Quote className="w-4 h-4" />
                Quotation
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientPicker
              selectedClientId={formData.clientId}
              onSelect={(client) => {
                setSelectedClient(client.id ? client : null)
                updateForm('clientId', client.id)
                // New documents: default the due date from the selected
                // client's payment terms unless the operator already chose
                // a due date by hand.
                if (
                  !initialData &&
                  !dueDateManual &&
                  formData.type === 'invoice' &&
                  formData.issueDate &&
                  client.id
                ) {
                  updateForm(
                    'dueDate',
                    addDays(formData.issueDate, client.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS)
                  )
                }
              }}
              disabled={isEditingDisabled}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Fulfilment</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!selectedClient) return
                updateForm('deliveryMethod', 'delivery')
                updateForm('deliveryAddressLine1', selectedClient.address_line_1 || '')
                updateForm('deliveryAddressLine2', selectedClient.address_line_2 || '')
                updateForm('deliveryTown', selectedClient.town || '')
                updateForm('deliveryCounty', selectedClient.county || '')
                updateForm('deliveryPostcode', selectedClient.postcode || '')
              }}
              disabled={isEditingDisabled || !selectedClient || formData.deliveryMethod === 'collection'}
            >
              Copy from Client
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
              <button
                type="button"
                onClick={() => !isEditingDisabled && updateForm('deliveryMethod', 'delivery')}
                disabled={isEditingDisabled}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  formData.deliveryMethod === 'delivery'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                  isEditingDisabled && 'opacity-60 cursor-not-allowed'
                )}
              >
                Delivery
              </button>
              <button
                type="button"
                onClick={() => !isEditingDisabled && updateForm('deliveryMethod', 'collection')}
                disabled={isEditingDisabled}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  formData.deliveryMethod === 'collection'
                    ? 'bg-white text-red-700 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                  isEditingDisabled && 'opacity-60 cursor-not-allowed'
                )}
              >
                Collection
              </button>
            </div>

            {formData.deliveryMethod === 'collection' ? (
              <div className="p-3 border border-gray-200 rounded-lg bg-gray-50">
                <p className="text-sm text-gray-500 mb-1">Pick up from</p>
                {officeAddressLines.length > 0 ? (
                  officeAddressLines.map((line, index) => (
                    <p key={index} className="font-medium">{line}</p>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">Office address not configured</p>
                )}
              </div>
            ) : (
              <AddressAutocomplete
                idPrefix="delivery"
                value={{
                  line1: formData.deliveryAddressLine1,
                  line2: formData.deliveryAddressLine2,
                  town: formData.deliveryTown,
                  county: formData.deliveryCounty,
                  postcode: formData.deliveryPostcode,
                }}
                onChange={(next) => {
                  updateForm('deliveryAddressLine1', next.line1)
                  updateForm('deliveryAddressLine2', next.line2)
                  updateForm('deliveryTown', next.town)
                  updateForm('deliveryCounty', next.county)
                  updateForm('deliveryPostcode', next.postcode)
                }}
                disabled={isEditingDisabled}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex items-center gap-2',
                isEditingDisabled && 'opacity-60'
              )}>
                <Switch
                  checked={formData.applyVat}
                  onCheckedChange={(checked) => !isEditingDisabled && updateForm('applyVat', checked)}
                  disabled={isEditingDisabled}
                />
                <span className="text-sm text-gray-700">
                  Apply VAT ({companyVatRate}%)
                </span>
              </div>
              <div className={cn(
                'flex items-center gap-2',
                isEditingDisabled && 'opacity-60'
              )}>
                <Switch
                  checked={formData.showPaymentTerms}
                  onCheckedChange={(checked) => !isEditingDisabled && updateForm('showPaymentTerms', checked)}
                  disabled={isEditingDisabled}
                />
                <span className="text-sm text-gray-700">Show payment terms</span>
              </div>
              <div className={cn(
                'flex items-center gap-2',
                isEditingDisabled && 'opacity-60'
              )}>
                <Switch
                  checked={formData.showWatermark}
                  onCheckedChange={(checked) => !isEditingDisabled && updateForm('showWatermark', checked)}
                  disabled={isEditingDisabled}
                />
                <span className="text-sm text-gray-700">Show logo watermark</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200">
              {/* `min-w-[700px]` keeps the input columns (Price/Discount with
                  their £ glyph) from being squeezed below usability on
                  mid-width screens; `overflow-x-auto` on the wrapper
                  silently scrolls only when the parent is narrower than
                  this minimum, so on a normal desktop the scrollbar
                  disappears. */}
              <table className="w-full text-sm table-fixed min-w-[700px]">
                {/*
                  All 7 columns (including the 40 px delete column) MUST
                  be in the colgroup. If the delete col is implicit, the
                  table renders at 100% of the parent PLUS 40 px and the
                  wrapper scrolls horizontally, which previously clipped
                  the Price/Discount inputs and the search row.
                */}
                <colgroup>
                  {/* Product column was 200+px which crowded Qty (4-digit
                      quantities like 2000 were clipped to "200") and left
                      Price/Discount/VAT/Total cramped. Narrowed to 160px
                      so the numeric columns have room. */}
                  <col className="w-[160px]" />
                  {/* Qty bumped to 96px so 4-digit quantities (e.g. 2000
                      bricks) fit without being truncated by the input. */}
                  <col className="w-[96px]" />
                  <col className="w-[104px]" />
                  {/* Discount shrunk to 88px — the "£ or %" placeholder
                      and typical values (£0.50, 10%) fit comfortably and
                      the 16px goes back to Qty. */}
                  <col className="w-[88px]" />
                  <col className="w-[88px]" />
                  <col className="w-[88px]" />
                  {/* 60px = 36px trash button + 12px cell padding on
                      each side. Previously this column was implicit and
                      sized to its content, so the th's `w-10` was a
                      no-op; once the col is in the colgroup, the
                      explicit 60px width keeps the icon button from
                      being clipped at the right edge. */}
                  <col className="w-[60px]" />
                </colgroup>
                <thead>
                  <tr className="border-b bg-gray-50/70">
                    <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Product</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Qty</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Price</th>
                    <th className="text-left py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Discount</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">VAT</th>
                    <th className="text-right py-2.5 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Total</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const lineVatPence = perLine[index]?.vatPence ?? 0
                    const lineTotalPence = perLine[index]?.totalPence ?? 0
                    const lineNetPostPence = perLine[index]?.netPostPence ?? 0
                    const lineDiscountPence = perLine[index]?.discountPence ?? 0
                    return (
                      <tr key={item._clientId} className="border-b last:border-0 transition-colors hover:bg-gray-50/50">
                        <td className="py-2 px-3">
                          <Input
                            value={item.product_name}
                            onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                            disabled={isEditingDisabled}
                            className="text-sm h-9"
                          />
                          {item.product_code && (
                            <span className="text-xs text-gray-500 mt-0.5 block">{item.product_code}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={itemInputs[itemInputKey(item._clientId, 'quantity')] ?? item.quantity}
                            onChange={(e) => updateExistingQuantity(index, e.target.value)}
                            disabled={isEditingDisabled}
                            className="text-sm h-9 w-full"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <MoneyInput
                            valuePence={item.price}
                            onChangePence={(pence) => updateExistingPrice(index, pence)}
                            disabled={isEditingDisabled}
                            inputClassName="text-sm h-9 w-full"
                            placeholder="0.00"
                            aria-label={`Price for ${item.product_name}`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <DiscountInput
                            size="sm"
                            mode="line"
                            value={discountInputs[discountInputKey(item._clientId)] ?? ''}
                            onChange={(raw) => updateExistingDiscount(index, raw)}
                            quantity={item.quantity}
                            lineNetPence={lineNetPostPence + lineDiscountPence}
                            disabled={isEditingDisabled}
                          />
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-700">{formatCurrency(lineVatPence / 100)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium text-gray-900">{formatCurrency(lineTotalPence / 100)}</td>
                        <td className="py-2 px-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                            disabled={isEditingDisabled}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 h-9 w-9 p-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}

                  <tr className="border-b last:border-0 bg-gray-50/40">
                    <td className="py-2 px-3">
                      <ProductSearch
                        ref={productSearchRef}
                        value={draftItem.productName}
                        onChange={(value) => updateDraftItem({ productName: value })}
                        onSelect={(product, matchedVariant) => handleDraftProductSelect(product, matchedVariant, draftQtyRef)}
                        onSubmit={() => {
                          if (draftItem.productName.trim()) {
                            draftQtyRef.current?.focus()
                          }
                        }}
                        disabled={isEditingDisabled}
                        placeholder="Search product..."
                      />
                      {/* Inline size dropdown for variant products. Renders
                          under the search input so the cell width stays
                          unchanged. Only shown when the picked product
                          has at least one selector with options. */}
                      {draftItem.product?.variantOptions && draftItem.product.variantOptions.length > 0 && (
                        <DraftSizeSelector
                          product={draftItem.product}
                          selectedSizeValue={draftItem.selectedSizeValue}
                          onChange={handleDraftSizeChange}
                          disabled={isEditingDisabled}
                        />
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <Input
                        ref={draftQtyRef}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={itemInputs['draft:quantity'] ?? draftItem.quantity}
                        onChange={(e) => updateDraftQuantity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault()
                            productSearchRef.current?.focus()
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault()
                            draftPriceRef.current?.focus()
                          }
                        }}
                        disabled={isEditingDisabled}
                        className="text-sm h-9 w-full"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <MoneyInput
                        ref={draftPriceRef}
                        valuePence={draftItem.price}
                        onChangePence={updateDraftPrice}
                        disabled={isEditingDisabled}
                        inputClassName="text-sm h-9 w-full"
                        placeholder="0.00"
                        aria-label="Price"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                            e.preventDefault()
                            commitDraftItem(productSearchRef)
                          } else if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault()
                            draftQtyRef.current?.focus()
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3 text-right text-gray-400">—</td>
                    <td className="py-2 px-3"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Quick-add affordance: lets staff create a temporary product
                inline when the typed name doesn't match anything in the
                catalogue. The "+ New product" button mirrors the ClientPicker
                pattern below. */}
            <div className="mt-3">
              <QuickProductAdder
                disabled={isEditingDisabled}
                onCreated={(product) => {
                  handleDraftProductSelect(product, null, draftQtyRef)
                }}
              />
            </div>

            {/* Mobile card layout */}
            <div className="md:hidden space-y-3">
              {items.map((item, index) => {
                const lineVatPence = perLine[index]?.vatPence ?? 0
                const lineTotalPence = perLine[index]?.totalPence ?? 0
                const lineNetPostPence = perLine[index]?.netPostPence ?? 0
                const lineDiscountPence = perLine[index]?.discountPence ?? 0
                return (
                  <div key={item._clientId} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Product</label>
                        <Input
                          value={item.product_name}
                          onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                          disabled={isEditingDisabled}
                          className="mt-1 h-10"
                        />
                        {item.product_code && (
                          <span className="text-xs text-gray-500 mt-0.5 block">{item.product_code}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Qty</label>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0"
                            value={itemInputs[itemInputKey(item._clientId, 'quantity')] ?? item.quantity}
                            onChange={(e) => updateExistingQuantity(index, e.target.value)}
                            disabled={isEditingDisabled}
                            className="mt-1 h-10"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Price</label>
                          <MoneyInput
                            valuePence={item.price}
                            onChangePence={(pence) => updateExistingPrice(index, pence)}
                            disabled={isEditingDisabled}
                            inputClassName="h-10"
                            placeholder="0.00"
                            aria-label={`Price for ${item.product_name}`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Discount</label>
                        <DiscountInput
                          mode="line"
                          value={discountInputs[discountInputKey(item._clientId)] ?? ''}
                          onChange={(raw) => updateExistingDiscount(index, raw)}
                          quantity={item.quantity}
                          lineNetPence={lineNetPostPence + lineDiscountPence}
                          disabled={isEditingDisabled}
                          className="mt-1"
                          placeholder="£/item or %"
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                        <div className="text-gray-600">
                          VAT: <span className="font-medium text-gray-700">{formatCurrency(lineVatPence / 100)}</span>
                        </div>
                        <div className="text-gray-900 font-semibold">
                          Total: {formatCurrency(lineTotalPence / 100)}
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          disabled={isEditingDisabled}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-40 h-10 px-3"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}

              <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-3">Add new item</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Product</label>
                    <ProductSearch
                      ref={mobileProductSearchRef}
                      value={draftItem.productName}
                      onChange={(value) => updateDraftItem({ productName: value })}
                      onSelect={(product, matchedVariant) => handleDraftProductSelect(product, matchedVariant, mobileDraftQtyRef)}
                      onSubmit={() => {
                        if (draftItem.productName.trim()) {
                          mobileDraftQtyRef.current?.focus()
                        }
                      }}
                      disabled={isEditingDisabled}
                      placeholder="Search product..."
                    />
                    {draftItem.product?.variantOptions && draftItem.product.variantOptions.length > 0 && (
                      <div className="mt-2">
                        <DraftSizeSelector
                          product={draftItem.product}
                          selectedSizeValue={draftItem.selectedSizeValue}
                          onChange={handleDraftSizeChange}
                          disabled={isEditingDisabled}
                        />
                      </div>
                    )}
                  </div>

                  <QuickProductAdder
                    disabled={isEditingDisabled}
                    onCreated={(product) => {
                      handleDraftProductSelect(product, null, mobileDraftQtyRef)
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Qty</label>
                      <Input
                        ref={mobileDraftQtyRef}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={itemInputs['draft:quantity'] ?? draftItem.quantity}
                        onChange={(e) => updateDraftQuantity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault()
                            mobileProductSearchRef.current?.focus()
                          } else if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault()
                            mobileDraftPriceRef.current?.focus()
                          }
                        }}
                        disabled={isEditingDisabled}
                        className="mt-1 h-10"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-gray-500">Price</label>
                      <MoneyInput
                        ref={mobileDraftPriceRef}
                        valuePence={draftItem.price}
                        onChangePence={updateDraftPrice}
                        disabled={isEditingDisabled}
                        inputClassName="h-10"
                        placeholder="0.00"
                        aria-label="Price"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                            e.preventDefault()
                            commitDraftItem(mobileProductSearchRef)
                          } else if (e.key === 'Tab' && e.shiftKey) {
                            e.preventDefault()
                            mobileDraftQtyRef.current?.focus()
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {items.length === 0 && (
              <p className="text-sm text-gray-500">
                Use the row above to add products. Type to search the catalogue or enter a custom item.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Document Details</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls="document-details-content"
              aria-label={detailsOpen ? 'Hide document details' : 'Show document details'}
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', detailsOpen && 'rotate-180')} />
            </Button>
          </CardHeader>
          {detailsOpen && (
            <CardContent id="document-details-content" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue Date *</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={formData.issueDate}
                  onChange={(e) => updateForm('issueDate', e.target.value)}
                  disabled={isEditingDisabled}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueTime">Issue Time</Label>
                <Input
                  id="issueTime"
                  type="time"
                  value={formData.issueTime}
                  onChange={(e) => updateForm('issueTime', e.target.value)}
                  disabled={isEditingDisabled}
                  // Hint shown when the issue date and due/expiry date match
                  // — same-day invoices just need the time to be valid HH:MM.
                  title="Time the invoice was issued. Used in the PDF & public view."
                />
              </div>
              {formData.type === 'invoice' && (
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => {
                      setDueDateManual(true)
                      updateForm('dueDate', e.target.value)
                    }}
                    disabled={isEditingDisabled}
                  />
                </div>
              )}
              {formData.type === 'quotation' && (
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) => updateForm('expiryDate', e.target.value)}
                    disabled={isEditingDisabled}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => updateForm('status', e.target.value)}
                  // isEditingDisabled covers hard-locked (paid/partial)
                  // and converted-quote soft-locked cases. !canChangeStatus
                  // covers the permission case — staff with edit access but
                  // no status-change access.
                  disabled={isEditingDisabled || !canChangeStatus}
                  className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getDocumentStatusLabel(status)}
                    </option>
                  ))}
                </select>
                {!canChangeStatus && initialData?.id && (
                  <p className="text-xs text-muted-foreground">
                    You don&apos;t have permission to change document status.
                    Ask an administrator.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="yourReference">Your Reference</Label>
                <Input
                  id="yourReference"
                  type="text"
                  value={formData.yourReference}
                  onChange={(e) => updateForm('yourReference', e.target.value)}
                  disabled={isEditingDisabled}
                  placeholder="Auto-fills with order number if left blank"
                />
              </div>
              <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  disabled={isEditingDisabled}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="space-y-2 max-w-full sm:max-w-xs ml-auto">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium tabular-nums">{formatCurrency(totals.subtotal_pre_discount)}</span>
              </div>
              {/* Order-level discount. The DiscountInput accepts £ or % and
                  shows a live −£X preview line below. Sits above Subtotal
                  (visually) so it reads as "less from the subtotal". */}
              <div className="flex items-center justify-between text-sm gap-2">
                <span className="text-gray-600">Discount</span>
                <DiscountInput
                  mode="order"
                  value={orderDiscountRaw}
                  onChange={setOrderDiscountRaw}
                  showPreview={false}
                  lineNetPence={lineSubtotalPence}
                  disabled={isEditingDisabled}
                  placeholder="£ or %"
                  size="sm"
                />
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-xs text-gray-500 -mt-1 pl-1">
                  <span>applied</span>
                  <span className="tabular-nums">−{formatCurrency(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Net (post-discount)</span>
                <span className="font-medium tabular-nums">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">VAT Total</span>
                <span className="font-medium tabular-nums">{formatCurrency(totals.vatTotal)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t border-gray-200 pt-3 mt-2">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900 tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || isEditingDisabled} size="lg">
            {loading ? 'Saving...' : initialData?.id ? 'Update Document' : 'Create Document'}
          </Button>
          <Link href="/invoices">
            <Button type="button" variant="outline" size="lg">
              Cancel
            </Button>
          </Link>
        </div>
      </form>

      <Dialog open={previewOpen} onOpenChange={(open) => { if (!open) closePreview() }} className="max-w-4xl p-0 overflow-hidden h-[90vh] flex flex-col">
        <DialogContent className="p-0 flex flex-col h-full [&>*+*]:mt-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Preview {formData.type === 'quotation' ? 'Quotation' : 'Invoice'}</DialogTitle>
          </DialogHeader>
          <DialogClose onClick={closePreview} />
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-gray-100">
            <ScaledInvoiceDocument
              invoice={previewInvoice}
              company={company}
              bankDetails={bankDetails}
              logoSrc={logoSrc}
              operatorName={operatorName ?? undefined}
            />
          </div>
          <div className="px-6 py-4 border-t flex flex-col-reverse sm:flex-row gap-3 justify-end shrink-0 bg-card">
            <Button type="button" variant="outline" onClick={closePreview} size="lg">
              Back to Edit
            </Button>
            <Button type="button" onClick={confirmCreate} disabled={loading} size="lg">
              {loading ? 'Creating…' : `Create ${formData.type === 'quotation' ? 'Quotation' : 'Invoice'}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {createdInvoice && (
        <InvoiceCreatedActions
          invoice={createdInvoice}
          company={company}
          bankDetails={bankDetails}
          logoSrc={logoSrc}
          open={actionsOpen}
          canSendEmail={canSendEmail}
          onBackToEdit={() => router.push(`/invoices/${createdInvoice.id}`)}
          onDone={() => {
            setActionsOpen(false)
            router.push('/invoices')
            router.refresh()
          }}
        />
      )}
    </>
  )
}
