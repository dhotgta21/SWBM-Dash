// app/(dashboard)/quote-requests/[id]/page.tsx
// Admin detail view for a single quote request. Three affordances:
//
//   1. Edit line items — adjust quantity and unit price per row.
//      Submits via updateQuoteRequestItems (server action).
//   2. Change status — mark reviewed / rejected / cancelled. The
//      status pill at the top reflects the current value.
//   3. Convert — "Create quotation invoice". Creates a real invoice
//      in the existing invoices table using the edited prices, links
//      it back to the request, and redirects to the new invoice.
//
// The page is server-rendered; the form interactions are handled by
// small client components below.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, Phone, MapPin, Building2, MessageSquare } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { QuoteStatusPill } from '@/components/quote-requests/QuoteStatusPill'
import { QuoteItemsEditor } from '@/components/quote-requests/QuoteItemsEditor'
import { QuoteActions } from '@/components/quote-requests/QuoteActions'
import { KindPill } from '@/components/quote-requests/KindPill'

export const dynamic = 'force-dynamic'

/**
 * Metadata is dynamic — the page title reflects the kind of request
 * ("Order request" vs "Quote request") so the browser tab, breadcrumb
 * and audit trail all agree.
 */
export async function generateMetadata(): Promise<{ title: string }> {
  // Note: we can't read the kind here without an extra query; keep the
  // generic title and let the page header carry the kind label.
  return { title: 'Request' }
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function QuoteRequestDetailPage({ params }: PageProps) {
  const { id } = await params

  // Auth gate: admins and staff with see_quote_requests permission.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.see_quote_requests) redirect('/invoices?view=due')

  const supabase = createAdminClient()
  const { data: row, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !row) notFound()

  const r = row as {
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
    kind: string
    ip_address: string
    user_agent: string | null
    created_invoice_id: string | null
    created_at: string
    updated_at: string
    processed_at: string | null
  }

  const requestKind: 'quote' | 'order' = r.kind === 'order' ? 'order' : 'quote'
  const requestKindLabel = requestKind === 'order' ? 'Order request' : 'Quote request'
  const backLinkLabel =
    requestKind === 'order' ? 'All order requests' : 'All quote requests'
  const backHref =
    requestKind === 'order'
      ? '/quote-requests?kind=order&view=requests'
      : '/quote-requests?kind=quote&view=requests'

  const { data: items, error: itemsErr } = await supabase
    .from('quote_request_items')
    .select('id, product_id, product_code, product_name, unit, quantity, suggested_price')
    .eq('quote_request_id', id)
    .order('created_at', { ascending: true })

  if (itemsErr) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load line items. {itemsErr.message}</AlertDescription>
      </Alert>
    )
  }

  const itemRows = (items ?? []) as Array<{
    id: string
    product_id: string | null
    product_code: string
    product_name: string
    unit: string
    quantity: number
    suggested_price: number | null
  }>

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLinkLabel}
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-semibold text-muted-foreground">
              {r.request_number}
            </span>
            <KindPill kind={requestKind} />
            <QuoteStatusPill status={r.status} />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {requestKindLabel}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {r.client_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted{' '}
            {new Date(r.created_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}{' '}
            from {r.ip_address}
          </p>
        </div>
        <QuoteActions
          requestId={r.id}
          status={r.status}
          createdInvoiceId={r.created_invoice_id}
          canReview={ctx.isAdmin || ctx.permissions.quote_requests_review}
          canConvert={ctx.isAdmin || ctx.permissions.quote_requests_convert}
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Line items</CardTitle>
              <CardDescription>
                Edit quantities and unit prices before converting. The
                final values land on the new invoice unchanged.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QuoteItemsEditor
                requestId={r.id}
                items={itemRows}
                disabled={['rejected', 'cancelled', 'invoiced'].includes(r.status)}
                canEdit={ctx.isAdmin || ctx.permissions.quote_requests_review}
              />
            </CardContent>
          </Card>

          {r.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  Customer notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {r.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Contact
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </p>
                <p className="font-semibold text-foreground">{r.client_name}</p>
                {r.client_company && (
                  <p className="text-muted-foreground">{r.client_company}</p>
                )}
              </div>
              <a
                href={`mailto:${r.client_email}`}
                className="flex items-center gap-2 text-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{r.client_email}</span>
              </a>
              {r.client_phone && (
                <a
                  href={`tel:${r.client_phone.replace(/\s+/g, '')}`}
                  className="flex items-center gap-2 text-foreground hover:text-primary"
                >
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{r.client_phone}</span>
                </a>
              )}
            </CardContent>
          </Card>

          {(r.delivery_address_line_1 ||
            r.delivery_town ||
            r.delivery_postcode) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4 text-primary" />
                  Delivery
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-foreground">
                {r.delivery_address_line_1 && <p>{r.delivery_address_line_1}</p>}
                {r.delivery_address_line_2 && <p>{r.delivery_address_line_2}</p>}
                {(r.delivery_town || r.delivery_county) && (
                  <p>
                    {[r.delivery_town, r.delivery_county].filter(Boolean).join(', ')}
                  </p>
                )}
                {r.delivery_postcode && <p>{r.delivery_postcode}</p>}
              </CardContent>
            </Card>
          )}

          {r.created_invoice_id && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Linked invoice</CardTitle>
              </CardHeader>
              <CardContent>
                <Link href={`/invoices/${r.created_invoice_id}`}>
                  <Button variant="outline" className="w-full">
                    Open the quotation invoice
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}
