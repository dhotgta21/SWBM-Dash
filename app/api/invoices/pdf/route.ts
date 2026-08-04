// app/api/invoices/pdf/route.ts
// Server-side PDF generation for invoices and quotations. This moves
// @react-pdf/renderer out of the browser so the CSP can drop 'unsafe-eval'
// everywhere.
//
// Supports three modes:
//   1. { shareToken: string } — public (unauthenticated) download of a shared
//      invoice or delivery note.
//   2. { invoiceId: string } — authenticated dashboard/print/email download.
//      The caller must own the invoice or be an admin.
//   3. { preview: InvoicePdfProps } — authenticated preview before an invoice
//      is saved (used by /invoices/new).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderInvoicePdf, type InvoiceRenderMode } from '@/lib/invoices/render-pdf'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { getLogoDataUrl } from '@/lib/logo'
import { loadCompany } from '@/lib/company'
import { withQueryRetry } from '@/lib/supabase/with-query-retry'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/ip'
import {
  findPublicInvoiceByToken,
  getShareAccessForMode,
  type ShareDocumentMode,
} from '@/lib/share/public-invoice-lookup'
import { isLegacyShareToken, isShareKey } from '@/lib/share/share-key'
import { verifySharePassword } from '@/lib/share/share-password'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { previewInvoiceSchema } from '@/lib/invoices/preview-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Per-IP rate limit applied to the PDF endpoint. The token IS the auth
 * for the public share path, but a leaked link could still DoS the
 * (relatively expensive) @react-pdf renderer. We cap any single IP at
 * 30 requests / minute — generous for a real client (one render per
 * page-load + retries on flaky networks) and tight enough to cut off a
 * bot. failClosed: if the rate-limit RPC is unavailable we refuse
 * rather than let the renderer be hammered.
 */
const PDF_RATE_LIMIT_MAX = 30
const PDF_RATE_LIMIT_WINDOW_MS = 60_000

function getPdfClientIp(request: NextRequest): string {
  const ip = getClientIp(request.headers)
  // getClientIp returns '0.0.0.0' when TRUST_PROXY is unset; preserve the
  // previous 'unknown' sentinel for the rate-limit key in that case so the
  // key stays stable across requests.
  return ip === '0.0.0.0' ? 'unknown' : ip
}

function sortInvoiceItems(items: unknown[]): unknown[] {
  return [...items].sort((a, b) => {
    const ao = (a as { sort_order?: number }).sort_order ?? 0
    const bo = (b as { sort_order?: number }).sort_order ?? 0
    return ao - bo
  })
}

function notFound() {
  return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
}

function forbidden(message = 'You do not have permission to download this invoice') {
  return NextResponse.json({ error: message }, { status: 403 })
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 })
}

function isMissingColumnError(message: string | undefined, column: string): boolean {
  const msg = (message ?? '').toLowerCase()
  return msg.includes(column.toLowerCase()) && msg.includes('does not exist')
}

const PDF_INVOICE_SELECT_FULL = `id, type, document_number, order_number, account_number, issue_date, issue_time,
         due_date, expiry_date, operator_name, notes,
         show_payment_terms, show_watermark, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, paid_by, paid_at, overdue_at, status_stamps_enabled, status_stamps_mode, status, updated_at, subtotal, vat_total, total, amount_paid, balance_due,
         delivery_method, delivery_address_line_1, delivery_address_line_2,
         delivery_town, delivery_county, delivery_postcode,
         share_token, public_share_enabled, share_token_expires_at,
         discount_amount, discount_percent,
         clients (first_name, last_name, company_name, address_line_1, address_line_2,
                   town, county, postcode, email, phone),
         invoice_items (id, product_name, product_code, unit, quantity, price,
                        vat_rate, vat_amount, line_total, sort_order,
                        discount_amount, discount_percent)`

// Lean select for partial demo schemas missing migration 101 discount columns.
const PDF_INVOICE_SELECT_LEAN = `id, type, document_number, order_number, account_number, issue_date, issue_time,
         due_date, expiry_date, operator_name, notes,
         show_payment_terms, show_watermark, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, paid_by, paid_at, overdue_at, status_stamps_enabled, status_stamps_mode, status, updated_at, subtotal, vat_total, total, amount_paid, balance_due,
         delivery_method, delivery_address_line_1, delivery_address_line_2,
         delivery_town, delivery_county, delivery_postcode,
         share_token, public_share_enabled, share_token_expires_at,
         clients (first_name, last_name, company_name, address_line_1, address_line_2,
                   town, county, postcode, email, phone),
         invoice_items (id, product_name, product_code, unit, quantity, price,
                        vat_rate, vat_amount, line_total, sort_order)`

function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: 'Too many PDF requests. Please slow down.' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter))) },
    }
  )
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return serverError('Supabase environment not configured')
  }

  // Per-IP rate limit applied before we touch the DB or do any
  // rendering work. We use the anon client for the call — the RPC is
  // SECURITY DEFINER and grant-restricted to anon + authenticated, so
  // the unauthenticated public share path is covered too.
  try {
    const ip = getPdfClientIp(request)
    const anonForRateLimit = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const rl = await rateLimit(
      anonForRateLimit,
      `pdf:${ip}`,
      PDF_RATE_LIMIT_MAX,
      PDF_RATE_LIMIT_WINDOW_MS,
      { failOpen: false }
    )
    if (!rl.allowed) {
      return tooManyRequests(rl.retryAfter)
    }
  } catch (err) {
    // Rate-limit setup itself failed (env missing, anon client broken).
    // Fail closed: an unthrottled PDF renderer is an easy DoS vector.
    console.error('PDF rate-limit check failed:', err)
    return tooManyRequests(60)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const typedBody = body as Record<string, unknown>
  const hasShareToken =
    typeof typedBody.shareToken === 'string' && typedBody.shareToken.length > 0
  const hasInvoiceId =
    typeof typedBody.invoiceId === 'string' && typedBody.invoiceId.length > 0
  const hasLoadId = typeof typedBody.loadId === 'string'
  const mode = hasShareToken || hasInvoiceId ? 'existing' : typedBody.preview ? 'preview' : null

  const renderMode: InvoiceRenderMode =
    typedBody.mode === 'delivery-note' ? 'delivery-note' : 'invoice'
  const copies = Math.max(1, Math.min(50, Math.floor(Number(typedBody.copies) || 1)))

  if (mode === 'existing') {
    // Prefer authenticated invoiceId when both are present. Callers used to
    // send shareToken + invoiceId together; a disabled/draft share path then
    // 404'd even though the operator had a valid session + UUID.
    if (hasInvoiceId) {
      return generateAuthenticatedPdf({
        invoiceId: typedBody.invoiceId as string,
        loadId: hasLoadId ? (typedBody.loadId as string) : undefined,
        renderMode,
        copies,
      })
    }
    return generatePublicPdf({
      shareToken: typedBody.shareToken as string,
      password: typeof typedBody.password === 'string' ? typedBody.password : undefined,
      supabaseUrl,
      serviceRoleKey,
      renderMode,
      copies,
    })
  }

  if (mode === 'preview') {
    const parsed = previewInvoiceSchema.safeParse(typedBody.preview)
    if (!parsed.success) {
      return badRequest('Invalid preview payload')
    }
    return generatePreviewPdf(parsed.data as InvoicePdfProps, renderMode, copies)
  }

  return badRequest('Request must include invoiceId, shareToken, or preview')
}

function isValidShareToken(value: string): boolean {
  return isShareKey(value) || isLegacyShareToken(value)
}

async function generatePublicPdf({
  shareToken,
  password,
  supabaseUrl,
  serviceRoleKey,
  renderMode,
  copies,
}: {
  shareToken: string
  password?: string
  supabaseUrl: string
  serviceRoleKey?: string
  renderMode: InvoiceRenderMode
  copies: number
}) {
  if (!isValidShareToken(shareToken)) {
    return notFound()
  }

  if (!serviceRoleKey) {
    console.error('PDF share-token request rejected: SUPABASE_SERVICE_ROLE_KEY is not set')
    return serverError('Supabase service role key not configured')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const shareMode: ShareDocumentMode =
    renderMode === 'delivery-note' ? 'delivery-note' : 'invoice'

  const [invoiceResult, companyResult, companyChannelsResult, bankResult] = await Promise.all([
    findPublicInvoiceByToken(admin, shareToken, shareMode),
    withQueryRetry('company_settings (public pdf)', () =>
      admin.from('company_settings').select('*').maybeSingle()
    ),
    loadCompany(),
    withQueryRetry('company_bank_details (public pdf)', () =>
      admin.from('company_bank_details').select('*').maybeSingle()
    ),
  ])

  if (invoiceResult.error || !invoiceResult.data) {
    console.error('PDF invoice fetch failed (share token):', invoiceResult.error)
    return notFound()
  }

  const invoice = invoiceResult.data
  if (
    invoice.share_token_expires_at &&
    new Date(invoice.share_token_expires_at) < new Date()
  ) {
    return notFound()
  }

  const access = getShareAccessForMode(invoice, shareMode)
  if (access.requiresPassword) {
    if (!password) {
      return notFound()
    }
    const valid = await verifySharePassword(password, access.passwordHash)
    if (!valid) {
      return notFound()
    }
  }

  if (Array.isArray((invoice as { invoice_items?: unknown[] }).invoice_items)) {
    ;(invoice as { invoice_items: unknown[] }).invoice_items = sortInvoiceItems(
      (invoice as { invoice_items: unknown[] }).invoice_items
    )
  }

  const company = {
    ...(companyResult.data ?? {}),
    phone: companyChannelsResult?.phone ?? companyResult.data?.phone ?? null,
    email: companyChannelsResult?.email ?? companyResult.data?.email ?? null,
    phones: companyChannelsResult?.phones ?? [],
    emails: companyChannelsResult?.emails ?? [],
  }
  const bankDetails = bankResult.data ?? {}
  const logoSrc = await getLogoDataUrl()

  const props: InvoicePdfProps = {
    invoice: invoice as unknown as InvoicePdfProps['invoice'],
    company,
    bankDetails,
    logoSrc,
  }

  return renderAndRespond(props, invoice.document_number as string, renderMode, copies)
}

async function generateAuthenticatedPdf({
  invoiceId,
  loadId,
  renderMode,
  copies,
}: {
  invoiceId: string
  loadId?: string
  renderMode: InvoiceRenderMode
  copies: number
}) {
  if (!UUID_RE.test(invoiceId)) {
    return notFound()
  }
  if (loadId && !UUID_RE.test(loadId)) {
    return notFound()
  }

  const serverSupabase = await createServerClient()
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Use the service-role client for invoice lookups. The RLS policy on
  // invoices only grants row access to the creator, admins, and the linked
  // client; staff with see_invoices and pickers who have picked a load would
  // otherwise get a misleading 404. We perform our own permission checks
  // before rendering.
  const adminClient = createAdminClient()

  const { data: invoice, error: invoiceError } = await adminClient
    .from('invoices')
    .select('id, created_by, type, status, deleted_at, document_number')
    .eq('id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (invoiceError || !invoice) {
    console.error('PDF invoice fetch failed (authenticated):', invoiceError)
    return notFound()
  }

  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()

  // Align PDF access with who can open the invoice in the dashboard.
  // Returning 404 for authz denials made "Preview" look like a missing
  // document when staff could already see line items on the detail page.
  let canPrint = false
  if (profile) {
    if (profile.role === 'admin' || invoice.created_by === user.id) {
      canPrint = true
    } else if (profile.role === 'picker') {
      // Pickers may ONLY render the delivery note (no prices) — never the
      // full invoice, regardless of the requested mode. This is the picker
      // shell's "no access to prices" contract enforced server-side, the
      // same way it is for drivers below.
      if (renderMode !== 'delivery-note') {
        return forbidden('Pickers can only print delivery notes')
      }
      // A loadId is mandatory: without it the template would receive every
      // invoice line (including other pickers'/drivers' loads). With loadId
      // the item filter + per-picker ownership check below scopes the note
      // to the picker's own load.
      if (!loadId) {
        return badRequest('loadId is required for picker delivery notes')
      }
      const { data: pickerLoad } = await adminClient
        .from('delivery_loads')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('picked_by', user.id)
        .limit(1)
        .maybeSingle()
      if (pickerLoad) canPrint = true
    } else if (profile.role === 'driver') {
      // Drivers may ONLY render the delivery note (no prices) — never the
      // full invoice, regardless of the requested mode. This is the driver
      // shell's "no prices" contract enforced server-side.
      if (renderMode !== 'delivery-note') {
        return forbidden('Drivers can only print delivery notes')
      }
      // A loadId is mandatory so the item filter below scopes the note to
      // the driver's own load (otherwise every invoice line would render).
      if (!loadId) {
        return badRequest('loadId is required for driver delivery notes')
      }
      const { data: driverLoad } = await adminClient
        .from('delivery_loads')
        .select('id')
        .eq('invoice_id', invoiceId)
        .eq('assigned_driver_id', user.id)
        .limit(1)
        .maybeSingle()
      if (driverLoad) canPrint = true
    } else if (profile.role === 'staff') {
      const perms = resolveStaffPermissions(profile.role, profile.permissions)
      // Staff who can open the invoices section may download/print the PDF
      // for documents they can already see in the UI. Money redaction for
      // staff without invoices_see_money is handled in the HTML detail view;
      // the PDF still requires see_invoices (or stronger) so we do not open
      // a back-door for staff with the section fully disabled.
      if (
        perms.see_invoices ||
        perms.invoices_edit ||
        perms.invoices_see_money ||
        perms.invoices_add
      ) {
        canPrint = true
      }
    } else if (profile.role === 'client') {
      // Portal clients may only print invoices linked to their client_id.
      const { data: clientProfile } = await serverSupabase
        .from('profiles')
        .select('client_id')
        .eq('id', user.id)
        .maybeSingle()
      if (clientProfile?.client_id) {
        const { data: clientInvoice } = await adminClient
          .from('invoices')
          .select('id')
          .eq('id', invoiceId)
          .eq('client_id', clientProfile.client_id)
          .maybeSingle()
        if (clientInvoice) canPrint = true
      }
    }
  }

  if (!canPrint) {
    return forbidden()
  }

  async function loadFullInvoice(select: string) {
    return adminClient
      .from('invoices')
      .select(select)
      .eq('id', invoiceId)
      .is('deleted_at', null)
      .maybeSingle()
  }

  let invoiceResult = await loadFullInvoice(PDF_INVOICE_SELECT_FULL)
  if (
    invoiceResult.error &&
    (isMissingColumnError(invoiceResult.error.message, 'discount_amount') ||
      isMissingColumnError(invoiceResult.error.message, 'discount_percent'))
  ) {
    console.warn(
      'PDF invoice fetch: discount columns missing; retrying lean select',
      invoiceResult.error.message
    )
    invoiceResult = await loadFullInvoice(PDF_INVOICE_SELECT_LEAN)
  }

  const [companyResult, companyChannelsResult, bankResult] = await Promise.all([
    withQueryRetry('company_settings (authenticated pdf)', () =>
      adminClient.from('company_settings').select('*').maybeSingle()
    ),
    loadCompany(),
    withQueryRetry('company_bank_details (authenticated pdf)', () =>
      adminClient.from('company_bank_details').select('*').maybeSingle()
    ),
  ])

  if (invoiceResult.error || !invoiceResult.data) {
    console.error('PDF invoice fetch failed (authenticated):', invoiceResult.error)
    // Schema lag / unexpected select errors should not look like a missing UUID.
    if (invoiceResult.error) {
      return serverError('Could not load invoice for PDF. Check server logs.')
    }
    return notFound()
  }

  // Pull the current user's full name so we can fall back to it when a legacy
  // invoice has "Unknown Operator" stored.
  let operatorName: string | undefined
  if (user) {
    const { data: operatorProfile } = await serverSupabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    operatorName = operatorProfile?.full_name || undefined
  }

  // Dynamic select strings are not fully typed by supabase-js; cast once.
  type PdfInvoiceRow = {
    document_number: string
    invoice_items?: unknown[]
    load_number?: number
    [key: string]: unknown
  }
  const fullInvoice = invoiceResult.data as unknown as PdfInvoiceRow

  // If a loadId is provided, filter the invoice items to only those on the load
  // and attach the load number for the delivery note template.
  let loadNumber: number | undefined
  if (loadId) {
    const { data: load } = await adminClient
      .from('delivery_loads')
      .select(
        'id, load_number, picked_by, assigned_driver_id, status, delivery_load_items(invoice_item_id, quantity, status)'
      )
      .eq('id', loadId)
      .eq('invoice_id', invoiceId)
      .single()

    if (!load) {
      return notFound()
    }

    // Pickers may only print loads they actually picked.
    if (profile?.role === 'picker' && load.picked_by !== user.id) {
      return notFound()
    }
    // Drivers may only print loads assigned to them.
    if (profile?.role === 'driver' && load.assigned_driver_id !== user.id) {
      return notFound()
    }

    loadNumber = load.load_number

    // Only loaded rows belong on the delivery note, and they must print the
    // quantity that went on THIS load (not the full invoice-line quantity).
    const loadedQuantities = new Map<string, number>(
      (Array.isArray(load.delivery_load_items) ? load.delivery_load_items : [])
        .filter((li: { status: string }) => li.status === 'loaded')
        .map((li: { invoice_item_id: string; quantity: number }) => [
          li.invoice_item_id,
          Number(li.quantity),
        ])
    )

    const filteredItems = (fullInvoice.invoice_items ?? [])
      .filter((item: unknown) => {
        const invoiceItemId = (item as { id?: string }).id
        return invoiceItemId && loadedQuantities.has(invoiceItemId)
      })
      .map((item: unknown) => {
        const invoiceItemId = (item as { id?: string }).id as string
        return {
          ...(item as Record<string, unknown>),
          quantity: loadedQuantities.get(invoiceItemId),
        }
      })

    fullInvoice.invoice_items = sortInvoiceItems(filteredItems)
    fullInvoice.load_number = load.load_number
  } else if (Array.isArray(fullInvoice.invoice_items)) {
    fullInvoice.invoice_items = sortInvoiceItems(fullInvoice.invoice_items ?? [])
  }

  const company = {
    ...(companyResult.data ?? {}),
    phone: companyChannelsResult?.phone ?? companyResult.data?.phone ?? null,
    email: companyChannelsResult?.email ?? companyResult.data?.email ?? null,
    phones: companyChannelsResult?.phones ?? [],
    emails: companyChannelsResult?.emails ?? [],
  }
  const bankDetails = bankResult.data ?? {}
  const logoSrc = await getLogoDataUrl()

  const props: InvoicePdfProps = {
    invoice: fullInvoice as unknown as InvoicePdfProps['invoice'],
    company,
    bankDetails,
    logoSrc,
    operatorName,
  }

  return renderAndRespond(props, String(fullInvoice.document_number), renderMode, copies)
}
async function generatePreviewPdf(
  preview: InvoicePdfProps,
  renderMode: InvoiceRenderMode,
  copies: number
) {
  const serverSupabase = await createServerClient()
  const {
    data: { user },
    error: userError,
  } = await serverSupabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: profile } = await serverSupabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || profile.role === 'client') {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const isAdminUserRow = await isAdminUser(serverSupabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_add && !perms.invoices_edit) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  // Always load company + bank server-side. The preview Zod schema only
  // validates `invoice`, so client-supplied company/bank are stripped (or
  // untrusted). Matching generateAuthenticatedPdf keeps new-invoice and
  // unsaved-preview PDFs consistent with the on-screen document.
  const admin = createAdminClient()
  const [companyResult, companyChannelsResult, bankResult] = await Promise.all([
    withQueryRetry('company_settings (preview pdf)', () =>
      admin.from('company_settings').select('*').maybeSingle()
    ),
    loadCompany(),
    withQueryRetry('company_bank_details (preview pdf)', () =>
      admin.from('company_bank_details').select('*').maybeSingle()
    ),
  ])

  const company = {
    ...(companyResult.data ?? {}),
    phone: companyChannelsResult?.phone ?? companyResult.data?.phone ?? null,
    email: companyChannelsResult?.email ?? companyResult.data?.email ?? null,
    phones: companyChannelsResult?.phones ?? [],
    emails: companyChannelsResult?.emails ?? [],
  }
  const bankDetails = bankResult.data ?? {}
  const logoSrc = await getLogoDataUrl()
  const sortedPreview: InvoicePdfProps = {
    invoice: {
      ...preview.invoice,
      invoice_items: Array.isArray(preview.invoice.invoice_items)
        ? (sortInvoiceItems(preview.invoice.invoice_items) as InvoicePdfProps['invoice']['invoice_items'])
        : preview.invoice.invoice_items,
    },
    company,
    bankDetails,
    logoSrc,
  }

  return renderAndRespond(sortedPreview, preview.invoice.document_number, renderMode, copies)
}

async function renderAndRespond(
  props: InvoicePdfProps,
  documentNumber: string,
  renderMode: InvoiceRenderMode,
  copies: number
) {
  try {
    const buffer = await renderInvoicePdf({ ...props, mode: renderMode, copies })
    const suffix = renderMode === 'delivery-note' ? '_delivery_note' : ''
    const filename = `${String(documentNumber).replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}.pdf`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (err) {
    console.error('PDF render failed:', err)
    return serverError(err instanceof Error ? err.message : 'Failed to render PDF')
  }
}
