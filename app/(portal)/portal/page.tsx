// app/(portal)/portal/page.tsx
// The client's home page. They see:
//   1. A friendly greeting with an eyebrow chip
//   2. Three "where you stand" tiles — total invoiced, total paid,
//      outstanding. Matches the spirit of the admin dashboard's KPI
//      cards but stripped to the three numbers a customer actually
//      cares about.
//   3. Their invoices, with the paid/unpaid state clearly marked on
//      every row (colour-coded pill + status label).
//
// No nav, no sidebar, no section tabs. The only navigation surfaces
// are the header wordmark (home) and the profile dropdown (profile +
// sign out), per the user's request.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EyebrowChip } from '@/components/ui/PageHeader'
import { formatCurrency, formatDate, getInvoiceDisplayStatus, PAYMENT_STATUS_STYLES, cn } from '@/lib/utils'
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Package,
  Plus,
  type LucideIcon,
} from 'lucide-react'

export const metadata = {
  title: 'Your Invoices',
}

interface PortalPageProps {
  // The /portal route itself doesn't take params — but Next still
  // wants searchParams typed for forward-compat with future filters.
  searchParams: Promise<Record<string, never>>
}

interface InvoiceRow {
  id: string
  document_number: string
  issue_date: string
  due_date: string | null
  total: number
  amount_paid: number
  balance_due: number
  type: 'invoice' | 'quotation'
  status: string
}

function DesktopPortalTable({ rows }: { rows: InvoiceRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((invoice) => {
          const paymentStatus = getInvoiceDisplayStatus(
            invoice.status,
            invoice.amount_paid,
            invoice.total,
            invoice.due_date
          )
          return (
            <TableRow key={invoice.id}>
              <TableCell>
                <Link
                  href={`/portal/invoice/${invoice.id}`}
                  className="font-medium text-primary hover:text-primary-hover inline-flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {invoice.document_number}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground capitalize">
                  ({invoice.type})
                </span>
              </TableCell>
              <TableCell>{formatDate(invoice.issue_date)}</TableCell>
              <TableCell>
                {invoice.due_date ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    {formatDate(invoice.due_date)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(invoice.total)}</TableCell>
              <TableCell className="text-right">{formatCurrency(invoice.balance_due)}</TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize',
                    PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
                  )}
                >
                  {paymentStatus}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function MobilePortalCard({ invoice }: { invoice: InvoiceRow }) {
  const paymentStatus = getInvoiceDisplayStatus(
    invoice.status,
    invoice.amount_paid,
    invoice.total,
    invoice.due_date
  )
  return (
    <Link
      href={`/portal/invoice/${invoice.id}`}
      className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-secondary/40"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-primary inline-flex items-center gap-1.5">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{invoice.document_number}</span>
        </p>
        <p className="text-xs text-muted-foreground capitalize">{invoice.type}</p>
        {invoice.due_date && (
          <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Due {formatDate(invoice.due_date)}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold text-foreground">{formatCurrency(invoice.balance_due)}</p>
        <span
          className={cn(
            'mt-1 inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize',
            PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
          )}
        >
          {paymentStatus}
        </span>
      </div>
    </Link>
  )
}

export default async function PortalPage({ searchParams: _searchParams }: PortalPageProps) {
  // Touch _searchParams so the param is "used" — keeps the prop
  // signature for forward-compat (we expect to add filters here) but
  // satisfies the no-unused-vars lint without an eslint-disable.
  void _searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    // Layout already guards this; defensive redirect if it ever
    // fails so we never render an empty page.
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const clientId = profile?.client_id
  if (!clientId) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Your portal account is not linked to a customer record yet. Please contact Star Hawk to finish
          setting up your account.
        </AlertDescription>
      </Alert>
    )
  }

  const { data: client } = await supabase
    .from('clients')
    .select('first_name, last_name, company_name')
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  // Pull all the client's invoices. We exclude drafts (nothing for
  // the customer to act on yet) but keep cancelled so they can see
  // the full audit trail if they ever need to.
  //
  // The .eq('client_id', clientId) filter is belt-and-braces — RLS
  // already enforces "client can only see their own client_id's
  // invoices", but spelling out the filter here makes the intent
  // obvious and protects against future RLS misconfiguration
  // silently leaking across tenants.
  const { data: invoiceRows, error: invoiceErr } = await supabase
    .from('invoices')
    .select('id, document_number, issue_date, due_date, total, amount_paid, balance_due, type, status')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'draft')
    .order('issue_date', { ascending: false })

  if (invoiceErr) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your invoices. Please try again later.</AlertDescription>
      </Alert>
    )
  }

  const invoices: InvoiceRow[] = invoiceRows ?? []

  // Low-stock alerts for the client dashboard.
  const { data: inventoryRows } = await supabase
    .from('client_inventory')
    .select('quantity_remaining, reorder_threshold, products(name)')
    .eq('client_id', clientId)

  const lowStockItems = (inventoryRows ?? []).filter(
    (item) => Number(item.quantity_remaining) <= Number(item.reorder_threshold)
  )

  // Same payment-status logic the admin side uses, so labels match.
  const paidTotal = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + Number(i.amount_paid ?? 0), 0)
  const invoicedTotal = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + Number(i.total ?? 0), 0)
  const outstandingTotal = invoices
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + Number(i.balance_due ?? 0), 0)
  const unpaidCount = invoices.filter((i) => {
    if (i.status === 'cancelled') return false
    return Number(i.balance_due ?? 0) > 0
  }).length
  const paidCount = invoices.length - unpaidCount - invoices.filter((i) => i.status === 'cancelled').length

  const firstName = client?.first_name ?? profile.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-6">
      {/* Greeting — same eyebrow chip + title pattern the dashboard
          uses so the client's home feels like part of the same
          product as the operator's dashboard. */}
      <header className="flex flex-col gap-3 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <EyebrowChip label="Your account" tone="info" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
            Hi {firstName}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {invoices.length === 0
              ? "Here's a summary of your account. Once you have an invoice it'll show up here."
              : `Here's a summary of your account. Click any invoice to view the full document.`}
          </p>
        </div>
      </header>

      {/* KPI tiles — same hero pattern the dashboard uses (icon chip +
          value + subtitle). Each tile uses the tonal background that
          matches its semantic role (neutral for total, success for
          paid, destructive for outstanding). */}
      <div className="grid gap-4 sm:grid-cols-3">
        <PortalKpiTile
          eyebrow="Total invoiced"
          value={formatCurrency(invoicedTotal)}
          subtitle={`${invoices.length} document${invoices.length === 1 ? '' : 's'} on file`}
          icon={FileText}
          tone="primary"
        />
        <PortalKpiTile
          eyebrow="Paid"
          value={formatCurrency(paidTotal)}
          subtitle={`${paidCount} settled${paidCount === 1 ? '' : ''}`}
          icon={CheckCircle2}
          tone="success"
        />
        <PortalKpiTile
          eyebrow={outstandingTotal > 0 ? 'Outstanding' : 'Nothing outstanding'}
          value={formatCurrency(outstandingTotal)}
          subtitle={
            unpaidCount === 0
              ? 'You are all caught up'
              : `${unpaidCount} to settle${unpaidCount === 1 ? '' : 's'}`
          }
          icon={outstandingTotal > 0 ? AlertCircle : CheckCircle2}
          tone={outstandingTotal > 0 ? 'destructive' : 'success'}
        />
      </div>

      {(invoices.length > 0 || lowStockItems.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Low stock alerts</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {lowStockItems.length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lowStockItems.length === 0
                      ? 'All stocked up'
                      : 'Items at or below reorder threshold'}
                  </p>
                </div>
                <div className="rounded-lg bg-warning/10 p-3 text-warning">
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <Link
                href="/portal/inventory"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
              >
                View inventory <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Need more materials?</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">Request a quote</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Build a list and we will send trade pricing
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
              </div>
              <Link
                href="/portal/quotes/new"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary"
              >
                Create quote <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" />
              <p className="mt-3 text-sm">No invoices yet. We&apos;ll send one your way when there&apos;s something to bill.</p>
            </div>
          ) : (
            <ResponsiveTable
              rows={invoices}
              keyField="id"
              renderDesktop={(rows) => <DesktopPortalTable rows={rows} />}
              renderMobile={(row) => <MobilePortalCard invoice={row} />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Single KPI tile used on the portal home. Mirrors the visual
 * language of the operator-side dashboard KpiCards — coloured icon
 * chip + value + subtitle — but stripped of the trend / sparkline
 * noise the operator sees. Tonal variants keep the three tiles
 * visually distinct so the user can read "total / paid / outstanding"
 * at a glance.
 */
function PortalKpiTile({
  eyebrow,
  value,
  subtitle,
  icon: Icon,
  tone,
}: {
  eyebrow: string
  value: string
  subtitle: string
  icon: LucideIcon
  tone: 'primary' | 'success' | 'destructive'
}) {
  const tones = {
    primary: 'bg-primary-muted text-primary ring-primary/15',
    success: 'bg-success-muted text-success ring-success/20',
    destructive: 'bg-destructive-muted text-destructive ring-destructive/20',
  }[tone]

  const valueTone =
    tone === 'destructive' ? 'text-destructive' : 'text-foreground'

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {eyebrow}
        </p>
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
            tones
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
        </span>
      </div>
      <p className={cn('mt-3 text-2xl font-semibold leading-none tracking-tight tabular-nums', valueTone)}>
        {value}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      {/* Subtle directional cue — keeps the tile from feeling inert
          without pretending it's interactive. */}
      <ArrowRight
        className="absolute bottom-4 right-4 h-3.5 w-3.5 text-muted-foreground/0 transition-colors"
        aria-hidden
      />
    </div>
  )
}