'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SalesChart } from '@/components/dashboard/SalesChart'
import { StatusBreakdown } from '@/components/dashboard/StatusBreakdown'
import { RankedBarList } from '@/components/dashboard/RankedBarList'
import { ClientDashboardKpiStrip } from './ClientDashboardKpiStrip'
import { formatCurrency, formatDate, getInvoiceDisplayStatus, PAYMENT_STATUS_STYLES, cn } from '@/lib/utils'
import { FileText, Package, CalendarClock, TrendingUp, Wallet, EyeOff } from 'lucide-react'
import type { ClientAnalytics, ClientStatusBreakdown } from '@/lib/client-analytics'
import type { ClientInvoiceRow } from './types'

interface ClientDashboardViewProps {
  analytics: ClientAnalytics | null
  recentInvoices: ClientInvoiceRow[]
  showMoney: boolean
  clientName: string
}

const STATUS_COLORS: Record<string, string> = {
  paid: 'var(--success)',
  partial: 'var(--warning)',
  due: 'var(--primary)',
  overdue: 'var(--destructive)',
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  due: 'Due',
  overdue: 'Overdue',
}

function toStatusBreakdownItems(items: ClientStatusBreakdown[]) {
  return items.map((item) => ({
    status: item.status,
    count: item.count,
    amount: item.amount,
    label: STATUS_LABELS[item.status] ?? item.status,
    color: STATUS_COLORS[item.status] ?? 'var(--muted-foreground)',
  }))
}

export function ClientDashboardView({ analytics, recentInvoices, showMoney, clientName }: ClientDashboardViewProps) {
  if (!analytics) {
    return (
      <Alert variant={showMoney ? 'destructive' : 'default'}>
        <AlertDescription>
          {showMoney
            ? 'Unable to load client dashboard. Please try again later.'
            : 'Dashboard details are hidden because you do not have permission to see client money.'}
        </AlertDescription>
      </Alert>
    )
  }

  const statusItems = toStatusBreakdownItems(analytics.statusBreakdown)

  return (
    <div className="space-y-6">
      <ClientDashboardKpiStrip
        totalInvoiced={analytics.totalInvoiced}
        totalPaid={analytics.totalPaid}
        totalOutstanding={analytics.totalOutstanding}
        accountBalance={analytics.accountBalance}
        invoiceCount={analytics.invoiceCount}
        overdueCount={analytics.overdueCount}
        averageDaysToPay={analytics.averageDaysToPay}
        showMoney={showMoney}
      />

      {showMoney ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SalesChart data={analytics.monthlySeries} range="year" />
            </div>
            <div>
              <StatusBreakdown data={statusItems} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankedBarList
              title="Top products"
              description="Most purchased by volume and value"
              data={analytics.topProducts}
              renderLabel={(item) => item.name}
              renderSubLabel={(item) => `${item.quantity} sold · ${formatCurrency(item.revenue)}`}
              getValue={(item) => item.revenue}
              icon={Package}
              emptyMessage="No product purchases yet"
            />
            <Card className="h-full overflow-hidden border-border/70 p-0 shadow-none">
          <CardHeader className="border-b border-border/60 bg-gradient-to-b from-muted/40 to-transparent p-5 pb-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-muted text-warning">
                <CalendarClock className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Invoice ageing</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Outstanding balance by due date</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {analytics.ageingBuckets.some((b) => b.amount > 0) ? (
              <div className="space-y-3">
                {analytics.ageingBuckets.map((bucket, index) => {
                  const total = analytics.totalOutstanding || 1
                  const share = (bucket.amount / total) * 100
                  const tones = [
                    'bg-success',
                    'bg-warning',
                    'bg-warning/80',
                    'bg-destructive/80',
                    'bg-destructive',
                  ]
                  return (
                    <div key={bucket.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{bucket.label}</span>
                        <span className="tabular-nums font-semibold">
                          {showMoney ? formatCurrency(bucket.amount) : '—'}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full transition-all duration-700', tones[index])}
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bucket.count} invoice{bucket.count === 1 ? '' : 's'}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <TrendingUp className="mx-auto h-8 w-8 text-success/60" />
                <p className="mt-3 text-sm text-muted-foreground">Nothing outstanding — {clientName} is up to date.</p>
              </div>
            )}
          </CardContent>
        </Card>
          </div>
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <EyeOff className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">Money figures hidden</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Charts and product revenue are hidden because you do not have permission to see client money.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentInvoices.length > 0 ? (
            <ResponsiveTable
              rows={recentInvoices}
              keyField="id"
              renderDesktop={(rows) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      {showMoney && (
                        <>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((invoice) => {
                      const status = showMoney
                        ? getInvoiceDisplayStatus(
                            invoice.status,
                            invoice.amount_paid,
                            invoice.total,
                            invoice.due_date
                          )
                        : invoice.status
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="font-medium text-primary hover:text-primary-hover inline-flex items-center gap-1.5"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {invoice.document_number}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                'inline-flex px-2 py-1 rounded-full text-xs font-medium capitalize',
                                PAYMENT_STATUS_STYLES[status as keyof typeof PAYMENT_STATUS_STYLES]
                              )}
                            >
                              {status}
                            </span>
                          </TableCell>
                          {showMoney && (
                            <>
                              <TableCell className="text-right">{formatCurrency(invoice.total)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(invoice.balance_due)}</TableCell>
                            </>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              renderMobile={(invoice) => {
                const status = showMoney
                  ? getInvoiceDisplayStatus(
                      invoice.status,
                      invoice.amount_paid,
                      invoice.total,
                      invoice.due_date
                    )
                  : invoice.status
                return (
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-medium text-primary hover:text-primary-hover inline-flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {invoice.document_number}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDate(invoice.issue_date)}</p>
                    </div>
                    <div className="text-right">
                      {showMoney && (
                        <p className="font-semibold text-foreground">{formatCurrency(invoice.balance_due)}</p>
                      )}
                      <span
                        className={cn(
                          'mt-1 inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          PAYMENT_STATUS_STYLES[status as keyof typeof PAYMENT_STATUS_STYLES]
                        )}
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
          ) : (
            <div className="text-center py-10">
              <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">No invoices yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
