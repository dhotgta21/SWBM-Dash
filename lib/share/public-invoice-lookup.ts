import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isLegacyShareToken, isShareKey } from './share-key'
import type { InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'

export type ShareDocumentMode = 'invoice' | 'delivery-note'

export type PublicInvoiceRow = InvoicePdfProps['invoice'] & {
  id: string
  share_token: string
  public_share_key: string | null
  public_share_enabled: boolean
  public_share_requires_password: boolean
  public_share_password_hash: string | null
  delivery_note_share_enabled: boolean
  delivery_note_share_requires_password: boolean
  delivery_note_share_password_hash: string | null
  share_token_expires_at: string | null
}

export type ShareAccessSettings = {
  enabled: boolean
  requiresPassword: boolean
  passwordHash: string | null
}

/**
 * Resolve visibility / password settings for a specific share document mode.
 * Invoice and delivery-note links are independent even though they share the
 * same base token/key and expiry.
 */
export function getShareAccessForMode(
  row: Pick<
    PublicInvoiceRow,
    | 'public_share_enabled'
    | 'public_share_requires_password'
    | 'public_share_password_hash'
    | 'delivery_note_share_enabled'
    | 'delivery_note_share_requires_password'
    | 'delivery_note_share_password_hash'
  >,
  mode: ShareDocumentMode = 'invoice'
): ShareAccessSettings {
  if (mode === 'delivery-note') {
    return {
      enabled: row.delivery_note_share_enabled === true,
      requiresPassword: row.delivery_note_share_requires_password === true,
      passwordHash: row.delivery_note_share_password_hash ?? null,
    }
  }
  return {
    enabled: row.public_share_enabled === true,
    requiresPassword: row.public_share_requires_password === true,
    passwordHash: row.public_share_password_hash ?? null,
  }
}

type AnySupabase = SupabaseClient<Database, 'public'>

/**
 * Look up a publicly shareable invoice by its opaque share key or legacy UUID
 * share token. Returns the row only when:
 *   - the mode-specific share flag is true
 *     (invoice → public_share_enabled, delivery-note → delivery_note_share_enabled)
 *   - the link has not expired
 *
 * The returned row includes password hashes so callers can verify a
 * password-protected link. Public-facing routes must strip the hashes before
 * sending data to the client.
 */
export async function findPublicInvoiceByToken(
  admin: AnySupabase,
  token: string,
  mode: ShareDocumentMode = 'invoice'
): Promise<{ data: PublicInvoiceRow | null; error: PostgrestError | null }> {
  const now = new Date().toISOString()

  // Only issued documents are publicly shareable. Drafts, converted quotes,
  // and other non-issued statuses must never resolve via a share link even
  // if a share flag was left on by mistake.
  const PUBLIC_SHARE_STATUSES = ['sent', 'partial', 'paid'] as const

  let query = admin
    .from('invoices')
    .select(
      `id, type, document_number, issue_date, issue_time, due_date, expiry_date,
       order_number, account_number, operator_name, your_reference, notes,
       show_payment_terms, show_watermark, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, paid_by, paid_at, overdue_at, status_stamps_enabled, status_stamps_mode, status, updated_at, subtotal, vat_total, total, amount_paid, balance_due,
       delivery_method, delivery_address_line_1, delivery_address_line_2,
       delivery_town, delivery_county, delivery_postcode,
       share_token, public_share_enabled, share_token_expires_at,
       public_share_key, public_share_requires_password, public_share_password_hash,
       delivery_note_share_enabled, delivery_note_share_requires_password, delivery_note_share_password_hash,
       discount_amount, discount_percent,
       clients (first_name, last_name, company_name, address_line_1, address_line_2,
                town, county, postcode),
       invoice_items (product_name, product_code, unit, quantity, price,
                      vat_rate, vat_amount, line_total, sort_order,
                      discount_amount, discount_percent)`
    )
    .eq(
      mode === 'delivery-note' ? 'delivery_note_share_enabled' : 'public_share_enabled',
      true
    )
    .in('status', [...PUBLIC_SHARE_STATUSES])
    .is('deleted_at', null)
    .or(`share_token_expires_at.is.null,share_token_expires_at.gte.${now}`)

  if (isLegacyShareToken(token)) {
    query = query.eq('share_token', token)
  } else if (isShareKey(token)) {
    query = query.eq('public_share_key', token)
  } else {
    return { data: null, error: null }
  }

  const { data, error } = await query.maybeSingle()
  return { data: data as PublicInvoiceRow | null, error }
}
