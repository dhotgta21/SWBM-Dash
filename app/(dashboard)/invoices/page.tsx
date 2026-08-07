import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { canSeeInvoiceMoney } from '@/lib/auth/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  formatCurrency,
  formatDate,
  getPaymentStatus,
  getInvoiceDisplayStatus,
  PAYMENT_STATUS_STYLES,
  getDeliveryStatus,
  type DeliveryStatus,
  cn,
} from '@/lib/utils'
import { InvoiceDashboard } from '@/components/invoices/InvoiceDashboard'
import { DeliveryStatusSelect } from '@/components/invoices/DeliveryStatusSelect'
import { getInvoiceDashboardMetrics } from '@/lib/invoice-dashboard'
import { getInvoicesWithOpenReviews } from '@/lib/actions/picker'
import { RecentlyDeletedList } from '@/components/deleted/RecentlyDeletedList'
import { Search, FileText, LayoutList, Users, LayoutDashboard, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { buildClientSearchFilter } from '@/lib/search'
import { getDraftExpiryInfo } from '@/lib/draft-expiry'

function sanitizeSearchTerm(term: string): string {
  return term.replace(/[\\"'%_(),]/g, '').trim()
}

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value)
}

/**
 * Build a PostgREST `.or()` filter that searches the joined `clients` table
 * from an invoices query. Required because `buildClientSearchFilter` targets
 * the bare `clients` columns, but here we filter through the relation alias.
 */
function buildClientInvoiceSearchFilter(term: string): string {
  const base = buildClientSearchFilter(term)
  if (!base) return ''
  return base
    .split(',')
    .map((fieldFilter) => `clients.${fieldFilter}`)
    .join(',')
}

export const metadata = {
  title: 'Invoices',
}

interface InvoicesPageProps {
  searchParams: Promise<{ q?: string; type?: string; status?: string; view?: string; client?: string; sort?: string }>
}

interface InvoiceListClient {
  id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
}

interface InvoiceListRow {
  id: string
  document_number: string
  document_number_suffix?: string | null
  order_number?: string | null
  issue_date: string
  due_date?: string | null
  expiry_date?: string | null
  type: 'invoice' | 'quotation'
  status: string
  picking_status?: string | null
  updated_at: string
  total: number
  amount_paid: number
  balance_due: number
  client_id: string
  clients: InvoiceListClient | InvoiceListClient[] | null
}

interface ClientSummaryRow {
  clientId: string
  name: string
  count: number
  pending: number
  paid: number
  totalInvoiced: number
  totalPaid: number
  balanceDue: number
}

function clientName(client: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined) {
  return (
    client?.company_name ||
    `${client?.first_name || ''} ${client?.last_name || ''}`.trim() ||
    'Unknown'
  )
}

function buildHref(params: { q?: string; type?: string; status?: string; view?: string; client?: string; sort?: string }) {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.type) sp.set('type', params.type)
  if (params.status) sp.set('status', params.status)
  if (params.view) sp.set('view', params.view)
  if (params.client) sp.set('client', params.client)
  if (params.sort) sp.set('sort', params.sort)
  const query = sp.toString()
  return `/invoices${query ? `?${query}` : ''}`
}

// Render a £ value as "—" when the admin has revoked money visibility.
// Keeps table columns aligned and avoids an "empty cell" that staff
// could mistake for "this document has no total".
function money(value: number, show: boolean): string {
  return show ? formatCurrency(value) : '—'
}

function DesktopClientTable({
  rows,
  showMoney,
  searchParams,
}: {
  rows: ClientSummaryRow[]
  showMoney: boolean
  searchParams: { q?: string; type?: string; status?: string; sort?: string }
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead className="text-right">Documents</TableHead>
          <TableHead className="text-right">Pending</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Total Invoiced</TableHead>
          <TableHead className="text-right">Total Paid</TableHead>
          <TableHead className="text-right">Balance Due</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((summary) => (
          <TableRow key={summary.clientId || summary.name}>
            <TableCell>
              {summary.clientId ? (
                <Link
                  href={buildHref({
                    type: searchParams.type,
                    status: searchParams.status,
                    view: 'list',
                    client: summary.clientId,
                  })}
                  className="font-medium text-primary hover:text-primary-hover"
                >
                  {summary.name}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{summary.name}</span>
              )}
            </TableCell>
            <TableCell className="text-right">{summary.count}</TableCell>
            <TableCell className="text-right">{summary.pending}</TableCell>
            <TableCell className="text-right">{summary.paid}</TableCell>
            <TableCell className="text-right">{money(summary.totalInvoiced, showMoney)}</TableCell>
            <TableCell className="text-right">{money(summary.totalPaid, showMoney)}</TableCell>
            <TableCell className="text-right">{money(summary.balanceDue, showMoney)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MobileClientCard({
  row,
  showMoney,
  searchParams,
}: {
  row: ClientSummaryRow
  showMoney: boolean
  searchParams: { q?: string; type?: string; status?: string; sort?: string }
}) {
  return (
    <div className="p-4">
      {row.clientId ? (
        <Link
          href={buildHref({
            type: searchParams.type,
            status: searchParams.status,
            view: 'list',
            client: row.clientId,
          })}
          className="font-medium text-primary hover:text-primary-hover"
        >
          {row.name}
        </Link>
      ) : (
        <p className="font-medium text-foreground">{row.name}</p>
      )}
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Documents</p>
          <p className="font-medium text-foreground">{row.count}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Pending</p>
          <p className="font-medium text-foreground">{row.pending}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="font-medium text-foreground">{row.paid}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Balance due</p>
          <p className="font-medium text-foreground">{money(row.balanceDue, showMoney)}</p>
        </div>
      </div>
    </div>
  )
}

// Draft documents age out: soft warning from day 2, hard warning from day 4,
// auto-deleted (soft) on day 6 by the cleanup_stale_draft_invoices cron.
function DraftExpiryWarning({ updatedAt }: { updatedAt: string }) {
  const info = getDraftExpiryInfo(updatedAt)
  if (info.level === 'none') return null
  const hard = info.level === 'hard'
  return (
    <p
      className={cn(
        'mt-1 inline-flex items-center gap-1 text-[11px] font-medium',
        hard ? 'text-destructive' : 'text-amber-600'
      )}
      title="Draft documents are deleted automatically after 6 days. Issue this document to keep it."
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {hard
        ? `Deleting in ${info.daysLeft} day${info.daysLeft === 1 ? '' : 's'} — issue now`
        : `Auto-deletes in ${info.daysLeft} days`}
    </p>
  )
}

// The workflow cell: status pill with the forward-only dropdown, plus the
// draft ageing warning underneath when the document is still a draft.
function WorkflowCell({
  invoice,
  deliveryStatus,
  canChange,
  canConvert,
  documentType,
}: {
  invoice: InvoiceListRow
  deliveryStatus: DeliveryStatus
  canChange: boolean
  canConvert: boolean
  documentType: 'invoice' | 'quotation'
}) {
  return (
    <div className="flex flex-col items-start">
      <DeliveryStatusSelect
        invoiceId={invoice.id}
        documentNumber={invoice.document_number}
        documentType={documentType}
        current={deliveryStatus}
        canChange={canChange}
        canConvert={canConvert}
      />
      {invoice.status === 'draft' && <DraftExpiryWarning updatedAt={invoice.updated_at} />}
    </div>
  )
}

function DesktopListTable({
  rows,
  showMoney,
  canChangeStatus,
  canConvertQuote,
  documentType,
  reviewInvoiceIds,
}: {
  rows: InvoiceListRow[]
  showMoney: boolean
  canChangeStatus: boolean
  canConvertQuote: boolean
  documentType: 'invoice' | 'quotation'
  reviewInvoiceIds: Set<string>
}) {
  const isQuote = documentType === 'quotation'
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>{isQuote ? 'Expires' : 'Due'}</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Payment</TableHead>
          {!isQuote && <TableHead>Status</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((invoice) => {
          const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
          const name = clientName(client)
          const paymentStatus = getInvoiceDisplayStatus(
            invoice.status,
            invoice.amount_paid,
            invoice.total,
            invoice.due_date
          )
          const deliveryStatus = getDeliveryStatus(invoice.status, invoice.picking_status)

          return (
            <TableRow key={invoice.id}>
              <TableCell>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="font-medium text-primary hover:text-primary-hover inline-flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {invoice.document_number}
                </Link>
              </TableCell>
              <TableCell>{name}</TableCell>
              <TableCell>{formatDate(invoice.issue_date)}</TableCell>
              <TableCell>{formatDate(invoice.due_date || invoice.expiry_date)}</TableCell>
              <TableCell className="text-right">{money(invoice.total, showMoney)}</TableCell>
              <TableCell className="text-right">{money(invoice.balance_due, showMoney)}</TableCell>
              <TableCell>
                {isQuote ? (
                  // Quotations have no payment status — the workflow pill
                  // (Draft → Created → Convert to invoice) lives here.
                  <WorkflowCell
                    invoice={invoice}
                    deliveryStatus={deliveryStatus}
                    canChange={canChangeStatus}
                    canConvert={canConvertQuote}
                    documentType="quotation"
                  />
                ) : (
                  <>
                    <span
                      className={cn(
                        'inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize',
                        PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
                      )}
                    >
                      {paymentStatus}
                    </span>
                    {reviewInvoiceIds.has(invoice.id) && (
                      <span
                        className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-warning-muted px-2 py-1 text-xs font-semibold text-warning"
                        title="Items short-shipped — review required before payment"
                      >
                        Review
                      </span>
                    )}
                  </>
                )}
              </TableCell>
              {!isQuote && (
                <TableCell>
                  <WorkflowCell
                    invoice={invoice}
                    deliveryStatus={deliveryStatus}
                    canChange={canChangeStatus}
                    canConvert={false}
                    documentType="invoice"
                  />
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function MobileListCard({
  row,
  showMoney,
  canChangeStatus,
  canConvertQuote,
  documentType,
  reviewInvoiceIds,
}: {
  row: InvoiceListRow
  showMoney: boolean
  canChangeStatus: boolean
  canConvertQuote: boolean
  documentType: 'invoice' | 'quotation'
  reviewInvoiceIds: Set<string>
}) {
  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
  const name = clientName(client)
  const paymentStatus = getInvoiceDisplayStatus(row.status, row.amount_paid, row.total, row.due_date)
  const deliveryStatus = getDeliveryStatus(row.status, row.picking_status)
  const isQuote = documentType === 'quotation'

  return (
    <Link
      href={`/invoices/${row.id}`}
      className="block p-4 transition-colors hover:bg-secondary/40"
    >
      {/* Top row — document number on the left, status chip on the
          top right. Same layout as the "Invoices to collect" card
          so the operator reads both surfaces the same way. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-primary inline-flex items-center gap-1.5">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{row.document_number}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {reviewInvoiceIds.has(row.id) && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-warning-muted px-2 py-1 text-xs font-semibold text-warning"
              title="Items short-shipped — review required before payment"
            >
              Review
            </span>
          )}
          {!isQuote && (
            <span
              className={cn(
                'inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize',
                PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
              )}
            >
              {paymentStatus}
            </span>
          )}
        </div>
      </div>
      {/* Bottom row — meta + balance. Balance moves here so the
          top-right slot stays free for the status chip. */}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <p>{formatDate(row.issue_date)}</p>
          <DeliveryStatusSelect
            invoiceId={row.id}
            documentNumber={row.document_number}
            documentType={documentType}
            current={deliveryStatus}
            canChange={canChangeStatus}
            canConvert={isQuote && canConvertQuote}
            preventRowNavigation
          />
          {row.status === 'draft' && <DraftExpiryWarning updatedAt={row.updated_at} />}
        </div>
        <p className="font-semibold text-foreground text-sm tabular-nums">
          {money(row.balance_due, showMoney)}
        </p>
      </div>
    </Link>
  )
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const searchParamsResolved = await searchParams
  const supabase = await createClient()
  const query = searchParamsResolved.q ?? ''
  const type = searchParamsResolved.type ?? ''
  // The List view is split into Invoices / Quotations sub-tabs — invoices
  // are the default. Other views keep the legacy "all types" behaviour.
  const listType: 'invoice' | 'quotation' = type === 'quotation' ? 'quotation' : 'invoice'
  const status = searchParamsResolved.status ?? ''
  const clientIdFilter = searchParamsResolved.client ?? ''
  const view: 'due' | 'client' | 'list' | 'deleted' = ['due', 'client', 'list', 'deleted'].includes(searchParamsResolved.view ?? '')
    ? (searchParamsResolved.view as 'due' | 'client' | 'list' | 'deleted')
    : 'due'

  // Permission gate: respect the admin's "see_invoices" toggle. Belt-and-
  // braces alongside the sidebar / mobile nav (which already hide the
  // item), but the redirect covers anyone who reaches /invoices directly
  // via URL. Admins always pass.
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_invoices) redirect(ADMIN_LOGIN_PATH)
  // The "Recently deleted" tab is admin-only — restoring crosses all three
  // core tables and requires login-password re-auth. Bounce non-admins back
  // to the default tab.
  if (view === 'deleted' && !ctx.isAdmin) {
    redirect('/invoices?view=due')
  }
  // Money surfaces on this page are gated separately by invoices_see_money.
  // When the admin disables it, we still render the page but blank out
  // every £ value — the staff can still see document numbers, status,
  // dates and client names.
  const showMoney = canSeeInvoiceMoney(ctx.permissions)
  // Forward-only delivery status changes (Draft → Created → Delivered) are
  // gated by the same permission as document status changes. Converting a
  // quotation to an invoice has its own permission.
  const canChangeDeliveryStatus = ctx.isAdmin || ctx.permissions.invoices_change_status
  const canConvertQuote = ctx.isAdmin || ctx.permissions.invoices_convert_quote

  // Page-level dashboard metrics. These power the "Invoice status"
  // breakdown + "Collection time" row that now lives above the tabs
  // (visible on every tab as the at-a-glance summary), and the
  // outstanding-invoices table inside the Due Dashboard tab. Loading
  // once at the page level means we don't re-fetch the data inside
  // the tab component.
  const dashboardMetrics = await getInvoiceDashboardMetrics()

  let filteredInvoices: InvoiceListRow[] | undefined = undefined
  let clientSummary: ClientSummaryRow[] = []
  let selectedClientName = 'Unknown'

  if (view !== 'due') {
    let dbQuery = supabase
      .from('invoices')
      .select('*, clients(id, first_name, last_name, company_name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (query.trim()) {
      if (view === 'client') {
        const clientFilter = buildClientInvoiceSearchFilter(query.trim())
        if (clientFilter) {
          dbQuery = dbQuery.or(clientFilter)
        }
      } else {
        const q = sanitizeSearchTerm(query.trim())
        if (q) {
          if (isNumeric(q)) {
            dbQuery = dbQuery.or(`document_number_suffix.eq.${q},order_number.ilike.%${q}%`)
          } else {
            dbQuery = dbQuery.or(`document_number.ilike.%${q}%,order_number.ilike.%${q}%`)
          }
        }
      }
    }

    if (view === 'list') {
      dbQuery = dbQuery.eq('type', listType)
    } else if (type) {
      dbQuery = dbQuery.eq('type', type)
    }

    if (status === 'overdue') {
      dbQuery = dbQuery
        .eq('status', 'sent')
        .not('due_date', 'is', null)
        .lt('due_date', new Date().toISOString())
    } else if (status === 'due') {
      // "Due" is a display status, not a stored one: sent invoices with an
      // unpaid balance that haven't passed their due date yet. Narrow on the
      // server to sent, then classify client-side (same pattern as overdue).
      dbQuery = dbQuery.eq('status', 'sent')
    } else if (status) {
      dbQuery = dbQuery.eq('status', status)
    }

    if (clientIdFilter) {
      dbQuery = dbQuery.eq('client_id', clientIdFilter)
    }

    const { data: invoices } = await dbQuery

    filteredInvoices =
      status === 'overdue'
        ? (invoices?.filter(
            (invoice) =>
              getPaymentStatus(invoice.amount_paid, invoice.total, invoice.due_date) === 'overdue'
          ) ?? [])
        : status === 'due'
          ? (invoices?.filter(
              (invoice) =>
                getPaymentStatus(invoice.amount_paid, invoice.total, invoice.due_date) === 'due'
            ) ?? [])
          : (invoices ?? [])

    const byClient = new Map<string, ClientSummaryRow>()

    filteredInvoices?.forEach((invoice) => {
      // Metrics count real invoices only. Drafts, cancelled invoices and
      // quotations are documents, but they are not sales/collections.
      if (invoice.type !== 'invoice' || invoice.status === 'draft' || invoice.status === 'cancelled') {
        return
      }

      const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
      const name = clientName(client)
      const key = client?.id ?? `unknown-${name}`
      const existing = byClient.get(key)

      const isPaid = invoice.status === 'paid' || (invoice.amount_paid >= invoice.total && invoice.total > 0)

      if (existing) {
        existing.count += 1
        if (isPaid) existing.paid += 1
        else existing.pending += 1
        existing.totalInvoiced += invoice.total || 0
        existing.totalPaid += invoice.amount_paid || 0
        existing.balanceDue += invoice.balance_due || 0
      } else {
        byClient.set(key, {
          clientId: client?.id ?? '',
          name,
          count: 1,
          pending: isPaid ? 0 : 1,
          paid: isPaid ? 1 : 0,
          totalInvoiced: invoice.total || 0,
          totalPaid: invoice.amount_paid || 0,
          balanceDue: invoice.balance_due || 0,
        })
      }
    })

    clientSummary = Array.from(byClient.values()).sort((a, b) => a.name.localeCompare(b.name))

    const selectedClientRow = clientIdFilter
      ? filteredInvoices?.find((invoice) => invoice.client_id === clientIdFilter)?.clients
      : null
    const selectedClient = Array.isArray(selectedClientRow) ? selectedClientRow[0] : selectedClientRow
    selectedClientName = clientName(selectedClient)
  }

  // Invoices with unresolved picker short-shipments get a "Review" pill in
  // the list view (payment is blocked on them until resolved).
  let reviewInvoiceIds = new Set<string>()
  if (view === 'list' && filteredInvoices && filteredInvoices.length > 0) {
    const { invoiceIds } = await getInvoicesWithOpenReviews(
      filteredInvoices.map((invoice) => invoice.id)
    )
    reviewInvoiceIds = new Set(invoiceIds ?? [])
  }

  const viewTabs: { key: 'due' | 'client' | 'list' | 'deleted'; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'due', label: 'Due Dashboard', icon: LayoutDashboard },
    { key: 'client', label: 'By Client', icon: Users },
    { key: 'list', label: 'List', icon: LayoutList },
    // Admin-only — mirrors the previous /deleted page gate.
    ...(ctx.isAdmin
      ? [{ key: 'deleted' as const, label: 'Recently deleted', icon: Trash2 }]
      : []),
  ]

  const listSearchParams = {
    q: searchParamsResolved.q,
    type: searchParamsResolved.type,
    status: searchParamsResolved.status,
    sort: searchParamsResolved.sort,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label="Documents" tone="primary" />}
        title="Invoices &amp; Quotations"
        description={
          filteredInvoices
            ? `${filteredInvoices.length} document${filteredInvoices.length === 1 ? '' : 's'} matching your filters.`
            : 'Everything due today, organised by client or listed flat.'
        }
        actions={
          /* "Create" is gated by invoices_add. The server action
             createInvoice re-checks the flag — never trust the UI alone. */
          (ctx.isAdmin || ctx.permissions.invoices_add) ? (
            <Link href="/invoices/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Invoice
              </Button>
            </Link>
          ) : null
        }
      />

      <div className="inline-flex items-center gap-1 p-1.5 rounded-xl border border-border bg-card overflow-x-auto max-w-full shadow-sm">
        {viewTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = view === tab.key
          return (
            <Link
              key={tab.key}
              href={buildHref({
                // Search semantics differ between views (client name vs
                // document/order number), so clear the query when switching.
                type: searchParamsResolved.type,
                status: searchParamsResolved.status,
                view: tab.key,
                sort: searchParamsResolved.sort,
              })}
              className={cn(
                'inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </Link>
          )
        })}
      </div>

      {view === 'list' && (
        <div className="flex w-fit items-center gap-1 p-1.5 rounded-xl border border-border bg-card shadow-sm">
          {([
            { key: 'invoice', label: 'Invoices' },
            { key: 'quotation', label: 'Quotations' },
          ] as const).map((tab) => {
            const isActive = listType === tab.key
            return (
              <Link
                key={tab.key}
                href={buildHref({
                  q: query || undefined,
                  type: tab.key,
                  // Status options differ between invoices and quotations, so
                  // reset to "All Statuses" when switching the sub-tab.
                  status: tab.key === listType ? searchParamsResolved.status : undefined,
                  view: 'list',
                  client: clientIdFilter || undefined,
                  sort: searchParamsResolved.sort,
                })}
                className={cn(
                  'px-5 py-2.5 rounded-lg text-base font-semibold transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </div>
      )}

      {view === 'client' && (
        <Card>
          <CardHeader>
            <CardTitle>Search account clients</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="view" value={view} />
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Search by name, company, account number, phone or email..."
                  className="pl-9"
                />
              </div>
              <Button type="submit">Search</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {view === 'list' && (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>Filters</CardTitle>
            {/* Status quick-filters. "Due" leads — it's the daily work queue
                (unpaid, not yet overdue) — "All Statuses" closes the row.
                Each pill is a link that preserves the search query and the
                Invoices/Quotations sub-tab. */}
            <div className="flex flex-wrap gap-1.5">
              {(listType === 'invoice'
                ? [
                    { key: 'due', label: 'Due' },
                    { key: 'draft', label: 'Draft' },
                    { key: 'sent', label: 'Created' },
                    { key: 'paid', label: 'Paid' },
                    { key: 'partial', label: 'Partial' },
                    { key: 'overdue', label: 'Overdue' },
                    { key: '', label: 'All Statuses' },
                  ]
                : [
                    { key: 'draft', label: 'Draft' },
                    { key: 'sent', label: 'Created' },
                    { key: 'converted', label: 'Converted' },
                    { key: '', label: 'All Statuses' },
                  ]
              ).map((pill) => {
                const isActive = status === pill.key
                return (
                  <Link
                    key={pill.key || 'all'}
                    href={buildHref({
                      q: query || undefined,
                      type: listType,
                      status: pill.key || undefined,
                      view: 'list',
                      client: clientIdFilter || undefined,
                      sort: searchParamsResolved.sort,
                    })}
                    className={cn(
                      'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground'
                    )}
                  >
                    {pill.label}
                  </Link>
                )
              })}
            </div>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col sm:flex-row gap-2">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="type" value={listType} />
              {status && <input type="hidden" name="status" value={status} />}
              {clientIdFilter && <input type="hidden" name="client" value={clientIdFilter} />}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Search document number (e.g. 1118) or order number..."
                  className="pl-9"
                />
              </div>
              <Button type="submit">Filter</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {view === 'due' && (
        <InvoiceDashboard
          invoices={dashboardMetrics.allInvoices}
          statusBreakdown={dashboardMetrics.statusBreakdown}
          paymentDurations={dashboardMetrics.paymentDurations}
          asOfDate={dashboardMetrics.asOfDate}
          kpiMetrics={dashboardMetrics.kpiMetrics}
        />
      )}

      {clientIdFilter && view === 'list' && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Showing documents for <span className="font-medium text-foreground">{selectedClientName}</span>
          </p>
          <Link
            href={buildHref({ type: searchParamsResolved.type, status: searchParamsResolved.status, view: 'client' })}
            className="text-sm font-medium text-primary hover:text-primary-hover"
          >
            ← Back to all clients
          </Link>
        </div>
      )}

      {view === 'client' && (
        <Card>
          <CardContent className="p-0">
            {clientSummary.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No documents found. Create your first invoice or quotation.
              </div>
            ) : (
              <ResponsiveTable
                rows={clientSummary}
                keyField="clientId"
                renderDesktop={(rows) => <DesktopClientTable rows={rows} showMoney={showMoney} searchParams={listSearchParams} />}
                renderMobile={(row) => <MobileClientCard row={row} showMoney={showMoney} searchParams={listSearchParams} />}
              />
            )}
          </CardContent>
        </Card>
      )}

      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            {filteredInvoices?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No documents found. Create your first invoice or quotation.
              </div>
            ) : (
              <ResponsiveTable
                rows={filteredInvoices ?? []}
                keyField="id"
                renderDesktop={(rows) => (
                  <DesktopListTable
                    rows={rows}
                    showMoney={showMoney}
                    canChangeStatus={canChangeDeliveryStatus}
                    canConvertQuote={canConvertQuote}
                    documentType={listType}
                    reviewInvoiceIds={reviewInvoiceIds}
                  />
                )}
                renderMobile={(row) => (
                  <MobileListCard
                    row={row}
                    showMoney={showMoney}
                    canChangeStatus={canChangeDeliveryStatus}
                    canConvertQuote={canConvertQuote}
                    documentType={listType}
                    reviewInvoiceIds={reviewInvoiceIds}
                  />
                )}
              />
            )}
          </CardContent>
        </Card>
      )}

      {view === 'deleted' && ctx.isAdmin && (
        <DeletedTabContent />
      )}
    </div>
  )
}

// "Recently deleted" tab body. Owns its own data fetch because the data shape
// (deleted_at NOT NULL across all three tables) is fundamentally different
// from the active-document fetches above — no point trying to share the
// same query path.
async function DeletedTabContent() {
  const supabase = await createClient()

  const [clientsResult, productsResult, invoicesResult] = await Promise.all([
    supabase
      .from('clients')
      .select('id, first_name, last_name, company_name, email, account_number, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(100),
    supabase
      .from('products')
      .select('id, code, name, category, deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(100),
    supabase
      .from('invoices')
      .select('id, document_number, type, status, total, deleted_at, clients(first_name, last_name, company_name)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(100),
  ])

  const clients = clientsResult.data ?? []
  const products = productsResult.data ?? []
  const invoices = invoicesResult.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deleted records</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Restore clients, products, and invoices that were deleted in the last 30 days.
          Records stay recoverable until they are permanently purged. You will need your
          login password for each restore.
        </p>
        <RecentlyDeletedList
          clients={clients}
          products={products}
          invoices={invoices}
          clientsError={clientsResult.error?.message}
          productsError={productsResult.error?.message}
          invoicesError={invoicesResult.error?.message}
        />
      </CardContent>
    </Card>
  )
}
