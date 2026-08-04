// app/(public)/invoice/[token]/page.tsx
// Public, unauthenticated invoice view. The token in the URL IS the
// authorization. It can be either:
//   - the opaque public_share_key (preferred, hides the UUID pattern), or
//   - the legacy UUID share_token (kept for back-compat with old links).
//
// Isolation guarantees for this route:
//
//  1. The lookup uses a unique index on public_share_key (or share_token),
//     so a given token resolves to at most one row.
//  2. The query filters by token, the mode-specific share flag
//     (invoice → public_share_enabled, delivery-note → delivery_note_share_enabled),
//     status allow-list (sent/paid/partial), and expiry, so draft/converted
//     documents can never leak even if a sharing flag is on.
//  3. Only the row matching the token is returned (maybeSingle()). The joins
//     are scoped to that single invoice.
//  4. The token format is validated before the DB is hit.
//  5. Password-protected links render a password gate; the invoice data is
//     only fetched after the password is verified server-side.
//  6. Every successful public view is logged to public_share_views.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { unstable_noStore } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { withQueryRetry } from '@/lib/supabase/with-query-retry'
import { loadCompany } from '@/lib/company'
import { PublicInvoiceView } from '@/components/public/PublicInvoiceView'
import { PublicInvoicePasswordGate } from '@/components/public/PublicInvoicePasswordGate'
import { type InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'
import { rateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/ip'
import {
  findPublicInvoiceByToken,
  getShareAccessForMode,
  type ShareDocumentMode,
} from '@/lib/share/public-invoice-lookup'
import { isLegacyShareToken, isShareKey } from '@/lib/share/share-key'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PublicInvoicePageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ debug?: string; mode?: string }>
}

type PublicInvoiceRow = InvoicePdfProps['invoice'] & {
  id: string
  share_token: string
  public_share_key: string | null
  public_share_enabled?: boolean
  public_share_requires_password: boolean
  public_share_password_hash: string | null
  delivery_note_share_enabled?: boolean
  delivery_note_share_requires_password?: boolean
  delivery_note_share_password_hash?: string | null
}

function isValidToken(value: string): boolean {
  return isShareKey(value) || isLegacyShareToken(value)
}

export async function generateMetadata({ params, searchParams }: PublicInvoicePageProps): Promise<Metadata> {
  const { token } = await params
  const { debug, mode } = await searchParams
  const shareMode: ShareDocumentMode = mode === 'delivery-note' ? 'delivery-note' : 'invoice'

  if (!isValidToken(token) || debug === '1') {
    return {
      title: 'Invoice not found',
      robots: { index: false, follow: false },
    }
  }

  try {
    const admin = createAdminClient()
    const now = new Date().toISOString()
    let query = admin
      .from('invoices')
      .select(
        'type, document_number, public_share_requires_password, delivery_note_share_requires_password'
      )
      .eq(
        shareMode === 'delivery-note' ? 'delivery_note_share_enabled' : 'public_share_enabled',
        true
      )
      .is('deleted_at', null)
      .or(`share_token_expires_at.is.null,share_token_expires_at.gte.${now}`)

    if (isLegacyShareToken(token)) {
      query = query.eq('share_token', token)
    } else {
      query = query.eq('public_share_key', token)
    }

    const { data: invoice } = await query.maybeSingle()

    if (!invoice) {
      return {
        title: 'Document not found',
        robots: { index: false, follow: false },
      }
    }

    const title = 'Document | Star Hawk Builders Merchant'
    const description = 'View your shared document from Star Hawk Builders Merchant'

    return {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    }
  } catch (err) {
    console.error('Public invoice metadata generation failed:', err)
    return {
      title: 'Document | Star Hawk Builders Merchant',
      robots: { index: false, follow: false },
    }
  }
}

export default async function PublicInvoicePage({ params, searchParams }: PublicInvoicePageProps) {
  const { token } = await params
  const { debug, mode } = await searchParams
  const isDeliveryNote = mode === 'delivery-note'
  const shareMode: ShareDocumentMode = isDeliveryNote ? 'delivery-note' : 'invoice'

  if (!isValidToken(token)) {
    notFound()
  }

  // Prevent any edge/cache layer from serving a stale 404 while we debug.
  unstable_noStore()

  const hdrs = await headers()
  // TRUST_PROXY-aware IP helper — do not read raw x-forwarded-for here.
  const ip = getClientIp(hdrs)

  let rl: { allowed: boolean; remaining?: number; reset?: number } = { allowed: false }
  try {
    const anonForRateLimit = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    // Fail closed: a rate-limit outage must not become unlimited public
    // document scraping.
    rl = await rateLimit(anonForRateLimit, `publicview:${ip}`, 60, 60_000, { failOpen: false })
  } catch (err) {
    console.error('Public invoice rate-limit setup failed:', err)
    rl = { allowed: false }
  }

  if (!rl.allowed && debug !== '1') {
    notFound()
  }

  let adminClientError: string | null = null
  let invoiceResult: { data: PublicInvoiceRow | null; error: unknown } = { data: null, error: null }
  let companySettingsResult: { data: InvoicePdfProps['company'] | null; error: unknown } = { data: null, error: null }
  let companyChannelsResult: Awaited<ReturnType<typeof loadCompany>> | null = null
  let bankResult: { data: InvoicePdfProps['bankDetails'] | null; error: unknown } = { data: null, error: null }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    console.error('Public invoice page: SUPABASE_SERVICE_ROLE_KEY is not set')
  }

  try {
    const admin = createAdminClient()
    ;[invoiceResult, companySettingsResult, companyChannelsResult, bankResult] = await Promise.all([
      findPublicInvoiceByToken(admin, token, shareMode) as Promise<{
        data: PublicInvoiceRow | null
        error: unknown
      }>,
      withQueryRetry('company_settings (public invoice page)', () =>
        admin
          .from('company_settings')
          .select('company_name, address_line_1, address_line_2, town, county, postcode, phone, email, vat_number, company_registration_number')
          .maybeSingle()
      ),
      loadCompany(),
      withQueryRetry('company_bank_details (public invoice page)', () =>
        admin.from('company_bank_details').select('*').maybeSingle()
      ),
    ])
  } catch (err) {
    adminClientError = err instanceof Error ? err.message : String(err)
    console.error('Public invoice admin client creation failed:', err)
  }

  // Debug view: admin-only diagnostics.
  if (debug === '1') {
    const { createClient: createServerAuthClient } = await import('@/lib/supabase/server')
    const authClient = await createServerAuthClient()
    const {
      data: { user: operator },
    } = await authClient.auth.getUser()
    const { data: operatorProfile } = operator
      ? await authClient.from('profiles').select('role').eq('id', operator.id).maybeSingle()
      : { data: null }

    if (!operator || operatorProfile?.role !== 'admin') {
      notFound()
    }

    const invoice = invoiceResult.data
    const isExpired = invoice?.share_token_expires_at
      ? new Date(invoice.share_token_expires_at) < new Date()
      : false

    const diagnostics = {
      token,
      ip,
      rateLimit: rl,
      env: {
        urlConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        anonKeyConfigured: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleConfigured: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
      },
      adminClientError,
      invoice: {
        found: !!invoice,
        error: invoiceResult.error
          ? {
              message: (invoiceResult.error as { message?: string }).message,
              code: (invoiceResult.error as { code?: string }).code,
            }
          : null,
        share_token: invoice?.share_token ?? null,
        public_share_key: invoice?.public_share_key ?? null,
        mode: shareMode,
        public_share_enabled: invoice?.public_share_enabled ?? null,
        public_share_requires_password: invoice?.public_share_requires_password ?? null,
        delivery_note_share_enabled: invoice?.delivery_note_share_enabled ?? null,
        delivery_note_share_requires_password:
          invoice?.delivery_note_share_requires_password ?? null,
        share_token_expires_at: invoice?.share_token_expires_at ?? null,
        isExpired,
      },
      companyFound: !!companySettingsResult.data,
      bankFound: !!bankResult.data,
    }

    return (
      <div className="min-h-screen bg-white p-8 font-mono text-sm">
        <h1 className="text-lg font-bold mb-4">Public invoice debug</h1>
        <pre className="whitespace-pre-wrap break-all bg-gray-100 p-4 rounded">
          {JSON.stringify(diagnostics, null, 2)}
        </pre>
      </div>
    )
  }

  if (adminClientError) {
    notFound()
  }
  if (invoiceResult.error) {
    console.error('Public invoice fetch failed:', invoiceResult.error)
    notFound()
  }
  if (!invoiceResult.data) {
    notFound()
  }

  const invoice = invoiceResult.data
  const access = getShareAccessForMode(
    {
      public_share_enabled: invoice.public_share_enabled === true,
      public_share_requires_password: invoice.public_share_requires_password === true,
      public_share_password_hash: invoice.public_share_password_hash ?? null,
      delivery_note_share_enabled: invoice.delivery_note_share_enabled === true,
      delivery_note_share_requires_password:
        invoice.delivery_note_share_requires_password === true,
      delivery_note_share_password_hash: invoice.delivery_note_share_password_hash ?? null,
    },
    shareMode
  )

  // Password-protected links render a gate; the invoice data is fetched only
  // after the password is verified. Access control is mode-specific.
  if (access.requiresPassword) {
    return (
      <PublicInvoicePasswordGate
        token={token}
        mode={shareMode}
      />
    )
  }

  const company = {
    ...(companySettingsResult.data ?? {}),
    phone: companyChannelsResult?.phone ?? companySettingsResult.data?.phone ?? null,
    email: companyChannelsResult?.email ?? companySettingsResult.data?.email ?? null,
    phones: companyChannelsResult?.phones ?? [],
    emails: companyChannelsResult?.emails ?? [],
  }
  const bankDetails = bankResult.data ?? {}
  const logoSrc = '/Logo.webp'

  // Best-effort view log.
  try {
    const admin = createAdminClient()
    const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null
    await admin.from('public_share_views').insert({
      invoice_id: invoice.id,
      share_token: invoice.share_token,
      ip_address: ip === 'unknown' ? null : ip,
      user_agent: userAgent,
    })
  } catch (err) {
    console.warn('Failed to log public share view (non-fatal):', err instanceof Error ? err.message : err)
  }

  // Drop internal fields before rendering.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {
    id,
    public_share_key,
    public_share_enabled,
    public_share_requires_password,
    public_share_password_hash,
    delivery_note_share_enabled,
    delivery_note_share_requires_password,
    delivery_note_share_password_hash,
    ...publicInvoice
  } = invoice

  return (
    <PublicInvoiceView
      invoice={publicInvoice}
      company={company}
      bankDetails={bankDetails}
      logoSrc={logoSrc}
      mode={isDeliveryNote ? 'delivery-note' : undefined}
      downloadToken={token}
    />
  )
}
