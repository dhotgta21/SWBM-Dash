'use server'

// Delivery / progress status workflow for the document list.
//
// The column is derived (lib/utils getDeliveryStatus):
//   draft     — document is still a draft
//   created   — document has been issued (sent)
//   delivered — invoice marked delivered (picking_status = 'delivered')
//   converted — quotation turned into an invoice
//
// Movement is strictly forward:
//   invoice:   draft → created → delivered
//   quotation: draft → created → converted (creates the invoice)
// There is no way back — the UI asks for confirmation before every change
// and this action re-validates the transition server-side.

import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { getDeliveryStatus, type DeliveryStatus } from '@/lib/utils'
import { updateInvoiceStatus, convertQuoteToInvoice } from '@/lib/actions/invoices'
import { markInvoiceDelivered } from '@/lib/actions/picker'

export type DeliveryStatusTarget = 'created' | 'delivered' | 'converted'

// Legal forward moves: [documentType][current] → next step (null = final).
const NEXT_DELIVERY_STATUS: Record<
  'invoice' | 'quotation',
  Partial<Record<DeliveryStatus, DeliveryStatusTarget>>
> = {
  invoice: { draft: 'created', created: 'delivered' },
  quotation: { draft: 'created', created: 'converted' },
}

export async function updateDeliveryStatus(
  id: string,
  target: DeliveryStatusTarget
): Promise<{ error?: string; invoice?: { id: string; document_number: string } }> {
  if (target !== 'created' && target !== 'delivered' && target !== 'converted') {
    return { error: 'Invalid delivery status.' }
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
  const isAdminUserRow = await isAdminUser(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)

  // Permission depends on the step: issuing/advancing a document needs
  // invoices_change_status; converting a quote needs invoices_convert_quote.
  // (The underlying actions re-check these too — this just fails fast with
  // a clear message.)
  if (target === 'converted') {
    if (!isAdminUserRow && !perms.invoices_convert_quote) {
      return { error: 'Your account is not allowed to convert quotations. Ask an administrator.' }
    }
  } else if (!isAdminUserRow && !perms.invoices_change_status) {
    return { error: 'Your account is not allowed to change delivery status. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('invoices')
    .select('id, type, status, picking_status')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Document not found' }
  }

  const docType = existing.type === 'quotation' ? 'quotation' : 'invoice'

  // Forward-only enforcement: the requested target must be exactly the next
  // step from the current state — no skipping, never backwards.
  const current = getDeliveryStatus(existing.status, existing.picking_status)
  if (NEXT_DELIVERY_STATUS[docType][current] !== target) {
    return { error: `Cannot change delivery status from ${current} to ${target}.` }
  }

  if (target === 'created') {
    // Draft → Created means issuing the document (draft → sent). Reuses the
    // standard status action so validation + stock deduction stay consistent.
    const result = await updateInvoiceStatus(id, 'sent')
    if (result.error) return { error: result.error }
    return {}
  }

  if (target === 'delivered') {
    // Created → Delivered: full delivered workflow (complete printed loads,
    // stamp delivered, settle stock from loads).
    const result = await markInvoiceDelivered(id)
    if (result.error) return { error: result.error }
    return {}
  }

  // Created → Converted (quotations only): runs the atomic conversion RPC —
  // a new draft invoice is created and this quote is marked converted.
  const result = await convertQuoteToInvoice(id)
  if (result.error) return { error: result.error }
  const invoice = result.invoice
    ? { id: result.invoice.id, document_number: result.invoice.document_number }
    : undefined
  return { invoice }
}
