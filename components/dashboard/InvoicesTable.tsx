'use client'

// components/dashboard/InvoicesTable.tsx
// "Invoices to collect" table — the money-collection list on the
// Invoices dashboard.
//
// Surfaces only outstanding invoices (everything that still owes
// money: draft, sent, partial, overdue) — paid and cancelled are
// filtered out at the data layer so the operator's view is
// action-oriented by default.
//
// The age tabs narrow the list by how long the invoice has been
// outstanding. The two sort modes are exposed as pill buttons
// rather than a dropdown: the operator only ever needs to flip
// between "oldest first" (work the queue in FIFO order) and
// "highest balance" (chase the biggest debt first). A dropdown
// for two items is overkill.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { formatCurrency, formatDate, daysBetween, cn } from '@/lib/utils'
import type { DueInvoice, InvoiceStatusBucket } from '@/lib/dashboard-types'
import {
  DEFAULT_DASHBOARD_SORT,
  DASHBOARD_SORTS,
  INVOICE_AGE_BUCKETS,
  DEFAULT_INVOICE_AGE_FILTER,
  normalizeDashboardSort,
  type DashboardDueSort,
  type InvoiceAgeFilter,
} from '@/lib/dashboard-config'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2 } from 'lucide-react'

interface InvoicesTableProps {
  invoices: DueInvoice[]
}

const STATUS_STYLES: Record<InvoiceStatusBucket, string> = {
  paid: 'bg-success-muted text-success',
  partial: 'bg-info-muted text-info',
  overdue: 'bg-destructive-muted text-destructive',
  due: 'bg-warning-muted text-warning',
  draft: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}

const STATUS_LABEL: Record<InvoiceStatusBucket, string> = {
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  due: 'Due',
  draft: 'Draft',
  cancelled: 'Cancelled',
}

function formatAge(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

function getInvoiceAge(invoice: DueInvoice): number {
  if (!invoice.issue_date) return 0
  return Math.max(0, daysBetween(invoice.issue_date, new Date()))
}

/**
 * Sort the outstanding list.
 *
 *   oldest  — strictly chronological: the invoice created first sits
 *             at the top, the newest at the bottom. The operator
 *             works the queue top-to-bottom in FIFO order.
 *   balance — by remaining balance descending. Chase the biggest
 *             debt first.
 *
 * Both modes are stable: ties fall back to the issue date so the
 * list is deterministic across reloads.
 */
function sortInvoices(invoices: DueInvoice[], sort: DashboardDueSort): DueInvoice[] {
  const list = [...invoices]
  if (sort === 'balance') {
    return list.sort((a, b) => {
      if (b.balance_due !== a.balance_due) return b.balance_due - a.balance_due
      return (a.issue_date ?? '').localeCompare(b.issue_date ?? '')
    })
  }
  // 'oldest' (default) — oldest created first, newest at the bottom.
  // created_at is the system creation timestamp; issue_date is the
  // fallback for legacy rows.
  return list.sort((a, b) => {
    const aDate = a.created_at ?? a.issue_date ?? ''
    const bDate = b.created_at ?? b.issue_date ?? ''
    if (aDate !== bDate) return aDate.localeCompare(bDate)
    return (a.issue_date ?? '').localeCompare(b.issue_date ?? '')
  })
}

function SortToggle({
  value,
  onChange,
}: {
  value: DashboardDueSort
  onChange: (next: DashboardDueSort) => void
}) {
  // Pill button group — exposes the two sort modes the operator
  // actually uses, without the visual weight of a labelled
  // dropdown. The active button gets the same primary treatment
  // as a tab trigger so the two stay visually consistent.
  const options: DashboardDueSort[] = ['oldest', 'balance']
  return (
    <div
      role="group"
      aria-label="Sort invoices"
      className="inline-flex h-8 items-center rounded-lg border border-input bg-card p-0.5"
    >
      {options.map((key) => {
        const isActive = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isActive}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {DASHBOARD_SORTS[key].label}
          </button>
        )
      })}
    </div>
  )
}

function DesktopInvoiceTable({ rows }: { rows: DueInvoice[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Issue Date</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Age</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((invoice) => {
          const ageText = formatAge(getInvoiceAge(invoice))
          return (
            <TableRow key={invoice.id}>
              <TableCell>
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="font-medium text-primary hover:text-primary-hover"
                >
                  {invoice.document_number}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{invoice.clientName}</TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {formatDate(invoice.created_at)}
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {formatDate(invoice.issue_date)}
              </TableCell>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {formatDate(invoice.due_date)}
              </TableCell>
              <TableCell>
                <span className="font-medium text-foreground">{ageText}</span>
                {invoice.status === 'overdue' && (
                  <span className="ml-1 text-xs text-destructive">
                    ({invoice.daysOverdue} day{invoice.daysOverdue === 1 ? '' : 's'} overdue)
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{formatCurrency(invoice.total)}</TableCell>
              <TableCell className="text-right font-medium text-foreground">
                {formatCurrency(invoice.balance_due)}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                    STATUS_STYLES[invoice.status]
                  )}
                >
                  {STATUS_LABEL[invoice.status]}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

function MobileInvoiceCard({ invoice }: { invoice: DueInvoice }) {
  const ageText = formatAge(getInvoiceAge(invoice))
  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="block p-4 transition-colors hover:bg-secondary/40"
    >
      {/* Top row — document number on the left, status chip on the
          top right. The status is the operator's primary "what is
          this row telling me to do" signal, so it gets the most
          prominent position in the card. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-primary">{invoice.document_number}</p>
          <p className="truncate text-sm text-muted-foreground">{invoice.clientName}</p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 px-2 py-0.5 rounded-full text-xs font-medium',
            STATUS_STYLES[invoice.status]
          )}
        >
          {STATUS_LABEL[invoice.status]}
        </span>
      </div>
      {/* Bottom row — meta + balance. Balance moves here so the
          top-right slot stays free for the status chip. */}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2 text-xs text-muted-foreground">
        <div>
          <p>
            Created {formatDate(invoice.created_at) || '—'} ·{' '}
            <span className="font-medium text-foreground">{ageText}</span>
          </p>
          {invoice.due_date && <p>Due {formatDate(invoice.due_date)}</p>}
        </div>
        <p className="font-semibold text-foreground text-sm tabular-nums">
          {formatCurrency(invoice.balance_due)}
        </p>
      </div>
    </Link>
  )
}

export function InvoicesTable({ invoices }: InvoicesTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Derive the sort directly from the URL. The URL is the single
  // source of truth — there's no local copy that can drift. On
  // first client render `useSearchParams` returns the same value
  // the server used to render, so SSR + hydration line up.
  const sort = useMemo(
    () => normalizeDashboardSort(searchParams?.get('sort') ?? undefined),
    [searchParams]
  )
  const [activeFilter, setActiveFilter] = useState<InvoiceAgeFilter>(DEFAULT_INVOICE_AGE_FILTER)

  function handleSortChange(next: DashboardDueSort) {
    if (next === sort) return
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === DEFAULT_DASHBOARD_SORT) {
      params.delete('sort')
    } else {
      params.set('sort', next)
    }
    const qs = params.toString()
    router.replace(qs ? `/invoices?${qs}` : '/invoices', { scroll: false })
  }

  const filteredInvoices = useMemo(() => {
    const bucket = INVOICE_AGE_BUCKETS.find((b) => b.key === activeFilter)
    if (!bucket || bucket.key === 'all') return invoices
    return invoices.filter((invoice) => {
      const age = getInvoiceAge(invoice)
      return age >= bucket.minDays && (bucket.maxDays === null || age <= bucket.maxDays)
    })
  }, [invoices, activeFilter])

  const sortedInvoices = useMemo(
    () => sortInvoices(filteredInvoices, sort),
    [filteredInvoices, sort]
  )

  // "Money collection" framing — count of invoices in the queue
  // (after the age filter, before the sort) so the operator can see
  // at a glance how many invoices need attention right now.
  const queueCount = sortedInvoices.length

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Invoices to collect</CardTitle>
            <CardDescription>
              Every invoice that still owes money — drafts, sent, partial and
              overdue. Open a row to record a payment or chase the balance.
            </CardDescription>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{queueCount}</span>{' '}
              invoice{queueCount === 1 ? '' : 's'} in the queue
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Tabs
              value={activeFilter}
              onValueChange={(value) => setActiveFilter(value as InvoiceAgeFilter)}
              className="w-full sm:w-auto"
            >
              <TabsList className="w-full sm:w-auto">
                {INVOICE_AGE_BUCKETS.map((bucket) => (
                  <TabsTrigger key={bucket.key} value={bucket.key} className="text-xs">
                    {bucket.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <SortToggle value={sort} onChange={handleSortChange} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {sortedInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-muted text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {activeFilter === DEFAULT_INVOICE_AGE_FILTER
                ? 'Nothing to collect. Every live invoice is settled.'
                : 'No outstanding invoices in this age range.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeFilter === DEFAULT_INVOICE_AGE_FILTER
                ? 'Paid and cancelled invoices are hidden — only invoices that still owe money appear here.'
                : 'Pick a wider age range or clear the filter to see the rest of the queue.'}
            </p>
          </div>
        ) : (
          <ResponsiveTable
            rows={sortedInvoices}
            keyField="id"
            renderDesktop={(rows) => <DesktopInvoiceTable rows={rows} />}
            renderMobile={(row) => <MobileInvoiceCard invoice={row} />}
          />
        )}
      </CardContent>
    </Card>
  )
}
