'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  NEW_DOCUMENT_STATUSES,
  isValidStatusTransition,
  normalizeStatus,
} from '@/lib/invoice-status'
import { getDocumentPrefixes } from '@/lib/document-prefixes'
import { isAdminUser } from '@/lib/supabase/access'
import { canSeeInvoiceMoney, resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import {
  calculateDocumentTotalsPence,
  normalizeVatRatePercent,
  penceToPounds,
  poundsToPence,
  VAT_RATE_PERCENTAGE,
} from '@/lib/vat'
import { getCompanyDefaultVatRate } from '@/lib/company-vat'
import { DEFAULT_PAYMENT_TERMS_DAYS } from '@/lib/client-credit'
import { buildClientSearchFilter, sanitizeLikeTerm } from '@/lib/search'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/ip'
import { loadCompany } from '@/lib/company'
import { reauthThenSoftDeleteRpc } from '@/lib/actions/soft-delete-rpc'
import {
  findPublicInvoiceByToken,
  getShareAccessForMode,
  type ShareDocumentMode,
} from '@/lib/share/public-invoice-lookup'
import { getPaymentBlockedInvoices } from '@/lib/actions/picker'
import { generateShareKey, isLegacyShareToken, isShareKey } from '@/lib/share/share-key'
import {
  generateSharePassword,
  hashSharePassword,
  verifySharePassword,
} from '@/lib/share/share-password'

const SHARE_LINK_TTL_DAYS = 7

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000
}

function shareLinkExpiry(): string {
  const d = new Date()
  d.setDate(d.getDate() + SHARE_LINK_TTL_DAYS)
  d.setMilliseconds(0)
  return d.toISOString()
}

export interface InvoiceLineItem {
  product_id?: string | null
  product_name: string
  product_code?: string
  unit?: string
  quantity: number
  price: number
  vat_rate: number
  // Manual per-line discount. Stored in pounds on the form (matches the DB
  // numeric(12,2) column) and percent as a percentage (10 == 10%). The
  // lib/vat.ts calculator interprets `discount_amount` as PER-UNIT when
  // it's a per-line discount; the order-level discount in InvoiceFormData
  // is a flat £ amount.
  // Only one of (discount_amount, discount_percent) is set per row — the
  // DB CHECK constraint enforces this.
  discount_amount?: number | null
  discount_percent?: number | null
}

export interface InvoiceFormData {
  type: 'invoice' | 'quotation'
  client_id: string
  issue_date: string
  issue_time?: string
  due_date?: string
  expiry_date?: string
  order_number?: string
  account_number?: string
  operator_name?: string
  your_reference?: string
  notes?: string
  status?: string
  items: InvoiceLineItem[]
  apply_vat: boolean
  show_payment_terms?: boolean
  show_watermark?: boolean
  // Status-driven rubber-stamp toggles (migration 103). Each is
  // independent — operators can opt out of any single stamp type.
  show_paid_watermark?: boolean
  show_partially_paid_watermark?: boolean
  show_overdue_watermark?: boolean
  delivery_method?: 'delivery' | 'collection'
  delivery_address_line_1?: string
  delivery_address_line_2?: string
  delivery_town?: string
  delivery_county?: string
  delivery_postcode?: string
  // Order-level discount applied once to the post-line-discount subtotal.
  // See INVOICE_DISCOUNTS_PLAN.md §3. Pounds (matches numeric(12,2)) or
  // percent. Mutually exclusive (DB CHECK enforces it).
  discount_amount?: number | null
  discount_percent?: number | null
}

interface UpdateInvoiceRpcPayload {
  client_id: string
  type?: 'invoice' | 'quotation'
  document_number?: string
  issue_date: string
  issue_time: string
  due_date: string | null
  expiry_date: string | null
  your_reference: string | null
  notes: string | null
  show_payment_terms?: boolean
  show_watermark?: boolean
  show_paid_watermark?: boolean
  show_partially_paid_watermark?: boolean
  show_overdue_watermark?: boolean
  status: string
  delivery_method: 'delivery' | 'collection'
  delivery_address_line_1: string | null
  delivery_address_line_2: string | null
  delivery_town: string | null
  delivery_county: string | null
  delivery_postcode: string | null
  // Order-level discount — both fields optional. The RPC treats a present
  // (even empty-string) key as "write the new value"; an absent key leaves
  // the existing column untouched.
  discount_amount?: number | string | null
  discount_percent?: number | string | null
  subtotal: number
  vat_total: number
  total: number
  items: Array<{
    product_id: string | null
    product_name: string
    product_code: string | null
    unit: string
    quantity: number
    price: number
    vat_rate: number
    vat_amount: number
    line_total: number
    // Per-line discount values (pounds for amount, percent for percent).
    discount_amount?: number | null
    discount_percent?: number | null
  }>
  account_number?: string | null
}

/**
 * Reject discounts that exceed product cost:
 *  - per-line £ discount (per unit) must be ≤ unit price
 *  - order-level £ discount must be ≤ post-line-discount subtotal
 * Percent discounts are already capped at 100% by the parser/DB.
 */
function validateDiscountCaps(
  items: InvoiceLineItem[],
  orderLevel?: { discount_amount?: number | null; discount_percent?: number | null } | null
): string | null {
  for (const item of items) {
    const unitPrice = Number(item.price) || 0
    const disc = item.discount_amount
    if (disc != null && disc > 0 && disc > unitPrice + 1e-9) {
      return `Discount on "${item.product_name}" cannot be greater than the product cost (£${unitPrice.toFixed(2)}).`
    }
  }

  // Approximate post-line-discount subtotal for the order-level cap.
  let subtotal = 0
  for (const item of items) {
    const qty = Number(item.quantity) || 0
    const price = Number(item.price) || 0
    let lineNet = qty * price
    if (item.discount_percent != null && item.discount_percent > 0) {
      lineNet -= (lineNet * Math.min(100, item.discount_percent)) / 100
    } else if (item.discount_amount != null && item.discount_amount > 0) {
      lineNet -= Math.min(lineNet, item.discount_amount * qty)
    }
    subtotal += Math.max(0, lineNet)
  }
  const orderDisc = orderLevel?.discount_amount
  if (orderDisc != null && orderDisc > 0 && orderDisc > subtotal + 1e-9) {
    return `Order discount cannot be greater than the product cost (£${subtotal.toFixed(2)}).`
  }
  return null
}

function calculateTotals(
  items: InvoiceLineItem[],
  orderLevel?: { discount_amount?: number | null; discount_percent?: number | null } | null,
  options?: { applyVat?: boolean; documentVatRate?: number }
) {
  const applyVat = options?.applyVat !== false
  const documentVatRate = normalizeVatRatePercent(
    options?.documentVatRate,
    VAT_RATE_PERCENTAGE
  )
  const result = calculateDocumentTotalsPence(
    items.map((item) => ({
      quantity: item.quantity,
      pricePence: poundsToPence(item.price),
      vat_rate: applyVat ? normalizeVatRatePercent(item.vat_rate, documentVatRate) : 0,
      discountAmountPence:
        item.discount_amount != null && item.discount_amount > 0
          ? poundsToPence(item.discount_amount)
          : null,
      discountPercent:
        item.discount_percent != null && item.discount_percent > 0
          ? item.discount_percent
          : null,
    })),
    {
      applyVat,
      documentVatRate,
      orderDiscount: orderLevel
        ? {
            amountPence:
              orderLevel.discount_amount != null && orderLevel.discount_amount > 0
                ? poundsToPence(orderLevel.discount_amount)
                : null,
            percent:
              orderLevel.discount_percent != null && orderLevel.discount_percent > 0
                ? orderLevel.discount_percent
                : null,
          }
        : null,
    }
  )

  return {
    items: result.items.map((calculated, index) => ({
      ...items[index],
      vat_amount: penceToPounds(calculated.vat_amount_pence),
      line_total: penceToPounds(calculated.line_total_pence),
      // Expose the per-line net after the discount so the caller can show
      // the "discounted net" alongside line total if it wants to.
      line_net_post_discount: penceToPounds(calculated.line_net_post_discount_pence),
      line_discount: penceToPounds(calculated.line_discount_pence),
    })),
    subtotal: result.subtotal,
    subtotal_pre_discount: result.subtotal_pre_discount,
    order_discount: result.discount,
    vatTotal: result.vatTotal,
    total: result.total,
  }
}

function sanitizeSearchTerm(term: string): string {
  // Supabase .or() / .ilike() treat % and _ as wildcards and use , () as
  // PostgREST filter separators. Strip all of these to prevent filter
  // injection and keep searches behaving like plain text.
  return term.replace(/[\\"'%_(),]/g, '').trim()
}

// Extract a UUID v4 share token from a raw string. This accepts both the bare
// token and a full public URL such as https://starhawkbm.com/invoice/<token>.
const SHARE_TOKEN_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function extractShareToken(term: string): string | null {
  const match = term.match(SHARE_TOKEN_RE)
  return match ? match[0].toLowerCase() : null
}

// Try to delete a row, retrying on transient errors. Returns true if the
// row is gone, false if every attempt failed. Used as the rollback path
// when a multi-step create (invoice header + line items, or quote → invoice
// conversion) inserts the parent row but a child step fails. Without the
// retry, a single network blip leaves an orphan invoice that the operator
// has to clean up by hand.
async function bestEffortDelete(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: 'invoices',
  id: string
): Promise<boolean> {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: deleted, error } = await supabase.rpc('hard_delete_draft_invoice', {
      p_invoice_id: id,
    })
    if (!error && deleted) return true
    if (attempt < maxAttempts) {
      // Brief linear backoff (50ms, 150ms) — short enough that the user
      // still gets a fast error response, long enough to ride out a
      // typical Supabase transient blip.
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt * attempt))
    } else {
      console.error(
        `[bestEffortDelete] Gave up deleting ${table}/${id} after ${maxAttempts} attempts: ${error?.message ?? 'not a deletable draft'}`
      )
    }
  }
  return false
}

// 6-digit order number used as a per-document customer-facing reference. Kept
// here (not in lib/utils) because the form no longer surfaces it — the value
// is assigned server-side at create-time.
//
// Atomically allocated via public.generate_unique_order_number() (see
// supabase/migrations/024_data_integrity_hardening.sql) which row-locks the
// order_number_sequence table. Two concurrent invoices always get distinct
// numbers — the previous Math.random() approach could silently persist
// duplicates because there was no UNIQUE constraint on invoices.order_number.
async function generateOrderNumber(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data, error } = await supabase.rpc('generate_unique_order_number')
  if (error || !data) return null
  return String(data)
}

// Pulls the operator's display name off the active user's profile. The invoice
// form no longer exposes this field, so the server is the single source of
// truth for "who is creating this document". We intentionally do NOT fall back
// to the email local-part, because that leaks raw email stubs like "bir.prabh"
// onto customer-facing documents.
async function getOperatorContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  const operatorName = profile?.full_name || 'Unknown Operator'

  return { operatorName }
}

// Returns the client's account_number for stamping onto an invoice.
async function getClientAccountNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string
): Promise<string | null> {
  const { data: client } = await supabase
    .from('clients')
    .select('account_number')
    .eq('id', clientId)
    .maybeSingle()
  return client?.account_number ?? null
}

// The client's payment terms in days — drives the invoice due date.
// NULL / missing client falls back to the system default (30).
async function getClientPaymentTermsDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string
): Promise<number> {
  const { data: client } = await supabase
    .from('clients')
    .select('payment_terms_days')
    .eq('id', clientId)
    .maybeSingle()
  return client?.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS
}

// Compute a due date `termsDays` after the issue date (client payment terms,
// default 30). Returns null if issue_date is missing or invalid.
function computeDueDate(issueDate: string | undefined, termsDays: number = DEFAULT_PAYMENT_TERMS_DAYS): string | null {
  if (!issueDate) return null
  const d = new Date(issueDate)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + termsDays)
  return d.toISOString().split('T')[0]
}

function parseISODate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function validateDocumentDates(
  type: 'invoice' | 'quotation',
  issueDate: string,
  dueDate: string | undefined,
  expiryDate: string | undefined
): { ok: true } | { ok: false; error: string } {
  const issue = parseISODate(issueDate)
  if (!issue) {
    return { ok: false, error: 'Issue date is required and must be a valid date.' }
  }

  if (type === 'invoice') {
    const due = parseISODate(dueDate)
    if (due && due < issue) {
      return { ok: false, error: 'Due date cannot be earlier than the issue date.' }
    }
  } else {
    const expiry = parseISODate(expiryDate)
    if (expiry && expiry < issue) {
      return { ok: false, error: 'Expiry date cannot be earlier than the issue date.' }
    }
  }

  return { ok: true }
}

// Verify the caller can use this client_id on an invoice/quote.
// Returns:
//   - { ok: true }                                 — caller created the client, or is admin
//   - { ok: false, reason: 'not_found' }           — client doesn't exist (or RLS hid it)
//   - { ok: false, reason: 'forbidden' }           — client exists but belongs to another operator
//
// This used to return a bare boolean that only checked existence, which let
// any authenticated user attach an invoice to any client row in the system
// (cross-tenant data injection). Now we also enforce ownership.
async function verifyClientOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  userId: string,
  options: { allowAnyClient?: boolean } = {}
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'forbidden' }> {
  if (!clientId) return { ok: false, reason: 'not_found' }

  // Staff with the document-creation permission may invoice any client, not
  // just clients they personally created. Use the admin client to verify
  // existence because the caller's RLS-scoped client may not see every row.
  if (options.allowAnyClient) {
    const admin = createAdminClient()
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!client) return { ok: false, reason: 'not_found' }
    return { ok: true }
  }

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, created_by')
    .eq('id', clientId)
    .maybeSingle()

  if (error || !client) return { ok: false, reason: 'not_found' }

  if (client.created_by !== userId) {
    const admin = await isAdmin(supabase, userId)
    if (!admin) return { ok: false, reason: 'forbidden' }
  }
  return { ok: true }
}

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  return isAdminUser(supabase, userId)
}

export async function createInvoice(data: InvoiceFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Creation is gated by the invoices_add permission. Admins always
  // pass; staff pass only when the admin explicitly granted the
  // toggle in Settings. Default off — protects against staff creating
  // documents the business doesn't want them to issue.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions, full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_add) {
    return { error: 'Your account is not allowed to create documents. Ask an administrator.' }
  }

  if (!data.client_id) {
    return { error: 'Client is required' }
  }

  const clientCheck = await verifyClientOwnership(supabase, data.client_id, user.id, {
    allowAnyClient: perms.invoices_add,
  })
  if (!clientCheck.ok) {
    if (clientCheck.reason === 'forbidden') {
      return { error: 'You can only create documents for clients you created.' }
    }
    return { error: 'Invalid client' }
  }

  if (!data.items || data.items.length === 0) {
    return { error: 'At least one item is required' }
  }

  if (!['invoice', 'quotation'].includes(data.type)) {
    return { error: 'Invalid document type' }
  }

  const dateValidation = validateDocumentDates(data.type, data.issue_date, data.due_date, data.expiry_date)
  if (!dateValidation.ok) {
    return { error: dateValidation.error }
  }

  const prefixes = await getDocumentPrefixes()
  const prefix = data.type === 'invoice' ? prefixes.invoicePrefix : prefixes.quotationPrefix
  const { data: docNumber, error: docError } = await supabase.rpc('generate_document_number', {
    doc_prefix: prefix,
  })

  if (docError || !docNumber) {
    return { error: docError?.message || 'Failed to generate document number' }
  }

  const orderNumber = await generateOrderNumber(supabase)
  if (!orderNumber) {
    return { error: 'Failed to allocate an order number. Please try again.' }
  }

  // operator_name is server-owned. account_number now comes from the client.
  const { operatorName } = await getOperatorContext(supabase, user.id)
  const clientAccountNumber = await getClientAccountNumber(supabase, data.client_id)
  const clientTermsDays = await getClientPaymentTermsDays(supabase, data.client_id)

  const dueDate = data.type === 'invoice' ? data.due_date?.trim() || computeDueDate(data.issue_date, clientTermsDays) : null
  const expiryDate = data.type === 'quotation' ? data.expiry_date?.trim() || computeDueDate(data.issue_date) : null
  const yourReference = data.your_reference?.trim() || orderNumber

  const discountError = validateDiscountCaps(data.items, {
    discount_amount: data.discount_amount ?? null,
    discount_percent: data.discount_percent ?? null,
  })
  if (discountError) {
    return { error: discountError }
  }

  const documentVatRate = await getCompanyDefaultVatRate()
  const applyVat = Boolean(data.apply_vat)
  const { items, subtotal, vatTotal, total } = calculateTotals(
    data.items.map((item) => ({
      ...item,
      vat_rate: applyVat ? documentVatRate : 0,
    })),
    {
      discount_amount: data.discount_amount ?? null,
      discount_percent: data.discount_percent ?? null,
    },
    { applyVat, documentVatRate }
  )

  const requestedStatus = normalizeStatus(data.status || 'sent')
  // New documents can only start as draft or sent.
  if (!NEW_DOCUMENT_STATUSES.includes(requestedStatus as (typeof NEW_DOCUMENT_STATUSES)[number])) {
    return { error: 'Invalid status for a new document' }
  }

  // Always insert as draft first so a failed line-item insert can be hard-
  // deleted via hard_delete_draft_invoice (draft-only + orphan paths).
  // Promote to `sent` (and enable sharing / stock) only after items land.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      type: data.type,
      document_number: docNumber,
      client_id: data.client_id,
      issue_date: data.issue_date,
      issue_time: data.issue_time || null,
      due_date: dueDate,
      expiry_date: expiryDate,
      // order_number is auto-generated server-side. account_number comes from
      // the client record. The numbers are allocated atomically so concurrent
      // invoices never collide.
      order_number: orderNumber,
      account_number: clientAccountNumber,
      operator_name: operatorName,
      your_reference: yourReference,
      notes: data.notes?.trim() || null,
      show_payment_terms: data.show_payment_terms === true,
      // Default the watermark to ON for new invoices (column default is also
      // true), honouring the user's preference for "set it through by default".
      show_watermark: data.show_watermark !== false,
      // The three status-stamp toggles (PAID / PARTIALLY PAID / OVERDUE)
      // are NOT managed by the invoice form — they live in the actions
      // card via InvoiceWatermarkSettings, which calls
      // `toggleInvoiceWatermarks` directly. We deliberately omit them
      // here so the column DEFAULT (true) applies on create and they stay
      // out of the form's update path. Operators who flip a stamp off
      // via the actions card will NOT see it reset when the form is saved.
      status: 'draft',
      delivery_method: data.delivery_method || 'delivery',
      share_token: randomUUID(),
      share_token_created_at: new Date().toISOString(),
      public_share_enabled: false,
      delivery_note_share_enabled: false,
      share_token_expires_at: null,
      public_share_key: null,
      delivery_address_line_1: data.delivery_address_line_1?.trim() || null,
      delivery_address_line_2: data.delivery_address_line_2?.trim() || null,
      delivery_town: data.delivery_town?.trim() || null,
      delivery_county: data.delivery_county?.trim() || null,
      delivery_postcode: data.delivery_postcode?.trim().toUpperCase() || null,
      // Order-level discount. Persisted as-is from the payload (already
      // validated in the form's parser). DB CHECK enforces one-of-(amount,
      // percent) + bounds, so we don't need to revalidate here.
      discount_amount: data.discount_amount ?? null,
      discount_percent: data.discount_percent ?? null,
      subtotal,
      vat_total: vatTotal,
      total,
      amount_paid: 0,
      created_by: user.id,
    })
    .select()
    .single()

  if (invoiceError) {
    return { error: safeActionError('invoices.createInvoice', invoiceError, 'Could not save the invoice.') }
  }

  const lineItemsToInsert = items.map((item, index) => ({
    invoice_id: invoice.id,
    product_id: item.product_id || null,
    product_name: item.product_name,
    product_code: item.product_code || null,
    unit: item.unit || 'EA',
    quantity: roundQty(item.quantity),
    price: item.price,
    vat_rate: item.vat_rate,
    vat_amount: item.vat_amount,
    line_total: item.line_total,
    // Per-line discount values (pounds for amount, percent for percent).
    // `?? null` so a missing / undefined becomes a SQL NULL, not the empty
    // string that would trip the (numeric) cast.
    discount_amount: item.discount_amount ?? null,
    discount_percent: item.discount_percent ?? null,
    sort_order: index,
  }))

  const { error: itemsError } = await supabase.from('invoice_items').insert(lineItemsToInsert)

  if (itemsError) {
    // The parent invoice was inserted as draft but its line items failed.
    // hard_delete_draft_invoice can remove it cleanly.
    const cleaned = await bestEffortDelete(supabase, 'invoices', invoice.id)
    if (!cleaned) {
      console.error(
        `[createInvoice] ORPHAN invoice ${invoice.id} for client ${data.client_id} ` +
          `left after failed item insert. Manual cleanup required. ` +
          `Original error: ${itemsError.message}`
      )
    }
    return { error: itemsError.message }
  }

  let finalInvoice = invoice

  // Promote draft → requested status only after line items exist.
  if (requestedStatus === 'sent') {
    const { data: promoted, error: promoteError } = await supabase
      .from('invoices')
      .update({
        status: 'sent',
        // Enable both document links on send so existing "share after send"
        // behaviour is preserved; operators can turn either off independently.
        public_share_enabled: true,
        delivery_note_share_enabled: true,
        share_token_expires_at: shareLinkExpiry(),
        public_share_key: generateShareKey(),
        share_token_created_at: new Date().toISOString(),
      })
      .eq('id', invoice.id)
      .is('deleted_at', null)
      .select()
      .single()

    if (promoteError || !promoted) {
      console.error('createInvoice promote-to-sent failed:', promoteError)
      return {
        error:
          promoteError?.message ||
          'Document was saved as a draft but could not be marked as sent. Open it and change the status.',
        invoice,
      }
    }
    finalInvoice = promoted

    // Stock deduction + low-stock alerts are handled by the
    // invoices_stock_status_trigger on the status change above (migration
    // 130: handle_invoice_stock_on_status_change runs deduct_invoice_stock
    // and raise_low_stock_alerts inside the same transaction). A previous
    // version also called deduct_invoice_stock manually here — a second,
    // uncoordinated deduction path that only stayed correct because the RPC
    // guards on stock_deducted = 0. The trigger is now the single owner, so
    // any deduction failure surfaces as promoteError above and rolls the
    // status change back atomically.
  }

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { invoice: finalInvoice }
}

export async function updateInvoice(id: string, data: InvoiceFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Editing is gated by the invoices_edit permission. Admins always
  // pass; staff pass when the admin explicitly granted the toggle.
  // Default off — most staff just read or record payments.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_edit) {
    return { error: 'Your account is not allowed to edit documents. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }

  // Staff with invoices_edit may update any document; owners always can;
  // others are denied. Mirrors migration 151 update_invoice_with_items auth.
  if (existing.created_by !== user.id && !isAdminUserRow && !perms.invoices_edit) {
    return { error: 'Not authorized' }
  }

  // Document type can be changed while the document is still in a pre-commit
  // state (draft or sent) and no money has been recorded. Converted quotes
  // should stay as quotations and use the dedicated conversion flow.
  const normalizedExistingStatus = normalizeStatus(existing.status)
  if (existing.type !== data.type) {
    if (existing.amount_paid > 0) {
      return { error: 'Cannot change document type after payments have been recorded.' }
    }
    if (!['draft', 'sent'].includes(normalizedExistingStatus)) {
      return { error: 'Document type can only be changed for draft or sent documents.' }
    }
  }

  // Status changes are gated separately from generic edit access. Staff
  // who have invoices_edit but not invoices_change_status can still
  // adjust line items / dates, but moving the document through the
  // workflow is denied. We compare the submitted status to what's on
  // the row — a "same status" submission is allowed so the form save
  // flow doesn't break when the field is locked-but-unchanged.
  const requestedStatusForCheck = normalizeStatus(data.status || existing.status)
  if (
    !isAdminUserRow &&
    !perms.invoices_change_status &&
    requestedStatusForCheck !== existing.status
  ) {
    return { error: 'Your account is not allowed to change document status. Ask an administrator.' }
  }

  // Lock rules (mirrored in InvoiceForm so the UI can't even show editable
  // inputs the server will reject):
  //   - 'paid' / 'partial' → HARD locked, even for admins. Once money is in,
  //     the document is frozen; corrections go through payment edits, not
  //     invoice edits.
  //   - 'sent' is treated as a simple tag and does NOT lock editing.
  //   - 'converted' (quotes only) → soft-locked for non-admins.
  const hardLockedStatuses = ['paid', 'partial']
  const softLockedStatuses = ['converted']

  if (hardLockedStatuses.includes(normalizedExistingStatus)) {
    return {
      error: 'This document is locked once any payment has been recorded. Edit payments instead.',
    }
  }

  if (softLockedStatuses.includes(normalizedExistingStatus) && !isAdminUserRow) {
    return { error: 'This document is locked for editing' }
  }

  // Picking-load guard (invoices only). Editing replaces ALL invoice_items
  // (update_invoice_with_items deletes + re-inserts them), and
  // delivery_load_items.invoice_item_id cascades — so an edit would silently
  // empty every load on this order (including loads already on a truck),
  // corrupt stock reconciliation, and orphan stock alerts. Once any load
  // exists, line items must be changed through the loads/picking workflow,
  // not the invoice edit form.
  if (existing.type === 'invoice') {
    const admin = createAdminClient()
    const { count: loadCount } = await admin
      .from('delivery_loads')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', id)
    if ((loadCount ?? 0) > 0) {
      return {
        error:
          'This order has picking loads, so its items can no longer be edited — editing would empty the loads and corrupt stock. Adjust quantities through the loads panel instead.',
      }
    }
  }

  const clientCheck = await verifyClientOwnership(supabase, data.client_id, user.id, {
    allowAnyClient: perms.invoices_edit,
  })
  if (!clientCheck.ok) {
    if (clientCheck.reason === 'forbidden') {
      return { error: 'You can only attach documents to clients you created.' }
    }
    return { error: 'Invalid client' }
  }

  if (!data.items || data.items.length === 0) {
    return { error: 'At least one item is required' }
  }

  const dateValidation = validateDocumentDates(data.type, data.issue_date, data.due_date, data.expiry_date)
  if (!dateValidation.ok) {
    return { error: dateValidation.error }
  }

  const requestedStatus = normalizeStatus(data.status || existing.status)
  if (!isValidStatusTransition(data.type, normalizedExistingStatus, requestedStatus)) {
    return { error: `Cannot change status from ${existing.status} to ${requestedStatus}` }
  }

  if (data.type === 'invoice') {
    if (requestedStatus === 'paid' && existing.amount_paid < existing.total) {
      return { error: 'Cannot mark as paid until full payment is recorded' }
    }
    if (requestedStatus === 'partial' && (existing.amount_paid <= 0 || existing.amount_paid >= existing.total)) {
      return { error: 'Partial status requires a recorded payment less than the total' }
    }
  }

  const discountError = validateDiscountCaps(data.items, {
    discount_amount: data.discount_amount ?? null,
    discount_percent: data.discount_percent ?? null,
  })
  if (discountError) {
    return { error: discountError }
  }

  const documentVatRate = await getCompanyDefaultVatRate()
  const applyVat = Boolean(data.apply_vat)
  const { items, subtotal, vatTotal, total } = calculateTotals(
    data.items.map((item) => ({
      ...item,
      vat_rate: applyVat ? documentVatRate : 0,
    })),
    {
      discount_amount: data.discount_amount ?? null,
      discount_percent: data.discount_percent ?? null,
    },
    { applyVat, documentVatRate }
  )

  // Prevent reducing total below amount already paid.
  if (existing.amount_paid > 0 && total < existing.amount_paid) {
    return { error: 'Total cannot be less than amount already paid' }
  }

  // If the client changed, fetch the new client's account number. Otherwise
  // leave the existing account_number untouched.
  let accountNumberForUpdate: string | null | undefined = undefined
  let termsDaysForUpdate: number | undefined = undefined
  if (data.client_id !== existing.client_id) {
    accountNumberForUpdate = await getClientAccountNumber(supabase, data.client_id)
  }
  // Terms are needed whenever the due date has to be recomputed (blank
  // due_date) — fetch them for the (possibly unchanged) client.
  if (data.type === 'invoice' && !data.due_date?.trim()) {
    termsDaysForUpdate = await getClientPaymentTermsDays(supabase, data.client_id)
  }

  // If the document type changed, allocate a new number in the target sequence
  // so the prefix always matches the type.
  let documentNumberForUpdate: string | undefined = undefined
  if (data.type !== existing.type) {
    const prefixes = await getDocumentPrefixes()
    const prefix = data.type === 'invoice' ? prefixes.invoicePrefix : prefixes.quotationPrefix
    const { data: docNumber, error: docError } = await supabase.rpc('generate_document_number', {
      doc_prefix: prefix,
    })
    if (docError || !docNumber) {
      return { error: docError?.message || 'Failed to generate document number' }
    }
    documentNumberForUpdate = docNumber
  }

  const dueDate = data.type === 'invoice' ? data.due_date?.trim() || computeDueDate(data.issue_date, termsDaysForUpdate) : null
  const expiryDate = data.type === 'quotation' ? data.expiry_date?.trim() || existing.expiry_date || computeDueDate(data.issue_date) : null
  const yourReference = data.your_reference?.trim() || existing.your_reference || existing.order_number

  // Build a single payload and let the SECURITY DEFINER function
  // `update_invoice_with_items` apply the metadata + items atomically.
  // Stock restore/deduct is handled inside that RPC (migration 119): status
  // is applied last so draft→sent never double-deducts, and sent→sent
  // restores before replacing lines.
  const lineItemsForDb = items.map((item) => ({
    product_id: item.product_id || null,
    product_name: item.product_name,
    product_code: item.product_code || null,
    unit: item.unit || 'EA',
    quantity: roundQty(item.quantity),
    price: item.price,
    vat_rate: item.vat_rate,
    vat_amount: item.vat_amount,
    line_total: item.line_total,
    // Per-line discount values (pounds / percent). NULL when not set so the
    // SQL NULLIF in the RPC writes them as SQL NULL.
    discount_amount: item.discount_amount ?? null,
    discount_percent: item.discount_percent ?? null,
  }))

  // order_number / account_number / operator_name are owned by the original
  // document (its creator + auto-gen sequence) — we deliberately leave them
  // out of the payload. The RPC function treats missing keys as "leave
  // unchanged" (see `supabase/migrations/schema.sql`, the
  // `update_invoice_with_items` function in section 4).
  const payload: UpdateInvoiceRpcPayload = {
    client_id: data.client_id,
    type: data.type,
    issue_date: data.issue_date,
    // `issue_time` is intentionally always present in the payload (even as '')
    // so the SQL function knows the user touched the field and can write the
    // new value. Omitting the key would mean "leave it alone" in the SQL.
    issue_time: data.issue_time ?? '',
    due_date: dueDate,
    expiry_date: expiryDate,
    your_reference: yourReference,
    notes: data.notes?.trim() || null,
    status: requestedStatus,
    delivery_method: data.delivery_method || 'delivery',
    delivery_address_line_1: data.delivery_address_line_1?.trim() || null,
    delivery_address_line_2: data.delivery_address_line_2?.trim() || null,
    delivery_town: data.delivery_town?.trim() || null,
    delivery_county: data.delivery_county?.trim() || null,
    delivery_postcode: data.delivery_postcode?.trim().toUpperCase() || null,
    // Order-level discount keys are always sent (even when null) so the RPC
    // is free to overwrite the columns every time. Missing keys would mean
    // "leave unchanged", which is the wrong default here — the form is the
    // single source of truth for whether a discount is currently set.
    discount_amount: data.discount_amount ?? null,
    discount_percent: data.discount_percent ?? null,
    subtotal,
    show_payment_terms: data.show_payment_terms === true,
    // Always send show_watermark so the RPC persists the form's choice.
    // The form's default state is ON; false is a deliberate user toggle.
    show_watermark: data.show_watermark !== false,
    // The three status-stamp toggles (PAID / PARTIALLY PAID / OVERDUE)
    // are deliberately NOT in this payload — the form doesn't manage
    // them (they live in the actions card and have their own action).
    // Omitting the keys means the RPC's absent-key preservation leaves
    // whatever the operator set via toggleInvoiceWatermarks() alone.
    // This stops a form save from accidentally re-enabling a stamp the
    // operator had explicitly turned off.
    vat_total: vatTotal,
    total,
    items: lineItemsForDb,
  }

  if (accountNumberForUpdate !== undefined) {
    payload.account_number = accountNumberForUpdate
  }

  if (documentNumberForUpdate !== undefined) {
    payload.document_number = documentNumberForUpdate
  }

  const { data: invoice, error: invoiceError } = await supabase.rpc('update_invoice_with_items', {
    p_invoice_id: id,
    p_user_id: user.id,
    p_payload: payload,
  })

  if (invoiceError) {
    // Stock CHECK / routing failures inside the RPC surface here as a failed
    // transaction — the whole edit rolls back, so there is no half-saved row.
    const msg = invoiceError.message || ''
    if (/stock|non.?negative|products_stock/i.test(msg)) {
      return {
        error:
          'Could not save changes because stock could not be updated. ' +
          'Check stock levels (or turn off stock routing) and try again.',
      }
    }
    return { error: safeActionError('invoices.updateInvoice', invoiceError, 'Could not save changes.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  revalidatePath('/dashboard')
  return { invoice }
}

export async function updateInvoiceStatus(id: string, status: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Status changes are gated by the invoices_change_status permission.
  // Admins always pass; staff pass when the admin enabled the toggle.
  // Default off — moving a document through the workflow is sensitive
  // (sent/paid/partial all have downstream effects).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_change_status) {
    return { error: 'Your account is not allowed to change document status. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }

  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  const requestedStatus = normalizeStatus(status)
  if (!isValidStatusTransition(existing.type, normalizeStatus(existing.status), requestedStatus)) {
    return { error: `Cannot change status from ${existing.status} to ${requestedStatus}` }
  }

  if (existing.type === 'invoice') {
    if (requestedStatus === 'paid' && existing.amount_paid < existing.total) {
      return { error: 'Cannot mark as paid until full payment is recorded' }
    }
    if (requestedStatus === 'paid') {
      const { blocks } = await getPaymentBlockedInvoices([id])
      if (blocks && blocks.length > 0) {
        return {
          error:
            'This invoice was amended during picking (loaded quantities differ from what was ordered). Resolve the review on the invoice page before marking it paid.',
        }
      }
    }
    if (requestedStatus === 'partial' && (existing.amount_paid <= 0 || existing.amount_paid >= existing.total)) {
      return { error: 'Partial status requires a recorded payment less than the total' }
    }
  }

  // Capture operator + timestamp for the status-stamp tracking columns.
  // When the status flips TO 'paid' we record paid_by + paid_at (used by
  // the PAID stamp on the PDF / on-screen document). When the status
  // flips TO 'overdue' we record overdue_at. Other status changes don't
  // need tracking — only the stamps that surface a date do.
  const updatePayload: Record<string, unknown> = { status: requestedStatus }
  const now = new Date().toISOString()
if (requestedStatus === 'paid' && existing.status !== 'paid') {
    const { data: operatorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    updatePayload.paid_by =
      operatorProfile?.full_name || (profile as { full_name?: string | null })?.full_name || 'System'
    updatePayload.paid_at = now
  }
  if (requestedStatus === 'overdue' && existing.status !== 'overdue') {
    updatePayload.overdue_at = now
  }

  // A paid invoice means the goods have gone out: mark the order delivered
  // automatically unless it was already delivered (manually or via a load).
  // Mirrors the recompute_invoice_paid trigger (migration 130) which covers
  // the payment-recording path; this covers the manual status-change path.
  if (
    existing.type === 'invoice' &&
    requestedStatus === 'paid' &&
    existing.picking_status !== 'delivered'
  ) {
    updatePayload.picking_status = 'delivered'
    updatePayload.picking_delivered_at = now
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .update(updatePayload)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single()

  if (invoiceError) {
    return { error: safeActionError('invoices.updateInvoiceStatus', invoiceError, 'Could not change the status.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  revalidatePath('/dashboard')
  return { invoice }
}

export async function getInvoiceByNumber(number: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const token = extractShareToken(number)
  const term = sanitizeSearchTerm(number)

  if (!token && !term) {
    return { error: 'Please enter a document number or public link' }
  }

  let query = supabase
    .from('invoices')
    .select('*, show_payment_terms, clients(id, first_name, last_name, company_name), payments(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (token) {
    // Searching by the public link token is more precise than a text match.
    query = query.eq('share_token', token)
  } else if (/^\d+$/.test(term)) {
    query = query.or(`document_number.ilike.%${term}%,document_number_suffix.eq.${term}`)
  } else {
    query = query.or(`document_number.ilike.%${term}%`)
  }

  const { data: invoice, error } = await query.maybeSingle()

  if (error || !invoice) {
    return { error: 'Document not found' }
  }

  if (invoice.created_by !== user.id && !(await isAdmin(supabase, user.id))) {
    // Same error as the not-found branch — an attacker typing a known
    // document number or public link shouldn't be able to tell
    // "this exists, I just can't see it" from "this doesn't exist".
    return { error: 'Document not found' }
  }

  // Redact money before it ever leaves the server for operators who aren't
  // allowed to see invoice totals. The status-update dialog reuses this
  // function, so the redaction has to happen here at the source rather than
  // relying on UI hiding.
  const { data: moneyProfile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  const moneyPerms = resolveStaffPermissions(
    moneyProfile?.role ?? 'staff',
    moneyProfile?.permissions ?? null
  )
  const showMoney = canSeeInvoiceMoney(moneyPerms)

  const safeInvoice = showMoney
    ? invoice
    : {
        ...invoice,
        total: 0,
        amount_paid: 0,
        balance_due: 0,
        payments: Array.isArray(invoice.payments)
          ? invoice.payments.map((p: { amount: number }) => ({ ...p, amount: 0 }))
          : invoice.payments,
      }

  return { invoice: safeInvoice, showMoney }
}

export async function deleteInvoice(id: string, password: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Deletion is gated by the invoices_delete permission. Admins
  // always pass; staff pass only when the admin explicitly granted
  // the toggle in Settings. Default off — destructive and audit-
  // sensitive. This is the security layer; the UI button is also
  // gated, but we never trust the UI alone.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_delete) {
    return { error: 'Your account is not allowed to delete documents. Ask an administrator.' }
  }

  const hdrs = await headers()
  const ip = getClientIp(hdrs)
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null

  const gated = await reauthThenSoftDeleteRpc(supabase, user.id, password, 'soft_delete_invoice', {
    p_invoice_id: id,
    p_ip_address: ip === 'unknown' ? null : ip,
    p_user_agent: userAgent,
  })
  if (!gated.ok) return { error: gated.error }
  if (!gated.result.success) {
    return { error: gated.result.message || 'Could not delete the document.' }
  }

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { success: true }
}

export async function convertQuoteToInvoice(quoteId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_convert_quote) {
    return { error: 'Your account is not allowed to convert quotations. Ask an administrator.' }
  }

  // Pre-check on the user client for cleaner error messages. The RPC does
  // its own auth check too — these are belt-and-braces.
  const { data: quote } = await supabase
    .from('invoices')
    .select('id, type, status, created_by')
    .eq('id', quoteId)
    .eq('type', 'quotation')
    .is('deleted_at', null)
    .maybeSingle()

  if (!quote) {
    return { error: 'Quote not found' }
  }

  if (!['draft', 'sent'].includes(quote.status)) {
    return { error: 'Only draft or sent quotes can be converted' }
  }

  // Atomic conversion via SECURITY DEFINER RPC. The previous three-call
  // flow (insert invoice → insert items → mark quote converted) could
  // leave orphans or an un-marked quote if any step failed mid-flight.
  //
  // The RPC is GRANT EXECUTE TO service_role — the user client can't
  // reach it directly — so we go through the admin client. The admin
  // client bypasses RLS, but the RPC itself enforces auth (created_by =
  // caller OR is_admin) before doing any work.
  const admin = createAdminClient()
  const callerIsAdmin = await isAdminUser(supabase, user.id)
  const { data: invoiceId, error: rpcErr } = await admin.rpc('convert_quote_to_invoice', {
    p_quote_id: quoteId,
    p_user_id: user.id,
    p_is_admin: callerIsAdmin,
  })

  if (rpcErr || !invoiceId) {
    // Translate the RPC's P0001 / 42501 / P0002 into the same error
    // messages the previous flow used so the UI doesn't change.
    const msg = rpcErr?.message || ''
    if (rpcErr?.code === 'P0001' || /already been converted/i.test(msg)) {
      return { error: 'This quotation has already been converted to an invoice.' }
    }
    if (rpcErr?.code === '42501' || /not authorised|not authorized/i.test(msg)) {
      return { error: 'Not authorized' }
    }
    if (rpcErr?.code === 'P0002' || /quote not found/i.test(msg)) {
      return { error: 'Quote not found' }
    }
    return { error: safeActionError('invoices.convertQuoteToInvoice', rpcErr, 'Could not convert the quote.') }
  }

  // Re-fetch via the user client (RLS-enforced) so the returned row only
  // includes fields the caller is allowed to see. The RPC bypasses RLS
  // to do the writes; the read goes back through the user client.
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .single()

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  revalidatePath(`/invoices/${quoteId}`)
  return { invoice }
}

export interface InvoiceWatermarkToggles {
  show_paid_watermark?: boolean
  show_partially_paid_watermark?: boolean
  show_overdue_watermark?: boolean
  // Master on/off + Auto/Manual mode selector (migration 104). When
  // status_stamps_enabled is FALSE, no status stamp ever renders on this
  // invoice — the per-stamp toggles become irrelevant. status_stamps_mode
  // is constrained to 'auto' | 'manual' at the DB level.
  status_stamps_enabled?: boolean
  status_stamps_mode?: 'auto' | 'manual'
}

/**
 * Toggle one (or all) of the three status-stamp watermarks on an invoice.
 *
 * The form for an operator-facing "Show paid watermark" / "Show partially
 * paid watermark" / "Show overdue watermark" set of switches calls this
 * with the new state. Each flag is independent — operators can opt out
 * of any single stamp while keeping the others on.
 *
 * Authorization: same as toggleInvoicePublicSharing — owner or admin, and
 * the `invoices_manage_sharing` permission isn't required here (these
 * stamps are document-content, not link-sharing).
 */
export async function toggleInvoiceWatermarks(id: string, toggles: InvoiceWatermarkToggles) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_edit) {
    return {
      error: 'Your account is not allowed to change document settings. Ask an administrator.',
    }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select(
      'id, created_by, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, status_stamps_enabled, status_stamps_mode'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }
  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  // Only write the keys the caller actually provided — keeps each toggle
  // independent. If a UI bug passes `undefined`, the column stays as it was.
  const update: Record<string, boolean | string> = {}
  if (typeof toggles.show_paid_watermark === 'boolean') {
    update.show_paid_watermark = toggles.show_paid_watermark
  }
  if (typeof toggles.show_partially_paid_watermark === 'boolean') {
    update.show_partially_paid_watermark = toggles.show_partially_paid_watermark
  }
  if (typeof toggles.show_overdue_watermark === 'boolean') {
    update.show_overdue_watermark = toggles.show_overdue_watermark
  }
  if (typeof toggles.status_stamps_enabled === 'boolean') {
    update.status_stamps_enabled = toggles.status_stamps_enabled
  }
  if (toggles.status_stamps_mode === 'auto' || toggles.status_stamps_mode === 'manual') {
    update.status_stamps_mode = toggles.status_stamps_mode
  }

  if (Object.keys(update).length === 0) {
    // Nothing to do — return the current row so callers still get a value.
    return { invoice: existing }
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select(
      'id, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, status_stamps_enabled, status_stamps_mode'
    )
    .single()

  if (error) {
    return {
      error: safeActionError('invoices.toggleInvoiceWatermarks', error, 'Could not update stamp settings.'),
    }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  return { invoice }
}

const SHARE_INVOICE_SELECT =
  'id, share_token, public_share_enabled, share_token_expires_at, share_token_created_at, public_share_key, public_share_requires_password, delivery_note_share_enabled, delivery_note_share_requires_password'

function isShareDocumentMode(value: unknown): value is ShareDocumentMode {
  return value === 'invoice' || value === 'delivery-note'
}

export async function toggleInvoicePublicSharing(
  id: string,
  enabled: boolean,
  mode: ShareDocumentMode = 'invoice'
) {
  if (!isShareDocumentMode(mode)) {
    return { error: 'Invalid share document mode.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_manage_sharing) {
    return { error: 'Your account is not allowed to change sharing settings. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select(
      'id, created_by, status, public_share_enabled, delivery_note_share_enabled, share_token, share_token_created_at, public_share_key, public_share_requires_password, delivery_note_share_requires_password'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }
  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  // Only allow public sharing for documents that are actually issued.
  // Drafts, converted quotes, and cancelled docs must not be linkable.
  const SHAREABLE_STATUSES = new Set(['sent', 'partial', 'paid'])
  if (enabled && !SHAREABLE_STATUSES.has(normalizeStatus(existing.status))) {
    return {
      error:
        'Only sent, partially paid, or paid documents can be shared publicly. Save/send the document first.',
    }
  }

  // Reuse the existing key/token when re-enabling. Only mint a new key if
  // the row genuinely has none. This keeps the URL stable when an operator
  // accidentally toggles sharing off and back on.
  const needsNewKey = enabled && !existing.public_share_key
  const otherModeStillEnabled =
    mode === 'invoice'
      ? existing.delivery_note_share_enabled === true
      : existing.public_share_enabled === true

  // Visibility is mode-specific. Password for THIS mode is cleared when that
  // mode is turned off. Expiry is shared: extend when enabling either mode;
  // only clear expiry when both modes end up disabled.
  const update: Record<string, unknown> = {
    ...(mode === 'invoice'
      ? {
          public_share_enabled: enabled,
          ...(!enabled
            ? { public_share_requires_password: false, public_share_password_hash: null }
            : {}),
        }
      : {
          delivery_note_share_enabled: enabled,
          ...(!enabled
            ? {
                delivery_note_share_requires_password: false,
                delivery_note_share_password_hash: null,
              }
            : {}),
        }),
    ...(enabled
      ? {
          share_token_expires_at: shareLinkExpiry(),
          share_token_created_at: new Date().toISOString(),
        }
      : !otherModeStillEnabled
        ? { share_token_expires_at: null }
        : {}),
    ...(needsNewKey ? { public_share_key: generateShareKey() } : {}),
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SHARE_INVOICE_SELECT)
    .single()

  if (error) {
    return { error: safeActionError('invoices.toggleInvoicePublicSharing', error, 'Could not update sharing settings.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  return { invoice }
}

export async function regenerateInvoiceShareToken(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_manage_sharing) {
    return { error: 'Your account is not allowed to regenerate the share link. Ask an administrator.' }
  }

  // Rate-limit rotations per user. Regeneration should be rare; the normal
  // workflow is to renew the existing link.
  const rl = await rateLimit(supabase, `share-rotate:${user.id}`, 10, 10 * 60 * 1000)
  if (!rl.allowed) {
    return { error: 'Too many link rotations. Please try again later.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, created_by, status, public_share_enabled, share_token, share_token_created_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }
  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  // Rotate both the internal token and the opaque URL key. Clearing both
  // password hashes means regenerated links start public again for each mode;
  // the operator can re-enable password protection per document from the dashboard.
  // Visibility flags are left as-is so regenerating does not force-enable the
  // other document type.
  const { data: invoice, error } = await supabase
    .from('invoices')
    .update({
      share_token: crypto.randomUUID(),
      share_token_created_at: new Date().toISOString(),
      share_token_expires_at: shareLinkExpiry(),
      public_share_key: generateShareKey(),
      public_share_requires_password: false,
      public_share_password_hash: null,
      delivery_note_share_requires_password: false,
      delivery_note_share_password_hash: null,
    })
    .eq('id', id)
    .is('deleted_at', null)
    .select(SHARE_INVOICE_SELECT)
    .single()

  if (error) {
    return { error: safeActionError('invoices.regenerateInvoiceShareToken', error, 'Could not regenerate the share link.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  return { invoice }
}

export async function renewInvoiceShareToken(
  id: string,
  mode: ShareDocumentMode = 'invoice'
) {
  if (!isShareDocumentMode(mode)) {
    return { error: 'Invalid share document mode.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_manage_sharing) {
    return { error: 'Your account is not allowed to renew the share link. Ask an administrator.' }
  }

  // Rate-limit renewals per user. Renew is cheap but should not be abused.
  const rl = await rateLimit(supabase, `share-renew:${user.id}`, 20, 10 * 60 * 1000)
  if (!rl.allowed) {
    return { error: 'Too many renewals. Please try again later.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select(
      'id, created_by, status, share_token, share_token_created_at, public_share_key, public_share_requires_password, public_share_password_hash, delivery_note_share_enabled, delivery_note_share_requires_password, delivery_note_share_password_hash'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }
  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  // Renew extends shared expiry and re-enables only the selected document mode.
  // Key/token/password never rotate.
  const update: Record<string, unknown> = {
    share_token_expires_at: shareLinkExpiry(),
    ...(mode === 'invoice'
      ? { public_share_enabled: true }
      : { delivery_note_share_enabled: true }),
  }
  if (!existing.share_token) {
    update.share_token = randomUUID()
    update.share_token_created_at = new Date().toISOString()
  }
  if (!existing.public_share_key) {
    update.public_share_key = generateShareKey()
  }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(update)
    .eq('id', id)
    .is('deleted_at', null)
    .select(SHARE_INVOICE_SELECT)
    .single()

  if (error) {
    return { error: safeActionError('invoices.renewInvoiceShareToken', error, 'Could not renew the share link.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  return { invoice }
}

export async function setInvoiceSharePassword(
  id: string,
  requiresPassword: boolean,
  mode: ShareDocumentMode = 'invoice'
) {
  if (!isShareDocumentMode(mode)) {
    return { error: 'Invalid share document mode.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_manage_sharing) {
    return { error: 'Your account is not allowed to change sharing settings. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select(
      'id, created_by, status, public_share_enabled, public_share_key, public_share_requires_password, delivery_note_share_enabled, delivery_note_share_requires_password'
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Invoice not found' }
  }
  if (existing.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  const modeEnabled =
    mode === 'invoice'
      ? existing.public_share_enabled === true
      : existing.delivery_note_share_enabled === true

  if (requiresPassword) {
    if (!modeEnabled) {
      return {
        error: 'Turn on link visibility for this document before enabling password protection.',
      }
    }

    const password = generateSharePassword()
    const passwordHash = await hashSharePassword(password)

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(
        mode === 'invoice'
          ? {
              public_share_requires_password: true,
              public_share_password_hash: passwordHash,
            }
          : {
              delivery_note_share_requires_password: true,
              delivery_note_share_password_hash: passwordHash,
            }
      )
      .eq('id', id)
      .is('deleted_at', null)
      .select(SHARE_INVOICE_SELECT)
      .single()

    if (error) {
      return { error: safeActionError('invoices.setInvoiceSharePassword', error, 'Could not enable password protection.') }
    }

    revalidatePath('/invoices')
    revalidatePath(`/invoices/${id}`)
    return { invoice, password }
  }

  // Disable password protection for this mode only; keep the link active.
  const { data: invoice, error } = await supabase
    .from('invoices')
    .update(
      mode === 'invoice'
        ? {
            public_share_requires_password: false,
            public_share_password_hash: null,
          }
        : {
            delivery_note_share_requires_password: false,
            delivery_note_share_password_hash: null,
          }
    )
    .eq('id', id)
    .is('deleted_at', null)
    .select(SHARE_INVOICE_SELECT)
    .single()

  if (error) {
    return { error: safeActionError('invoices.setInvoiceSharePassword', error, 'Could not disable password protection.') }
  }

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${id}`)
  return { invoice }
}

export async function verifyInvoiceSharePassword(
  token: string,
  password: string,
  mode: 'invoice' | 'delivery-note' = 'invoice'
) {
  if (!token || (!isShareKey(token) && !isLegacyShareToken(token))) {
    return { error: 'Invalid link' }
  }
  if (!password) {
    return { error: 'Please enter the password.' }
  }

  const hdrs = await headers()
  const ip = getClientIp(hdrs)

  // Fail closed on rate-limit errors: a missing RPC must not allow unlimited
  // password guessing against short generated passwords.
  const anonForRateLimit = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const rl = await rateLimit(
    anonForRateLimit,
    `share-password:${ip}`,
    10,
    60_000,
    { failOpen: false }
  )
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  const shareMode: ShareDocumentMode = mode === 'delivery-note' ? 'delivery-note' : 'invoice'
  const admin = createAdminClient()
  const { data: row, error } = await findPublicInvoiceByToken(admin, token, shareMode)

  if (error) {
    console.error('verifyInvoiceSharePassword lookup failed:', error)
    return { error: 'Invalid link or password' }
  }
  const access = row ? getShareAccessForMode(row, shareMode) : null
  if (!row || !access?.requiresPassword) {
    return { error: 'Invalid link or password' }
  }

  const valid = await verifySharePassword(password, access.passwordHash)
  if (!valid) {
    return { error: 'Invalid link or password' }
  }

  const [companySettingsResult, companyChannelsResult, bankResult] = await Promise.all([
    admin
      .from('company_settings')
      .select('company_name, address_line_1, address_line_2, town, county, postcode, phone, email, vat_number, company_registration_number')
      .maybeSingle(),
    loadCompany(),
    admin.from('company_bank_details').select('*').maybeSingle(),
  ])

  const company = {
    ...(companySettingsResult.data ?? {}),
    phone: companyChannelsResult?.phone ?? companySettingsResult.data?.phone ?? null,
    email: companyChannelsResult?.email ?? companySettingsResult.data?.email ?? null,
    phones: companyChannelsResult?.phones ?? [],
    emails: companyChannelsResult?.emails ?? [],
  }
  const bankDetails = bankResult.data ?? {}

  // Log the successful password-protected view.
  try {
    const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null
    await admin.from('public_share_views').insert({
      invoice_id: row.id,
      share_token: row.share_token,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
    })
  } catch (err) {
    console.warn('Failed to log password-protected share view (non-fatal):', err instanceof Error ? err.message : err)
  }

  // Strip internal fields before returning to the client.
  const {
    id,
    public_share_key,
    public_share_requires_password,
    public_share_password_hash,
    delivery_note_share_enabled,
    delivery_note_share_requires_password,
    delivery_note_share_password_hash,
    public_share_enabled,
    ...invoice
  } = row

  return {
    invoice,
    company,
    bankDetails,
    mode: shareMode,
  }
}

export async function searchClients(query: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.see_clients) {
    return { error: 'Not authorised' }
  }

  const term = sanitizeLikeTerm(query)
  if (!term) {
    return { clients: [] }
  }

  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, company_name, email, phone')
    .or(buildClientSearchFilter(term))
    .order('first_name', { ascending: true })
    .limit(10)

  if (error) {
    return { error: safeActionError('invoices.searchClients', error, 'Search failed.') }
  }

  return { clients: data || [] }
}
