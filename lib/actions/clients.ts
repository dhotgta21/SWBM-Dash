'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import { isLikelyValidEmail } from '@/lib/utils'
import { DEFAULT_PAYMENT_TERMS_DAYS } from '@/lib/client-credit'

export interface ClientFormData {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  company_name?: string
  account_number?: string
  address_line_1?: string
  address_line_2?: string
  town?: string
  county?: string
  postcode?: string
  notes?: string
  payment_terms_days?: string
  credit_limit?: string
  ai_created?: boolean
  reviewed?: boolean
  is_temporary?: boolean
  promoted_at?: string | null
}

/**
 * Minimum input accepted by createQuickClientRecord. Only first + last name
 * are truly required for a temporary client to be created — phone is
 * collected when given so it can be printed on the invoice and reused for
 * payment follow-up, but it stays optional.
 */
export interface QuickClientFormData {
  first_name: string
  last_name: string
  phone?: string
}

/**
 * Shape returned from both createClientRecord and createQuickClientRecord so
 * the callers in ClientPicker.tsx and the AI assistant don't have to branch
 * on which path was taken.
 */
export type ClientCreateResult =
  | { client: NonNullable<Awaited<ReturnType<typeof createClientRecord>>['client']>; error?: undefined }
  | { client?: undefined; error: string }

function normalizeClientData(data: ClientFormData): ClientFormData {
  return {
    first_name: data.first_name.trim(),
    last_name: data.last_name.trim(),
    email: data.email?.trim().toLowerCase() || undefined,
    phone: data.phone?.trim() || undefined,
    company_name: data.company_name?.trim() || undefined,
    account_number: data.account_number?.trim() || undefined,
    address_line_1: data.address_line_1?.trim() || undefined,
    address_line_2: data.address_line_2?.trim() || undefined,
    town: data.town?.trim() || undefined,
    county: data.county?.trim() || undefined,
    postcode: data.postcode?.trim().toUpperCase() || undefined,
    notes: data.notes?.trim() || undefined,
    payment_terms_days: data.payment_terms_days?.trim() || undefined,
    credit_limit: data.credit_limit?.trim() || undefined,
    ...(data.ai_created !== undefined && { ai_created: data.ai_created }),
    ...(data.reviewed !== undefined && { reviewed: data.reviewed }),
  }
}

/**
 * Parse the payment-terms form value.
 *   undefined — blank/missing; null — invalid; number — valid days.
 */
function parsePaymentTermsDays(value: string | undefined): number | null | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 3650) return null
  return n
}

/**
 * Parse the credit-limit form value (£).
 *   undefined — blank/missing; null — invalid; number — valid amount.
 */
function parseCreditLimit(value: string | undefined): number | null | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function validateClientData(data: ClientFormData, opts?: { requireCredit?: boolean }): string | null {
  if (!data.first_name.trim() || !data.last_name.trim()) {
    return 'First and last name are required'
  }
  if (data.email && !isLikelyValidEmail(data.email)) {
    return 'Invalid email address'
  }
  // AI-assistant rows arrive half-formed (names only) and sit in the review
  // queue until a human completes them through the client form — the
  // compulsory contact / credit-terms rules below only apply to the human
  // create/edit paths. Temporary quick-create rows never reach this action.
  if (!data.ai_created) {
    // At least one contact channel is required — matches the "email or
    // phone" completeness threshold used for temp-client auto-promotion
    // (isClientCompleteEnough). Requiring phone specifically made
    // email-only records impossible to save.
    if (!data.phone?.trim() && !data.email?.trim()) {
      return 'An email address or phone number is required'
    }
    // Credit fields are compulsory for users who may manage them. Staff
    // without the clients_manage_account permission see the inputs disabled
    // and get the defaults (30 days / no limit), so don't block them here.
    if (opts?.requireCredit !== false) {
      const terms = parsePaymentTermsDays(data.payment_terms_days)
      if (terms === undefined) {
        return 'Payment terms (days) are required'
      }
      if (terms === null) {
        return 'Payment terms must be a whole number of days (0–3650)'
      }
      const limit = parseCreditLimit(data.credit_limit)
      if (limit === undefined) {
        return 'Credit limit is required'
      }
      if (limit === null) {
        return 'Credit limit must be a number (0 or more)'
      }
    }
  }
  return null
}

/**
 * What we consider "complete enough" for a temporary client to be auto-promoted
 * back into the main list. Mirrors the Selco/BNQ/Home Depot "trade account"
 * threshold — we want at least one contact channel beyond the name so we can
 * reach the customer about the invoice.
 */
function isClientCompleteEnough(data: ClientFormData): boolean {
  const hasEmail = !!(data.email && data.email.trim())
  const hasPhone = !!(data.phone && data.phone.trim())
  return hasEmail || hasPhone
}

/**
 * If the row is currently temporary and now meets the completeness threshold,
 * return the fields that need to flip. Otherwise return null — no-op.
 *
 * Kept here (not as a separate exported function) so the callers don't have
 * to know the rules; they just sprinkle `applyClientAutoPromote(payload, existing)`
 * into their update payload before they write.
 */
function applyClientAutoPromote(
  payload: Partial<ClientFormData>,
  existing: { is_temporary: boolean; email: string | null; phone: string | null }
): Partial<ClientFormData> {
  if (!existing.is_temporary) return {}
  // The caller passes the FULL normalised form values (not a diff), so a
  // field the operator just cleared arrives as undefined and MUST count
  // as empty. Falling back to the stored value here would resurrect a
  // contact channel the edit removed — and could promote a temp client
  // that no longer has any contact details at all.
  const candidate: ClientFormData = {
    first_name: '',
    last_name: '',
    email: payload.email ?? undefined,
    phone: payload.phone ?? undefined,
  }
  if (isClientCompleteEnough(candidate)) {
    return { is_temporary: false, promoted_at: new Date().toISOString() }
  }
  return {}
}

interface ClientPermissionLookup {
  isAdmin: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  /** Gate for the credit fields (payment terms + credit limit) — they are
   *  a financial-risk control, so they follow the money permission. */
  canManageCredit: boolean
}

async function getClientPermissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ClientPermissionLookup | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return null
  const isAdmin = await isAdminUser(supabase, userId)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  return {
    isAdmin,
    canAdd: isAdmin || perms.clients_add,
    canEdit: isAdmin || perms.clients_edit,
    canDelete: isAdmin || perms.clients_delete,
    canManageCredit: isAdmin || perms.clients_manage_account,
  }
}

export async function createClientRecord(data: ClientFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getClientPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canAdd) {
    return { error: 'Your account is not allowed to add clients. Ask an administrator.' }
  }

  const normalized = normalizeClientData(data)
  const validationError = validateClientData(normalized, { requireCredit: perms.canManageCredit })
  if (validationError) {
    return { error: validationError }
  }

  // Credit fields: only users with the credit permission set them; everyone
  // else gets the defaults (30-day terms, no limit).
  const paymentTermsDays = perms.canManageCredit
    ? (parsePaymentTermsDays(normalized.payment_terms_days) ?? DEFAULT_PAYMENT_TERMS_DAYS)
    : DEFAULT_PAYMENT_TERMS_DAYS
  const creditLimit = perms.canManageCredit
    ? (parseCreditLimit(normalized.credit_limit) ?? null)
    : null

  let clientAccountNumber = normalized.account_number
  if (!clientAccountNumber) {
    const { data: generatedNumber, error: genError } = await supabase.rpc('generate_unique_client_account_number')
    if (genError || !generatedNumber) {
      return { error: 'Could not allocate a client account number. Please try again.' }
    }
    clientAccountNumber = String(generatedNumber)
  } else {
    const { data: duplicate } = await supabase
      .from('clients')
      .select('id')
      .eq('account_number', clientAccountNumber)
      .is('deleted_at', null)
      .maybeSingle()
    if (duplicate) {
      return { error: 'A client with this account number already exists.' }
    }
  }

  // normalized carries the raw string form values for the credit fields;
  // replace them with the parsed numbers (or permission-gated defaults).
  const clientFields = { ...normalized }
  delete clientFields.payment_terms_days
  delete clientFields.credit_limit
  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      ...clientFields,
      account_number: clientAccountNumber,
      payment_terms_days: paymentTermsDays,
      credit_limit: creditLimit,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: safeActionError('clients.createClientRecord', error, 'Could not save the client.') }
  }

  revalidatePath('/clients')
  return { client }
}

/**
 * Quick-create path used by the inline "+ New" affordance inside an invoice
 * or quote. Only first + last name (and an optional phone) are required;
 * everything else stays null until the dashboard "Complete & promote" CTA
 * (or a full edit save) fills them in. The row is stamped is_temporary=true
 * and is deliberately callable only by staff/admin users — the dedicated
 * /clients/new page never invokes this.
 *
 * Account numbers are still generated on the spot so invoices issued
 * immediately afterwards can FK to the row without an extra round-trip.
 */
export async function createQuickClientRecord(data: QuickClientFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getClientPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canAdd) {
    return { error: 'Your account is not allowed to add clients. Ask an administrator.' }
  }

  const first = data.first_name.trim()
  const last = data.last_name.trim()
  const phone = data.phone?.trim() || null
  if (!first || !last) {
    return { error: 'First and last name are required' }
  }

  const { data: generatedNumber, error: genError } = await supabase.rpc(
    'generate_unique_client_account_number'
  )
  if (genError || !generatedNumber) {
    return { error: 'Could not allocate a client account number. Please try again.' }
  }

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      first_name: first,
      last_name: last,
      phone: phone,
      account_number: String(generatedNumber),
      is_temporary: true,
      // Credit terms default until the record is completed through the full
      // client form (the "Complete & promote" CTA), where they are required.
      payment_terms_days: DEFAULT_PAYMENT_TERMS_DAYS,
      credit_limit: null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return { error: safeActionError('clients.createQuickClientRecord', error, 'Could not save the client.') }
  }

  revalidatePath('/clients')
  return { client }
}

export async function updateClientRecord(id: string, data: ClientFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getClientPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canEdit) {
    return { error: 'Your account is not allowed to edit clients. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('clients')
    .select('created_by, first_name, last_name, email, phone, company_name, account_number, address_line_1, address_line_2, town, county, postcode, notes, is_temporary, payment_terms_days, credit_limit')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Client not found' }
  }
  if (existing.created_by !== user.id && !perms.isAdmin) {
    return { error: 'Not authorized' }
  }

  const normalized = normalizeClientData(data)
  const validationError = validateClientData(normalized, { requireCredit: perms.canManageCredit })
  if (validationError) {
    return { error: validationError }
  }

  // Compare truthy strings, treating null/undefined/empty as equivalent so
  // unchanged fields don't get written back to the DB.
  const changed = (next: string | undefined, current: string | null | undefined) => {
    if (!next && !current) return false
    return next !== current
  }

  // Cleared optional fields must be written as NULL — assigning `undefined`
  // would be dropped by JSON serialisation and silently never persist.
  const dbValue = (next: string | undefined): string | null => next ?? null

  const payload: Partial<Record<keyof ClientFormData, string | number | boolean | null>> = {}
  if (changed(normalized.first_name, existing.first_name)) payload.first_name = normalized.first_name ?? ''
  if (changed(normalized.last_name, existing.last_name)) payload.last_name = normalized.last_name ?? ''
  if (changed(normalized.email, existing.email)) payload.email = dbValue(normalized.email)
  if (changed(normalized.phone, existing.phone)) payload.phone = dbValue(normalized.phone)
  if (changed(normalized.company_name, existing.company_name)) payload.company_name = dbValue(normalized.company_name)
  if (changed(normalized.account_number, existing.account_number)) payload.account_number = dbValue(normalized.account_number)
  if (changed(normalized.address_line_1, existing.address_line_1)) payload.address_line_1 = dbValue(normalized.address_line_1)
  if (changed(normalized.address_line_2, existing.address_line_2)) payload.address_line_2 = dbValue(normalized.address_line_2)
  if (changed(normalized.town, existing.town)) payload.town = dbValue(normalized.town)
  if (changed(normalized.county, existing.county)) payload.county = dbValue(normalized.county)
  if (changed(normalized.postcode, existing.postcode)) payload.postcode = dbValue(normalized.postcode)
  if (changed(normalized.notes, existing.notes)) payload.notes = dbValue(normalized.notes)

  // Credit fields — written only by users with the credit permission; the
  // inputs are disabled for everyone else and their values are ignored.
  // A stored NULL means the default (30-day terms / no limit), so compare
  // against the effective values to avoid pointless writes on legacy rows.
  if (perms.canManageCredit) {
    const nextTerms =
      parsePaymentTermsDays(normalized.payment_terms_days) ??
      existing.payment_terms_days ??
      DEFAULT_PAYMENT_TERMS_DAYS
    const currentTerms = existing.payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS
    if (nextTerms !== currentTerms) payload.payment_terms_days = nextTerms

    const nextLimit = parseCreditLimit(normalized.credit_limit) ?? null
    if (nextLimit !== existing.credit_limit) payload.credit_limit = nextLimit
  }

  // Auto-promote: if the row was created as a temporary walk-in (is_temporary
  // = true) and the operator has now filled in at least one contact channel
  // (email or phone), flip it to a permanent client in the same write. Staff
  // editing a temp row becomes "fill in details" not "promote manually".
  Object.assign(
    payload,
    applyClientAutoPromote(
      {
        email: normalized.email,
        phone: normalized.phone,
      },
      {
        is_temporary: existing.is_temporary,
        email: existing.email,
        phone: existing.phone,
      }
    )
  )

  // Application-level duplicate checks so the user gets a clear, field-specific
  // message instead of the generic Postgres 23505 error.
  if (payload.email) {
    const { data: duplicate } = await supabase
      .from('clients')
      .select('id')
      .eq('email', payload.email)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle()
    if (duplicate) {
      return { error: 'A client with this email already exists.' }
    }
  }

  if (payload.phone) {
    const { data: duplicate } = await supabase
      .from('clients')
      .select('id')
      .eq('phone', payload.phone)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle()
    if (duplicate) {
      return { error: 'A client with this phone number already exists.' }
    }
  }

  if (payload.account_number) {
    const { data: duplicate } = await supabase
      .from('clients')
      .select('id')
      .eq('account_number', payload.account_number)
      .is('deleted_at', null)
      .neq('id', id)
      .maybeSingle()
    if (duplicate) {
      return { error: 'A client with this account number already exists.' }
    }
  }

  // Nothing changed — return the existing record without touching the DB.
  if (Object.keys(payload).length === 0) {
    return { client: existing }
  }

  const { data: client, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: safeActionError('clients.updateClientRecord', error, 'Could not save the client.') }
  }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { client }
}

export async function markClientReviewed(id: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getClientPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canEdit) {
    return { error: 'Your account is not allowed to review clients. Ask an administrator.' }
  }

  const { data: existing } = await supabase
    .from('clients')
    .select('created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .single()
  if (!existing) {
    return { error: 'Client not found' }
  }
  if (existing.created_by !== user.id && !perms.isAdmin) {
    return { error: 'Not authorized' }
  }

  const { error } = await supabase.from('clients').update({ reviewed: true }).eq('id', id)
  if (error) {
    return { error: safeActionError('clients.markClientReviewed', error, 'Could not mark client as reviewed.') }
  }

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  return { success: true }
}

export async function deleteClientRecord(id: string, password: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getClientPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canDelete) {
    return { error: 'Your account is not allowed to delete clients. Ask an administrator.' }
  }

  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null

  const { data: result, error } = await supabase.rpc('soft_delete_client', {
    p_client_id: id,
    p_password: password,
    p_ip_address: ip === 'unknown' ? null : ip,
    p_user_agent: userAgent,
  })

  if (error) {
    return { error: safeActionError('clients.deleteClientRecord', error, 'Could not delete the client.') }
  }

  if (!result?.success) {
    return { error: result?.message || 'Could not delete the client.' }
  }

  revalidatePath('/clients')
  return { success: true }
}
