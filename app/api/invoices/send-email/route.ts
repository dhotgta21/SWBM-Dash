// app/api/invoices/send-email/route.ts
// Sends a generated invoice PDF to a client (or a manually-entered
// address) via Resend. The PDF is rendered server-side and attached.
// The email body HTML/text is rendered server-side from fresh DB data
// (or from a preview payload right after creation) so the content is
// always server-authoritative.
//
// Supports two modes:
//   { invoiceId, recipientEmail? }              — lookup saved invoice in DB
//   { preview: InvoicePdfProps, recipientEmail? } — render from preview data
//
// Required configuration (env or Settings → Integrations):
//   RESEND_API_KEY      Resend API key (https://resend.com/api-keys)
//   RESEND_FROM_ADDRESS e.g. "Star Hawk <noreply@yourdomain.com>"

import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import {
  renderInvoiceEmailHtml,
  renderInvoiceEmailSubject,
  renderInvoiceEmailText,
} from '@/lib/email/invoice-template'
import { buildInvoiceShareUrl, resolveBaseUrl } from '@/lib/share/invoice-url'
import { requireInvoiceAccess, isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { isLikelyValidEmail } from '@/lib/utils'
import { rateLimit } from '@/lib/rate-limit'
import { loadCompany } from '@/lib/company'
import { withQueryRetry } from '@/lib/supabase/with-query-retry'
import { buildEmailFromHeader } from '@/lib/email/from-header'
import { getResendApiKey, getResendFromAddress } from '@/lib/resend'
import { renderInvoicePdf } from '@/lib/invoices/render-pdf'
import { getLogoDataUrl } from '@/lib/logo'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { previewInvoiceSchema } from '@/lib/invoices/preview-schema'
import { shouldBypassOutboundEmail } from '@/lib/demo/mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SendEmailBody {
  invoiceId?: string
  recipientEmail?: string
  preview?: InvoicePdfProps
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

function serverError(message: string) {
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : ''

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return serverError('Supabase environment not configured')
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Missing Authorization bearer token' }, { status: 401 })
  }

  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userError,
  } = await anon.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const rl = await rateLimit(anon, `sendemail:${user.id}`, 30, 60 * 60_000, { failOpen: false })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Too many emails sent. Please try again in ${Math.ceil(rl.retryAfter)}s.` },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfter)) },
      }
    )
  }

  let body: SendEmailBody
  try {
    body = (await request.json()) as SendEmailBody
  } catch {
    return badRequest('Invalid JSON body')
  }

  const isPreview = !!body.preview
  if (!isPreview && !body.invoiceId) {
    return badRequest('Missing invoiceId')
  }
  if (isPreview && !body.preview?.invoice) {
    return badRequest('Missing preview invoice')
  }

  // Authorization for DB mode only. Preview mode is used right after the
  // caller created the invoice; the send-email permission gate below is
  // still enforced, so a user without that permission cannot send.
  if (!isPreview) {
    const access = await requireInvoiceAccess(anon, body.invoiceId!, user.id)
    if (!access.ok) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
  }

  const { data: profile } = await anon
    .from('profiles')
    .select('role, permissions, full_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }
  const isAdminUserRow = await isAdminUser(anon, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_send_email) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  let invoiceData: InvoicePdfProps['invoice']
  let emailItems: InvoicePdfProps['invoice']['invoice_items']
  let emailClient: InvoicePdfProps['invoice']['clients']

  if (isPreview) {
    const parsed = previewInvoiceSchema.safeParse(body.preview)
    if (!parsed.success) {
      return badRequest('Invalid preview payload')
    }
    invoiceData = parsed.data.invoice as InvoicePdfProps['invoice']
    emailItems = invoiceData.invoice_items ?? []
    emailClient = Array.isArray(invoiceData.clients) ? invoiceData.clients[0] : invoiceData.clients

    // Preview mode is meant for the "invoice just created" flow. Restrict the
    // recipient to the client on the invoice. Both the preview payload and the
    // recipient come from the request body, so comparing them proves nothing —
    // look up the SAVED invoice's client email server-side (by its unique
    // document number) and compare against that instead.
    if (body.recipientEmail) {
      const { data: savedInvoice } = await anon
        .from('invoices')
        .select('clients(email)')
        .eq('document_number', invoiceData.document_number)
        .is('deleted_at', null)
        .maybeSingle()
      const dbClient = savedInvoice
        ? Array.isArray(savedInvoice.clients)
          ? savedInvoice.clients[0]
          : savedInvoice.clients
        : null
      const dbClientEmail = (dbClient?.email ?? '').trim().toLowerCase()
      if (!dbClientEmail || body.recipientEmail.trim().toLowerCase() !== dbClientEmail) {
        return badRequest('Preview emails can only be sent to the client on the invoice')
      }
    }
  } else {
    const [
      { data: invoice, error: invoiceError },
      { data: items, error: itemsError },
    ] = await Promise.all([
      anon
        .from('invoices')
        .select(
          `id, type, document_number, order_number, account_number, issue_date, issue_time, due_date, expiry_date,
           your_reference, notes, show_payment_terms, show_watermark, show_paid_watermark, show_partially_paid_watermark, show_overdue_watermark, paid_by, paid_at, overdue_at, status_stamps_enabled, status_stamps_mode, status, updated_at, operator_name, subtotal, vat_total, total, amount_paid, balance_due,
           delivery_method, delivery_address_line_1, delivery_address_line_2,
           delivery_town, delivery_county, delivery_postcode,
           share_token, public_share_enabled, share_token_expires_at,
           clients(first_name, last_name, company_name, account_number, email,
                    address_line_1, address_line_2, town, county, postcode, phone)`
        )
        .eq('id', body.invoiceId!)
        .is('deleted_at', null)
        .single(),
      anon
        .from('invoice_items')
        .select('product_name, product_code, unit, quantity, price, vat_rate, vat_amount, line_total, sort_order')
        .eq('invoice_id', body.invoiceId!)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true }),
    ])

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (itemsError) {
      return serverError(`Failed to load invoice items: ${itemsError.message}`)
    }

    invoiceData = invoice
    emailItems = items ?? []
    emailClient = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  }

  const [{ data: companyRow }, { data: bankRow }, companyChannels] = await Promise.all([
    withQueryRetry('company_settings (invoice email)', () =>
      anon.from('company_settings').select('*').maybeSingle()
    ),
    withQueryRetry('company_bank_details (invoice email)', () =>
      anon.from('company_bank_details').select('*').maybeSingle()
    ),
    loadCompany(),
  ])

  const companyForRendering = {
    ...(companyRow ?? {}),
    phone: companyChannels?.phone ?? companyRow?.phone ?? null,
    email: companyChannels?.email ?? companyRow?.email ?? null,
    phones: companyChannels?.phones ?? [],
    emails: companyChannels?.emails ?? [],
  }

  // Brand logo is a static asset in /public — uploads have been removed.
  const logoSrc = await getLogoDataUrl()

  // Sort items by the operator-defined order so the PDF and email body agree.
  const sortedEmailItems = [...(emailItems ?? [])].sort((a, b) => {
    const ao = (a as { sort_order?: number }).sort_order ?? 0
    const bo = (b as { sort_order?: number }).sort_order ?? 0
    return ao - bo
  })

  // The PDF renderer reads line items from invoice.invoice_items, but the
  // email body template reads them from a separate `items` variable. Merge
  // the items back into the invoice so the attachment matches the email.
  const invoiceForPdf = {
    ...invoiceData,
    invoice_items: sortedEmailItems,
  }

  let pdfBuffer: Buffer
  try {
    pdfBuffer = await renderInvoicePdf({
      invoice: invoiceForPdf as unknown as Parameters<typeof renderInvoicePdf>[0]['invoice'],
      company: companyForRendering,
      bankDetails: bankRow ?? {},
      logoSrc,
      operatorName: profile?.full_name || undefined,
    })
  } catch (err) {
    console.error('Email PDF render failed:', err)
    return serverError(err instanceof Error ? err.message : 'Failed to render PDF attachment')
  }
  const pdfFilename = `${String(invoiceData.document_number ?? 'document').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`

  const recipient = (body.recipientEmail || emailClient?.email || '').trim().toLowerCase()
  if (!recipient) {
    return badRequest('No recipient email — client has no email and no override was provided')
  }
  if (!isLikelyValidEmail(recipient)) {
    return badRequest('Recipient email is not a valid address')
  }

  const fromName =
    companyRow?.email_from_name || companyRow?.company_name || 'Demo Builder Merchant'
  const replyTo = (companyRow?.email_reply_to || companyRow?.email || '').trim() || undefined

  if (shouldBypassOutboundEmail()) {
    return NextResponse.json(
      {
        error:
          'Demo mode: outbound email is disabled. Download the PDF or use share link instead.',
      },
      { status: 400 }
    )
  }

  const apiKey = await getResendApiKey()
  const envFrom = await getResendFromAddress()
  if (!apiKey) {
    return serverError('Email is not configured. Set RESEND_API_KEY in .env.local or save it in Settings → Integrations.')
  }
  if (!envFrom) {
    return serverError('Email is not configured. Set RESEND_FROM_ADDRESS in .env.local or save it in Settings → Integrations.')
  }

  let baseUrl: string | null = null
  try {
    baseUrl = resolveBaseUrl({ request })
  } catch (err) {
    console.warn('Failed to resolve base URL for invoice email:', err)
  }

  let viewUrl: string | null = null
  const linkExpired =
    invoiceData.share_token_expires_at &&
    new Date(invoiceData.share_token_expires_at) < new Date()

  if (
    baseUrl &&
    (invoiceData.public_share_key || invoiceData.share_token) &&
    invoiceData.public_share_enabled !== false &&
    !linkExpired
  ) {
    try {
      viewUrl = buildInvoiceShareUrl({ shareKey: invoiceData.public_share_key, shareToken: invoiceData.share_token, baseUrl })
    } catch (err) {
      console.warn('Failed to build public view URL for invoice email:', err)
    }
  }

  // Brand logo is a static asset in /public — uploads have been removed.
  // Email clients need an absolute URL, so use the canonical base URL.
  const logoUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/Logo.png` : null

  const templateData = {
    invoice: {
      type: invoiceData.type as 'invoice' | 'quotation',
      document_number: invoiceData.document_number,
      order_number: invoiceData.order_number ?? null,
      issue_date: invoiceData.issue_date,
      issue_time: invoiceData.issue_time ?? null,
      due_date: invoiceData.due_date,
      expiry_date: invoiceData.expiry_date,
      your_reference: invoiceData.your_reference || invoiceData.order_number || null,
      notes: invoiceData.notes,
      operator_name: invoiceData.operator_name ?? null,
      delivery_method: invoiceData.delivery_method ?? 'delivery',
      delivery_address_line_1: invoiceData.delivery_address_line_1,
      delivery_address_line_2: invoiceData.delivery_address_line_2,
      delivery_town: invoiceData.delivery_town,
      delivery_county: invoiceData.delivery_county,
      delivery_postcode: invoiceData.delivery_postcode,
      subtotal: Number(invoiceData.subtotal),
      vat_total: Number(invoiceData.vat_total),
      total: Number(invoiceData.total),
      amount_paid: Number(invoiceData.amount_paid),
      balance_due: Number(invoiceData.balance_due),
    },
    client: {
      first_name: emailClient?.first_name ?? null,
      last_name: emailClient?.last_name ?? null,
      company_name: emailClient?.company_name ?? null,
    },
    items: (sortedEmailItems || []).map((it) => ({
      product_name: it.product_name,
      product_code: it.product_code,
      unit: it.unit,
      quantity: Number(it.quantity),
      price: Number(it.price),
      line_total: Number(it.line_total),
    })),
    company: {
      company_name: companyForRendering.company_name || 'Demo Builder Merchant',
      address_line_1: companyForRendering.address_line_1,
      address_line_2: companyForRendering.address_line_2,
      town: companyForRendering.town,
      county: companyForRendering.county,
      postcode: companyForRendering.postcode,
      phone: companyForRendering.phone,
      email: companyForRendering.email,
      phones: companyForRendering.phones,
      emails: companyForRendering.emails,
      vat_number: companyForRendering.vat_number,
      company_registration_number: companyForRendering.company_registration_number,
    },
    viewUrl,
    logoUrl,
  }

  const subject = renderInvoiceEmailSubject(templateData)
  const html = renderInvoiceEmailHtml(templateData)
  const text = renderInvoiceEmailText(templateData)

  const resend = new Resend(apiKey)
  const fromResult = buildEmailFromHeader(envFrom, fromName)
  if (!fromResult.ok) {
    return serverError(fromResult.error)
  }
  const fromHeader = fromResult.fromHeader

  try {
    const { data: result, error: sendError } = await resend.emails.send({
      from: fromHeader,
      to: recipient,
      replyTo: replyTo,
      subject,
      html,
      text,
      attachments: [
        {
          filename: pdfFilename,
          content: pdfBuffer,
        },
      ],
    })

    if (sendError) {
      console.error('Resend send error:', sendError)
      return serverError(`Resend failed: ${sendError.message || 'unknown error'}`)
    }

    return NextResponse.json({ ok: true, id: result?.id ?? null, to: recipient })
  } catch (err) {
    console.error('Email send exception:', err)
    return serverError(err instanceof Error ? err.message : 'Unknown email send error')
  }
}
