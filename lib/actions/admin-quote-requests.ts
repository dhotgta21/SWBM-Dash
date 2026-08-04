'use server'

// Quote request lifecycle actions for the admin dashboard.
//
// Three things can happen to a quote request:
//
//   1. Status changes — admin marks it 'reviewed' / 'rejected' /
//      'cancelled'. Trivial status writes.
//   2. Line item edits — admin tweaks the suggested_price (or the
//      quantity) on individual items before quoting the customer.
//   3. Convert — admin clicks "Convert to invoice", which creates
//      a real invoice (type='quotation') with line items using the
//      final prices, links it back to the request, and flips the
//      request status to 'invoiced'.
//
// All three are guarded by an admin check at the start so a
// staff user can't promote themselves or scribble on requests
// they're not supposed to touch.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import { calculateDocumentTotals, normalizeVatRatePercent } from '@/lib/vat'
import type { Json } from '@/lib/database.types'

async function requirePermission(permission: 'see_quote_requests' | 'quote_requests_review' | 'quote_requests_convert') {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'Not signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  const isAdminUserRow = profile ? await isAdminUser(supabase, user.id) : false
  const perms = resolveStaffPermissions(profile?.role, profile?.permissions)

  if (!isAdminUserRow && !perms[permission]) {
    return { ok: false as const, error: 'You do not have permission to manage quote requests.' }
  }
  return { ok: true as const, userId: user.id, supabase, adminClient, isAdmin: isAdminUserRow }
}

interface QuoteRequestRow {
  id: string
  request_number: string
  client_name: string
  client_email: string
  client_phone: string | null
  client_company: string | null
  delivery_address_line_1: string | null
  delivery_address_line_2: string | null
  delivery_town: string | null
  delivery_county: string | null
  delivery_postcode: string | null
  notes: string | null
  status: string
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, ' ')
  const idx = trimmed.indexOf(' ')
  if (idx === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) }
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ['reviewed', 'rejected', 'cancelled'],
  reviewed: ['pending', 'rejected', 'cancelled'],
  rejected: [],
  cancelled: [],
  invoiced: [],
}

export async function updateQuoteRequestStatus(
  requestId: string,
  nextStatus: 'pending' | 'reviewed' | 'rejected' | 'cancelled'
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requirePermission('quote_requests_review')
  if (!guard.ok) return { ok: false, error: guard.error }

  if (!requestId) return { ok: false, error: 'Missing request id.' }

  const { data: req, error: fetchErr } = await guard.adminClient
    .from('quote_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr || !req) {
    return { ok: false, error: 'Quote request not found.' }
  }
  if (req.status === nextStatus) {
    return { ok: true }
  }
  if (!ALLOWED_STATUS_TRANSITIONS[req.status]?.includes(nextStatus)) {
    return { ok: false, error: `Cannot change request status from ${req.status} to ${nextStatus}.` }
  }

  const { error } = await guard.adminClient
    .from('quote_requests')
    .update({ status: nextStatus, processed_by: guard.userId, processed_at: new Date().toISOString() })
    .eq('id', requestId)

  if (error) {
    console.error('Failed to update quote request status:', error)
    return { ok: false, error: safeActionError('updateQuoteRequestStatus', error) }
  }

  revalidatePath(`/quote-requests/${requestId}`)
  revalidatePath('/quote-requests')
  return { ok: true }
}

const itemEditSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100_000),
  unitPrice: z.coerce.number().nonnegative().max(1_000_000),
})

export async function updateQuoteRequestItems(
  requestId: string,
  rawItems: Array<{ itemId: string; quantity: number | string; unitPrice: number | string }>
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requirePermission('quote_requests_review')
  if (!guard.ok) return { ok: false, error: guard.error }

  if (!requestId) return { ok: false, error: 'Missing request id.' }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'No items to update.' }
  }

  const { data: req, error: fetchErr } = await guard.adminClient
    .from('quote_requests')
    .select('status')
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr || !req) {
    return { ok: false, error: 'Quote request not found.' }
  }
  if (!['pending', 'reviewed'].includes(req.status)) {
    return { ok: false, error: `Cannot edit items on a ${req.status} request.` }
  }

  const parsed = z.array(itemEditSchema).safeParse(rawItems)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid item payload.' }
  }

  // Update each line item individually. The list is small (≤ a few
  // dozen rows in practice) so a loop of updates is fine and avoids
  // needing to verify which rows the admin actually intended to
  // touch (we trust the formData here since the page only renders
  // known items).
  for (const it of parsed.data) {
    const { error } = await guard.adminClient
      .from('quote_request_items')
      .update({ quantity: it.quantity, suggested_price: it.unitPrice })
      .eq('id', it.itemId)
      .eq('quote_request_id', requestId)
    if (error) {
      console.error('Failed to update quote request item:', it.itemId, error)
      return { ok: false, error: safeActionError('updateQuoteRequestItems', error) }
    }
  }

  revalidatePath(`/quote-requests/${requestId}`)
  return { ok: true }
}

export async function convertQuoteRequestToInvoice(
  requestId: string
): Promise<{ error: string } | never> {
  const guard = await requirePermission('quote_requests_convert')
  if (!guard.ok) return { error: guard.error }
  if (!requestId) return { error: 'Missing request id.' }

  // ── Load the request + items + catalogue snapshots ───────────────
  const { data: reqRow, error: reqErr } = await guard.adminClient
    .from('quote_requests')
    .select(
      'id, request_number, client_name, client_email, client_phone, client_company, ' +
      'delivery_address_line_1, delivery_address_line_2, delivery_town, delivery_county, ' +
      'delivery_postcode, notes, status'
    )
    .eq('id', requestId)
    .maybeSingle()
    .returns<QuoteRequestRow>()

  if (reqErr || !reqRow) return { error: 'Quote request not found.' }
  const req = reqRow

  if (req.status === 'invoiced') {
    return { error: 'This quote request has already been converted to an invoice.' }
  }
  if (req.status === 'rejected' || req.status === 'cancelled') {
    return { error: `This request is ${req.status} and can't be converted.` }
  }

  const { data: itemsRows, error: itemsErr } = await guard.adminClient
    .from('quote_request_items')
    .select('product_id, product_code, product_name, unit, quantity, suggested_price')
    .eq('quote_request_id', requestId)
    .order('created_at', { ascending: true })

  if (itemsErr) return { error: 'Could not load the line items.' }
  if (!itemsRows || itemsRows.length === 0) {
    return { error: 'This request has no line items to convert.' }
  }

  // ── Find or create the client row ────────────────────────────────
  // The partial UNIQUE index idx_clients_email_unique
  // (supabase/migrations/024_data_integrity_hardening.sql) guarantees at
  // most one clients row per lowercased email. A concurrent admin
  // conversion of two quote requests from the same email can both pass
  // the maybeSingle() lookup below — the second INSERT then fails with
  // 23505. We catch it, re-fetch the winner, and reuse that client.
  const email = req.client_email.toLowerCase()
  let clientId: string | null = null

  const { data: existingClient } = await guard.adminClient
    .from('clients')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()
    .returns<{ id: string }>()

  if (existingClient) {
    clientId = existingClient.id
  } else {
    const { firstName, lastName } = splitName(req.client_name)
    const { data: createdClient, error: clientErr } = await guard.adminClient
      .from('clients')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: req.client_phone || null,
        company_name: req.client_company || null,
        address_line_1: req.delivery_address_line_1 || null,
        address_line_2: req.delivery_address_line_2 || null,
        town: req.delivery_town || null,
        county: req.delivery_county || null,
        postcode: req.delivery_postcode || null,
        created_by: guard.userId,
      })
      .select('id')
      .single()
      .returns<{ id: string }>()

    if (clientErr || !createdClient) {
      // 23505 = unique_violation on lower(email). Another concurrent
      // conversion beat us to it — re-fetch the row they created and
      // use that. Anything else is a real error.
      if (clientErr?.code === '23505') {
        const { data: raceWinner } = await guard.adminClient
          .from('clients')
          .select('id')
          .eq('email', email)
          .is('deleted_at', null)
          .maybeSingle()
          .returns<{ id: string }>()
        if (raceWinner) {
          clientId = raceWinner.id
        } else {
          console.error('client.email unique violation but re-fetch returned nothing:', clientErr)
          return { error: 'Could not create the client record for this quote.' }
        }
      } else {
        console.error('Failed to create client for quote conversion:', clientErr)
        return { error: 'Could not create the client record for this quote.' }
      }
    } else {
      clientId = createdClient.id
    }
  }

  if (!clientId) {
    return { error: 'Could not resolve a client record for this quote.' }
  }

  // ── Allocate a sequential document number (QTE-YYYY-Mnnn) ───────
  const { data: documentNumber, error: numErr } = await guard.adminClient.rpc(
    'generate_document_number',
    { doc_prefix: 'QTE' }
  )
  if (numErr || !documentNumber) {
    console.error('generate_document_number(QTE) failed:', numErr)
    return { error: 'Could not allocate a quotation number.' }
  }

  // ── Compute line totals + invoice aggregates ─────────────────────
  // Local calendar date (not UTC) so the issue date matches the operator's day.
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const validItems = itemsRows
    .map((row) => {
      const r = row as {
        product_id: string | null
        product_code: string
        product_name: string
        unit: string
        quantity: number
        suggested_price: number | null
      }
      const quantity = Number(r.quantity) || 0
      const unitPrice = r.suggested_price !== null ? Number(r.suggested_price) : 0
      return {
        product_id: r.product_id,
        product_code: r.product_code,
        product_name: r.product_name,
        unit: r.unit,
        quantity,
        unit_price: unitPrice,
      }
    })
    .filter((it) => it.quantity > 0)

  if (validItems.length === 0) {
    return { error: 'No items with valid quantities to convert.' }
  }
  const zeroPriceItem = validItems.find((it) => it.unit_price <= 0)
  if (zeroPriceItem) {
    return { error: `Set a price for ${zeroPriceItem.product_name} before converting.` }
  }

  // Quotation type with the company's default VAT rate applied for the
  // totals (falls back to 20% when unset). Per-line VAT rounding matches the
  // invoice form so converted quotes agree with manually created quotations.
  const { data: companySettings } = await guard.adminClient
    .from('company_settings')
    .select('default_vat_rate')
    .eq('id', 1)
    .maybeSingle()
  const vatRatePercent = normalizeVatRatePercent(
    companySettings?.default_vat_rate == null ? null : Number(companySettings.default_vat_rate)
  )
  const lineInputs = validItems.map((it) => ({
    quantity: it.quantity,
    price: it.unit_price,
    vat_rate: vatRatePercent,
  }))
  const { items: calculatedLines, subtotal, vatTotal, total } = calculateDocumentTotals(lineInputs)

  // ── Atomically create the invoice, line items, and link the request ──
  // All three writes run inside a single SECURITY DEFINER RPC so a failure
  // cannot leave a dangling invoice or convert the same request twice.
  const rpcItems = calculatedLines.map((it, idx) => ({
    product_id: validItems[idx].product_id,
    product_code: validItems[idx].product_code,
    product_name: validItems[idx].product_name,
    unit: validItems[idx].unit,
    quantity: validItems[idx].quantity,
    price: validItems[idx].unit_price,
    line_total: it.line_total,
    vat_amount: it.vat_amount,
    vat_rate: it.vat_rate,
  }))

  const { data: invoiceId, error: convertErr } = await guard.adminClient.rpc(
    'convert_quote_request_to_invoice',
    {
      p_request_id: requestId,
      p_client_id: clientId,
      p_document_number: documentNumber,
      p_issue_date: today,
      p_notes: req.notes || '',
      p_delivery_address_line_1: req.delivery_address_line_1 || '',
      p_delivery_address_line_2: req.delivery_address_line_2 || '',
      p_delivery_town: req.delivery_town || '',
      p_delivery_county: req.delivery_county || '',
      p_delivery_postcode: req.delivery_postcode || '',
      p_subtotal: subtotal,
      p_vat_total: vatTotal,
      p_total: total,
      p_items: rpcItems as unknown as Json,
      p_user_id: guard.userId,
    }
  )

  if (convertErr || !invoiceId) {
    console.error('Failed to convert quote request to invoice:', convertErr)
    return { error: safeActionError('quoteRequests.convert', convertErr ?? null, 'Could not convert the quote request.') }
  }

  revalidatePath('/quote-requests')
  revalidatePath(`/quote-requests/${requestId}`)
  revalidatePath('/invoices')
  redirect(`/invoices/${invoiceId}`)
}
