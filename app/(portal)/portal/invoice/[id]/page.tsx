// app/(portal)/portal/invoice/[id]/page.tsx
// Client-facing view of a single invoice. Deliberately simpler than
// the operator view — no edit / send / payment controls, no admin
// chrome. Just a printable summary so the client can confirm the
// document and (in the future) download a PDF copy.
//
// Authz: we re-verify the invoice's client_id matches the signed-in
// profile's client_id, which is the RLS check the table enforces —
// we add a second guard here so an attacker probing for invoice IDs
// gets a clean 404 instead of a generic RLS error.

import { notFound } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import { formatCurrency, formatDate, getInvoiceDisplayStatus, PAYMENT_STATUS_STYLES, cn } from '@/lib/utils'
import { ArrowLeft, FileText, CheckCircle2, Send, FileEdit, Download } from 'lucide-react'

export const metadata = {
  title: 'Invoice',
}

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PortalInvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.client_id) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Your portal account is not linked to a customer record yet. Please contact Demo Builder Merchant to finish
          setting up your account.
        </AlertDescription>
      </Alert>
    )
  }

  // Pull the invoice — RLS will block it if the client_id doesn't
  // match. We still explicitly filter on client_id so a missing row
  // becomes a clean notFound() instead of a permission error.
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(
      `id, type, document_number, order_number, issue_date, due_date,
       subtotal, vat_total, total, amount_paid, balance_due, status, notes,
       invoice_items(product_name, product_code, unit, quantity, price, line_total, sort_order)`
    )
    .eq('id', id)
    .eq('client_id', profile.client_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !invoice) {
    notFound()
  }

  // Draft invoices are internal working documents — never show them in the
  // client portal, even when the client_id matches.
  if (invoice.status === 'draft') {
    notFound()
  }

  // Sort line items by their declared order so the rendered table
  // matches the operator-side view (default = 0, then 1, 2, …).
  const items = (invoice.invoice_items ?? []).slice().sort(
    (a: { sort_order: number }, b: { sort_order: number }) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  const paymentStatus = getInvoiceDisplayStatus(invoice.status, invoice.amount_paid, invoice.total, invoice.due_date)
  const isPaid = paymentStatus === 'paid'
  const isCancelled = invoice.status === 'cancelled'
  const isDraft = invoice.status === 'draft'
  const isPartial = paymentStatus === 'partial'

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label={invoice.type === 'quotation' ? 'Quotation' : 'Invoice'} tone="info" />}
        title={invoice.document_number}
        description={
          <>
            Issued {formatDate(invoice.issue_date)}
            {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}
          </>
        }
        actions={
          <>
            <Link href="/portal">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <span
              className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium capitalize',
                PAYMENT_STATUS_STYLES[paymentStatus as keyof typeof PAYMENT_STATUS_STYLES]
              )}
            >
              {paymentStatus}
            </span>
          </>
        }
      />

      {/* Status timeline — gives the customer an at-a-glance read of
          where the document is in its lifecycle. */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <StatusTimeline
            isDraft={isDraft}
            isCancelled={isCancelled}
            isPaid={isPaid}
            isPartial={isPartial}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(invoice.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="mt-2 text-2xl font-semibold text-success">{formatCurrency(invoice.amount_paid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
            <p
              className={cn(
                'mt-2 text-2xl font-semibold',
                invoice.balance_due > 0 ? 'text-destructive' : 'text-foreground'
              )}
            >
              {formatCurrency(invoice.balance_due)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No line items on this document.
            </div>
          ) : (
            <ResponsiveTable
              rows={items as Array<{
                id?: string
                product_name: string
                product_code: string | null
                unit: string | null
                quantity: number
                price: number
                line_total: number
              }>}
              keyField="id"
              renderDesktop={(rows) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item, idx) => (
                      <TableRow key={item.id ?? idx}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.product_code ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{item.unit ?? 'EA'}</TableCell>
                        <TableCell className="text-right">{Number(item.quantity).toLocaleString('en-GB')}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.line_total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              renderMobile={(item) => (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.product_code ?? '—'} · {item.unit ?? 'EA'}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-foreground">
                      {formatCurrency(item.line_total)}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>Qty: {Number(item.quantity).toLocaleString('en-GB')}</span>
                    <span>Price: {formatCurrency(item.price)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="text-foreground">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">VAT</span>
            <span className="text-foreground">{formatCurrency(invoice.vat_total)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <span className="text-foreground">Total</span>
            <span className="text-foreground">{formatCurrency(invoice.total)}</span>
          </div>
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Four-step status timeline rendered on every portal invoice view.
 * Each step lights up when its condition is satisfied. The Cancelled
 * variant replaces the green "Paid" node with a destructive chip
 * when the document is cancelled.
 */
function StatusTimeline({
  isDraft,
  isCancelled,
  isPaid,
  isPartial,
}: {
  isDraft: boolean
  isCancelled: boolean
  isPaid: boolean
  isPartial: boolean
}) {
  const steps = [
    {
      key: 'draft',
      label: 'Drafted',
      description: 'Created on the operator side',
      icon: FileEdit,
      done: true, // the invoice exists, so this step is always true
    },
    {
      key: 'sent',
      label: 'Sent',
      description: 'Issued to you',
      icon: Send,
      done: !isDraft && !isCancelled,
    },
    {
      key: 'partial',
      label: isPartial ? 'Partially paid' : 'Settled',
      description: isPartial
        ? 'A payment has been recorded against this invoice'
        : isPaid
          ? 'Paid in full'
          : 'Awaiting payment',
      icon: CheckCircle2,
      done: isPaid || isPartial,
    },
  ]

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive-muted text-destructive">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">This document was cancelled</p>
          <p className="text-xs text-muted-foreground">
            Contact Star Hawk if you have any questions about this entry.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
      {steps.map((step, idx) => {
        const Icon = step.icon
        const isLast = idx === steps.length - 1
        return (
          <li
            key={step.key}
            className="flex flex-1 items-start gap-3 sm:items-center sm:gap-0"
          >
            <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
              <span
                className={cn(
                  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1',
                  step.done
                    ? 'bg-success-muted text-success ring-success/20'
                    : 'bg-muted text-muted-foreground ring-border'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="sm:pb-0">
                <p className={cn('text-sm font-semibold', step.done ? 'text-foreground' : 'text-muted-foreground')}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
            {!isLast && (
              <div
                aria-hidden
                className={cn(
                  'mx-4 hidden h-px flex-1 sm:block',
                  step.done && steps[idx + 1]?.done ? 'bg-success/40' : 'bg-border'
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
