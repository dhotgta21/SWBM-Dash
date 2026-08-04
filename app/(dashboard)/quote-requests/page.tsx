// app/(dashboard)/quote-requests/page.tsx
// Admin view of every quote request submitted from the public site.
// Admins see every row; the page is server-rendered and revalidated
// after any create / update so the data stays fresh.
//
// Two top-level tabs:
//   * view   — 'overview' | 'requests'
//              'overview' shows the dashboard (KPIs + chart + status pie)
//              'requests' shows the actionable inbox (filter chips + list)
//   * kind   — 'all' | 'order' | 'quote' (separate orders and quotes inboxes)
//   * status — 'all' | 'pending' | 'reviewed' | 'invoiced' | 'rejected' | 'cancelled'
//
// Orders are requests where every line had a listed price at submit
// time. Quotes are requests that need pricing/discussion before the
// operator can convert them to an invoice.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Inbox, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { QuoteStatusPill } from '@/components/quote-requests/QuoteStatusPill'
import { KindPill } from '@/components/quote-requests/KindPill'
import { QuoteRequestTabs } from '@/components/quote-requests/QuoteRequestTabs'
import {
  QuoteRequestViewTabs,
  type QuoteRequestView,
} from '@/components/quote-requests/QuoteRequestViewTabs'
import { QuoteRequestDashboard } from '@/components/quote-requests/dashboard/QuoteRequestDashboard'
import { getQuoteRequestDashboardMetrics } from '@/lib/quote-request-dashboard'

export const dynamic = 'force-dynamic'

const STATUS_FILTERS = ['all', 'pending', 'reviewed', 'invoiced', 'rejected', 'cancelled'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const KIND_FILTERS = ['all', 'order', 'quote'] as const
type KindFilter = (typeof KIND_FILTERS)[number]

const VIEW_FILTERS = ['overview', 'requests'] as const

/**
 * Metadata is dynamic because the page title reflects the active
 * view + kind filter.
 */
export async function generateMetadata({ searchParams }: PageProps) {
  const params = await searchParams
  const view = normaliseView(
    Array.isArray(params.view) ? params.view[0] : params.view
  )
  const kind = normaliseKind(
    Array.isArray(params.kind) ? params.kind[0] : params.kind
  )
  if (view === 'overview') {
    return { title: 'Quote requests — Overview' }
  }
  return {
    title:
      kind === 'order'
        ? 'Order requests'
        : kind === 'quote'
          ? 'Quote requests'
          : 'Quote & order requests',
  }
}

interface PageProps {
  searchParams: Promise<{
    view?: string | string[]
    status?: string | string[]
    kind?: string | string[]
  }>
}

function normaliseStatus(value: string | undefined): StatusFilter {
  if (!value) return 'all'
  return (STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as StatusFilter)
    : 'all'
}

function normaliseKind(value: string | undefined): KindFilter {
  if (!value) return 'all'
  return (KIND_FILTERS as readonly string[]).includes(value)
    ? (value as KindFilter)
    : 'all'
}

function normaliseView(value: string | undefined): QuoteRequestView {
  if (!value) return 'overview'
  return (VIEW_FILTERS as readonly string[]).includes(value)
    ? (value as QuoteRequestView)
    : 'overview'
}

function buildHref(opts: {
  view?: QuoteRequestView
  kind?: KindFilter
  status?: StatusFilter
}): string {
  const params = new URLSearchParams()
  const view = opts.view ?? 'overview'
  const kind = opts.kind ?? 'all'
  const status = opts.status ?? 'all'
  if (view !== 'overview') params.set('view', view)
  if (kind !== 'all') params.set('kind', kind)
  if (status !== 'all') params.set('status', status)
  const qs = params.toString()
  return qs ? `/quote-requests?${qs}` : '/quote-requests'
}

function pageTitle(view: QuoteRequestView, kind: KindFilter): string {
  if (view === 'overview') return 'Quote requests'
  if (kind === 'order') return 'Order requests'
  if (kind === 'quote') return 'Quote requests'
  return 'Quote & order requests'
}

function pageDescription(view: QuoteRequestView, kind: KindFilter, count: number): string {
  if (view === 'overview') {
    return 'Volume, conversion and pipeline value across orders and quote requests. Switch to Requests to take action on individual rows.'
  }
  if (kind === 'order') {
    return `${count} order request${count === 1 ? '' : 's'} in this view. Open one to confirm with the customer, take payment, and convert to an invoice.`
  }
  if (kind === 'quote') {
    return `${count} quote request${count === 1 ? '' : 's'} in this view. Open one to set prices, agree the order on the phone, and email a written quote.`
  }
  return count
    ? `${count} request${count === 1 ? '' : 's'} in this view. Open one to review, edit prices and convert to an invoice.`
    : 'Submitted from the public shop. New requests appear here automatically.'
}

function pageEyebrow(view: QuoteRequestView, kind: KindFilter): {
  label: string
  tone: 'primary' | 'info' | 'success' | 'warning' | 'destructive'
} {
  if (view === 'overview') return { label: 'Overview', tone: 'primary' }
  if (kind === 'order') return { label: 'Orders', tone: 'info' }
  if (kind === 'quote') return { label: 'Quotes', tone: 'warning' }
  return { label: 'Inbox', tone: 'primary' }
}

export default async function QuoteRequestsPage({ searchParams }: PageProps) {
  // Auth: admins and staff with see_quote_requests permission.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.isAdmin && !ctx.permissions.see_quote_requests) redirect('/invoices?view=due')

  const params = await searchParams
  const view = normaliseView(
    Array.isArray(params.view) ? params.view[0] : params.view
  )
  const status = normaliseStatus(
    Array.isArray(params.status) ? params.status[0] : params.status
  )
  const kind = normaliseKind(
    Array.isArray(params.kind) ? params.kind[0] : params.kind
  )

  // Quote requests are admin-only via RLS, but staff with the explicit
  // permission must still be able to read them. Use the service-role
  // client after the permission gate above.
  const supabase = createAdminClient()

  // Always fetch the pending counts — they drive the header badges in
  // both views (the operator always wants to know what's waiting).
  const [pendingOrders, pendingQuotes] = await Promise.all([
    supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('kind', 'order'),
    supabase
      .from('quote_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('kind', 'quote'),
  ])
  const pendingOrdersCount = pendingOrders.count ?? 0
  const pendingQuotesCount = pendingQuotes.count ?? 0
  const pendingTotal = pendingOrdersCount + pendingQuotesCount

  // Overview tab — pull dashboard metrics. Wrapped so a metrics failure
  // doesn't blow up the whole page (the inbox is still usable).
  let dashboardMetrics: Awaited<
    ReturnType<typeof getQuoteRequestDashboardMetrics>
  > | null = null
  let dashboardError: string | null = null
  if (view === 'overview') {
    try {
      dashboardMetrics = await getQuoteRequestDashboardMetrics()
    } catch (err) {
      dashboardError =
        err instanceof Error ? err.message : 'Could not load overview metrics.'
    }
  }

  // Requests tab — pull the filtered list.
  type RequestRow = {
    id: string
    request_number: string
    client_name: string
    client_email: string
    client_company: string | null
    status: string
    kind: string
    created_at: string
    item_count: Array<{ count: number }> | null
  }
  let rows: RequestRow[] | null = null
  let listError: string | null = null
  if (view === 'requests') {
    let query = supabase
      .from('quote_requests')
      .select(
        'id, request_number, client_name, client_email, client_company, status, kind, created_at, item_count:quote_request_items(count)'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (status !== 'all') {
      query = query.eq('status', status)
    }
    if (kind !== 'all') {
      query = query.eq('kind', kind)
    }

    const { data, error } = await query
    if (error) {
      listError = error.message
    } else {
      rows = (data ?? []) as RequestRow[]
    }
  }

  // Filter-row links preserve the OTHER active filters so users don't
  // lose context when switching.
  function viewHref(v: QuoteRequestView): string {
    if (v === 'overview') return '/quote-requests'
    return buildHref({ view: 'requests', kind, status })
  }
  function kindHref(k: KindFilter): string {
    return buildHref({ view: 'requests', kind: k, status })
  }
  function statusHref(s: StatusFilter): string {
    return buildHref({ view: 'requests', kind, status: s })
  }

  const eyebrow = pageEyebrow(view, kind)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label={eyebrow.label} tone={eyebrow.tone} />}
        title={pageTitle(view, kind)}
        description={
          view === 'overview'
            ? pageDescription(view, kind, 0)
            : pageDescription(view, kind, rows?.length ?? 0)
        }
        actions={
          pendingTotal > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {pendingOrdersCount > 0 && (
                <Badge variant="info">{pendingOrdersCount} order{pendingOrdersCount === 1 ? '' : 's'} pending</Badge>
              )}
              {pendingQuotesCount > 0 && (
                <Badge variant="warning">{pendingQuotesCount} quote{pendingQuotesCount === 1 ? '' : 's'} pending</Badge>
              )}
            </div>
          ) : null
        }
      />

      {/* Top-level navigation between the overview dashboard and the
          actionable inbox. Switching tabs preserves kind/status filters
          where it makes sense (overview resets to default). */}
      <QuoteRequestViewTabs view={view} viewHref={viewHref} />

      {view === 'overview' ? (
        <>
          {dashboardError ? (
            <Alert variant="destructive">
              <AlertDescription>
                We couldn&rsquo;t load the overview metrics. {dashboardError}
              </AlertDescription>
            </Alert>
          ) : dashboardMetrics ? (
            <QuoteRequestDashboard metrics={dashboardMetrics} />
          ) : null}
        </>
      ) : (
        <>
          {/* Nested filters inside the inbox: All / Orders / Quotes is the
              primary tab, status is the sub-tab beneath it. */}
          <QuoteRequestTabs
            kind={kind}
            status={status}
            kindHref={kindHref}
            statusHref={statusHref}
          />

          {listError ? (
            <Alert variant="destructive">
              <AlertDescription>
                We couldn&rsquo;t load the quote requests. {listError}
              </AlertDescription>
            </Alert>
          ) : !rows || rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Inbox className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {kind === 'order'
                      ? 'No order requests here yet.'
                      : kind === 'quote'
                        ? 'No quote requests here yet.'
                        : 'No quote or order requests here yet.'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Visitors can submit {kind === 'order' ? 'orders' : kind === 'quote' ? 'quotes' : 'requests'} from the public shop. They&rsquo;ll show up here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="sr-only">
                  <CardTitle>{pageTitle(view, kind)}</CardTitle>
                  <CardDescription>Open a request to review and convert.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                  {rows.map((r) => {
                    const lineCount = r.item_count?.[0]?.count ?? 0
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/quote-requests/${r.id}`}
                          className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/40"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-muted-foreground">
                                {r.request_number}
                              </span>
                              <KindPill kind={r.kind} />
                              <QuoteStatusPill status={r.status} />
                              <span className="text-xs text-muted-foreground">
                                {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-sm font-semibold text-foreground">
                              {r.client_name}
                              {r.client_company && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  {r.client_company}
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{r.client_email}</p>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <p className="text-xs text-muted-foreground">Received</p>
                              <p className="text-xs font-semibold text-foreground">
                                {new Date(r.created_at).toLocaleString(undefined, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
              </Card>
              {rows.length === 200 && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Showing the most recent 200 requests. Use the filters above to narrow the list.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
