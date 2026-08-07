'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  depositToClientAccount,
  applyClientAccountBalance,
  type ClientTransaction,
  type ClientAccountAllocation,
} from '@/lib/actions/client-account'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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
import { AccountVerificationDialog, type AccountVerificationData } from './AccountVerificationDialog'
import type { ClientInvoiceRow } from './types'
import {
  formatCurrency,
  formatDate,
  formatDateInput,
  getInvoiceDisplayStatus,
  PAYMENT_STATUS_STYLES,
  cn,
} from '@/lib/utils'
import { FileText, Wallet, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, EyeOff, Search, X, Calendar } from 'lucide-react'

interface ClientAccountViewProps {
  clientId: string
  clientName: string
  accountBalance: number
  invoices: ClientInvoiceRow[]
  ledger: ClientTransaction[]
  showMoney: boolean
  canManageAccount: boolean
}

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'ecod', label: 'e-COD (Cash on Delivery)' },
  { value: 'other', label: 'Other' },
]

export function ClientAccountView({
  clientId,
  clientName,
  accountBalance,
  invoices,
  ledger,
  showMoney,
  canManageAccount,
}: ClientAccountViewProps) {
  const router = useRouter()

  // Only real invoices that still owe money (sent / partial / due / overdue).
  const unpaidInvoices = useMemo(
    () =>
      invoices
        .filter(
          (i) =>
            i.type === 'invoice' &&
            i.balance_due > 0 &&
            !['cancelled', 'draft', 'paid'].includes(i.status)
        )
        .sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()),
    [invoices]
  )

  const totalDue = useMemo(
    () => unpaidInvoices.reduce((sum, i) => sum + i.balance_due, 0),
    [unpaidInvoices]
  )
  const totalOverdue = useMemo(
    () =>
      unpaidInvoices
        .filter((i) => {
          const status = getInvoiceDisplayStatus(i.status, i.amount_paid, i.total, i.due_date)
          return status === 'overdue'
        })
        .reduce((sum, i) => sum + i.balance_due, 0),
    [unpaidInvoices]
  )

  // Deposit form state
  const [depositAmount, setDepositAmount] = useState('')
  const [depositDate, setDepositDate] = useState(formatDateInput())
  const [depositMethod, setDepositMethod] = useState<string>('bank_transfer')
  const [depositReference, setDepositReference] = useState('')
  const [depositNotes, setDepositNotes] = useState('')

  // Per-invoice pay amounts
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({})

  // Dialog + feedback state
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<
    | { type: 'deposit' }
    | { type: 'allocate'; allocations: ClientAccountAllocation[]; label: string }
  >({ type: 'deposit' })
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  // Ledger filter state
  type LedgerRange = 'all' | 'this-month' | 'last-7-days' | 'custom'
  const [ledgerRange, setLedgerRange] = useState<LedgerRange>('all')
  const [ledgerRangeFrom, setLedgerRangeFrom] = useState<string>('')
  const [ledgerRangeTo, setLedgerRangeTo] = useState<string>('')
  const [ledgerSearch, setLedgerSearch] = useState<string>('')

  // Build a lookup of invoice id → document number so the search box can match
  // invoice numbers from the ledger entries (which only carry invoice_id).
  const invoiceNumberById = useMemo(() => {
    const map = new Map<string, string>()
    for (const inv of invoices) map.set(inv.id, inv.document_number)
    return map
  }, [invoices])

  // Apply date filter + search filter to the ledger. Group the result by year-month
  // for the rendered view — we keep the most-recent-first ordering that the server
  // already returned, so the section order is naturally newest → oldest.
  const filteredLedger = useMemo(() => {
    const q = ledgerSearch.trim().toLowerCase()
    const now = new Date()
    let fromTs: number | null = null
    let toTs: number | null = null
    if (ledgerRange === 'this-month') {
      fromTs = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      toTs = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime()
    } else if (ledgerRange === 'last-7-days') {
      fromTs = now.getTime() - 7 * 24 * 60 * 60 * 1000
    } else if (ledgerRange === 'custom') {
      if (ledgerRangeFrom) fromTs = new Date(`${ledgerRangeFrom}T00:00:00`).getTime()
      if (ledgerRangeTo) toTs = new Date(`${ledgerRangeTo}T23:59:59.999`).getTime()
    }

    return ledger.filter((tx) => {
      const ts = new Date(tx.transaction_date).getTime()
      if (fromTs !== null && ts < fromTs) return false
      if (toTs !== null && ts > toTs) return false
      if (!q) return true
      const haystack = [
        tx.notes,
        tx.reference,
        tx.method,
        tx.verified_name,
        tx.created_by_name,
        tx.type,
        tx.invoice_id ? invoiceNumberById.get(tx.invoice_id) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [ledger, ledgerRange, ledgerRangeFrom, ledgerRangeTo, ledgerSearch, invoiceNumberById])

  // Group filtered entries into month buckets. The transactions are already in
  // newest-first order from the server, so iterating in order is enough.
  const ledgerByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: typeof filteredLedger }[] = []
    const indexByKey = new Map<string, number>()
    for (const tx of filteredLedger) {
      const d = new Date(tx.transaction_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      let idx = indexByKey.get(key)
      if (idx === undefined) {
        idx = groups.length
        indexByKey.set(key, idx)
        groups.push({
          key,
          label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          items: [],
        })
      }
      groups[idx].items.push(tx)
    }
    return groups
  }, [filteredLedger])

  const filtersActive =
    ledgerRange !== 'all' || ledgerSearch.trim() !== '' || ledgerRangeFrom !== '' || ledgerRangeTo !== ''

  function clearLedgerFilters() {
    setLedgerRange('all')
    setLedgerRangeFrom('')
    setLedgerRangeTo('')
    setLedgerSearch('')
  }

  function setPayAmount(invoiceId: string, value: string) {
    setPayAmounts((prev) => ({ ...prev, [invoiceId]: value }))
  }

  function getPayAmount(invoice: ClientInvoiceRow): number {
    const raw = payAmounts[invoice.id]
    if (raw === undefined) return invoice.balance_due
    const value = parseFloat(raw)
    return Number.isFinite(value) && value >= 0 ? value : 0
  }

  function resetDepositForm() {
    setDepositAmount('')
    setDepositReference('')
    setDepositNotes('')
    setDepositDate(formatDateInput())
  }

  function openVerification(
    action: { type: 'deposit' } | { type: 'allocate'; allocations: ClientAccountAllocation[]; label: string }
  ) {
    setPendingAction(action)
    setFeedback(null)
    setVerifyOpen(true)
  }

  async function handleVerified(data: AccountVerificationData) {
    setFeedback(null)

    if (pendingAction.type === 'deposit') {
      const amount = parseFloat(depositAmount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return { error: 'Deposit amount must be greater than zero.' }
      }

      const result = await depositToClientAccount({
        client_id: clientId,
        amount,
        payment_date: depositDate,
        method: depositMethod as 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod',
        reference: depositReference,
        notes: depositNotes,
        verified_name: data.verifiedName,
        confirm_password: data.password,
      })

      if (result.error) return { error: result.error }

      resetDepositForm()
      setFeedback({ kind: 'ok', message: 'Deposit recorded successfully.' })
      router.refresh()
      return {}
    }

    // Allocation
    const result = await applyClientAccountBalance({
      client_id: clientId,
      allocations: pendingAction.allocations,
      notes: `Applied from client account — ${pendingAction.label}`,
      verified_name: data.verifiedName,
      confirm_password: data.password,
    })

    if (result.error) return { error: result.error }

    setPayAmounts({})
    setFeedback({ kind: 'ok', message: 'Account balance applied to invoices.' })
    router.refresh()
    return {}
  }

  function handleRecordDeposit() {
    const amount = parseFloat(depositAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback({ kind: 'err', message: 'Deposit amount must be greater than zero.' })
      return
    }
    openVerification({ type: 'deposit' })
  }

  function handlePayInvoice(invoice: ClientInvoiceRow) {
    const amount = Math.min(getPayAmount(invoice), invoice.balance_due)
    if (amount <= 0) return
    openVerification({
      type: 'allocate',
      allocations: [{ invoice_id: invoice.id, amount }],
      label: `invoice ${invoice.document_number}`,
    })
  }

  function handleUseAllBalance() {
    const allocations: ClientAccountAllocation[] = []
    let remaining = accountBalance
    for (const invoice of unpaidInvoices) {
      if (remaining <= 0) break
      const amount = Math.min(remaining, invoice.balance_due)
      if (amount > 0) {
        allocations.push({ invoice_id: invoice.id, amount })
        remaining -= amount
      }
    }
    if (allocations.length === 0) return
    openVerification({ type: 'allocate', allocations, label: 'use all balance' })
  }

  function handlePayAllPossible() {
    const allocations: ClientAccountAllocation[] = []
    let remaining = accountBalance
    for (const invoice of unpaidInvoices) {
      if (remaining <= 0) break
      if (invoice.balance_due <= remaining) {
        allocations.push({ invoice_id: invoice.id, amount: invoice.balance_due })
        remaining -= invoice.balance_due
      }
    }
    if (allocations.length === 0) return
    openVerification({ type: 'allocate', allocations, label: 'pay all possible' })
  }

  const parsedDepositAmount = parseFloat(depositAmount)
  const depositAmountValid = Number.isFinite(parsedDepositAmount) && parsedDepositAmount > 0

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert variant={feedback.kind === 'ok' ? 'default' : 'destructive'}>
          <AlertDescription className="flex items-center gap-2">
            {feedback.kind === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {feedback.message}
          </AlertDescription>
        </Alert>
      )}

      {showMoney ? (
        <>
          {/* Balance summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-l-4 border-l-primary">
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Account Balance
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {formatCurrency(accountBalance)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-warning">
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Open Invoices
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">{formatCurrency(totalDue)}</p>
                <p className="text-xs text-muted-foreground mt-1">{unpaidInvoices.length} invoice(s)</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Overdue
                </p>
                <p className="mt-1 text-3xl font-semibold text-destructive">
                  {formatCurrency(totalOverdue)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Deposit form */}
          {canManageAccount && (
            <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-success" />
              Deposit to Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="deposit-amount">Amount *</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0.00"

                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deposit-date">Date *</Label>
                <Input
                  id="deposit-date"
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}

                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="deposit-method">Method *</Label>
                <Select
                  id="deposit-method"
                  value={depositMethod}
                  onChange={(value) => setDepositMethod(value)}
                  options={METHOD_OPTIONS}

                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="deposit-reference">Reference</Label>
                <Input
                  id="deposit-reference"
                  value={depositReference}
                  onChange={(e) => setDepositReference(e.target.value)}
                  placeholder="Transaction ID, cheque number…"

                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="deposit-notes">Notes</Label>
                <Input
                  id="deposit-notes"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  placeholder="Optional note"

                />
              </div>
            </div>
            <div className="mt-4">
              <Button
                onClick={handleRecordDeposit}
                disabled={!depositAmountValid}
              >
                <Wallet className="w-4 h-4 mr-2" />
                Record Deposit
              </Button>
            </div>
          </CardContent>
        </Card>
          )}
        </>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <EyeOff className="mx-auto h-8 w-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">Account details hidden</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Money figures and account actions are hidden because you do not have permission to see client money.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Unpaid invoice queue -- still visible for reference, balances redacted above */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-warning" />
              {showMoney ? 'Pay Invoices from Balance' : 'Unpaid Invoices'}
            </span>
            {canManageAccount && showMoney && unpaidInvoices.length > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePayAllPossible}
                  disabled={accountBalance <= 0}
                >
                  Pay all possible
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUseAllBalance}
                  disabled={accountBalance <= 0}
                >
                  Use all balance
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {unpaidInvoices.length > 0 ? (
            <ResponsiveTable
              rows={unpaidInvoices}
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
                          <TableHead className="text-right">Pay amount</TableHead>
                          <TableHead className="w-[120px]"></TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((invoice) => {
                      const status = getInvoiceDisplayStatus(
                        invoice.status,
                        invoice.amount_paid,
                        invoice.total,
                        invoice.due_date
                      )
                      const payAmount = getPayAmount(invoice)
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
                              <TableCell className="text-right">
                                {formatCurrency(invoice.total)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(invoice.balance_due)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  max={invoice.balance_due}
                                  value={payAmounts[invoice.id] ?? invoice.balance_due.toFixed(2)}
                                  onChange={(e) => setPayAmount(invoice.id, e.target.value)}
                                  className="w-28 ml-auto text-right"
                                />
                              </TableCell>
                              <TableCell>
                                {canManageAccount && (
                                  <Button
                                    size="sm"
                                    onClick={() => handlePayInvoice(invoice)}
                                    disabled={payAmount <= 0 || accountBalance <= 0}
                                  >
                                    Pay
                                  </Button>
                                )}
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              renderMobile={(invoice) => {
                const status = getInvoiceDisplayStatus(
                  invoice.status,
                  invoice.amount_paid,
                  invoice.total,
                  invoice.due_date
                )
                const payAmount = getPayAmount(invoice)
                return (
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-medium text-primary hover:text-primary-hover inline-flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {invoice.document_number}
                      </Link>
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          PAYMENT_STATUS_STYLES[status as keyof typeof PAYMENT_STATUS_STYLES]
                        )}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(invoice.issue_date)}
                    </div>
                    {showMoney && (
                      <div className="flex items-center justify-between text-sm">
                        <span>Balance</span>
                        <span className="font-medium">{formatCurrency(invoice.balance_due)}</span>
                      </div>
                    )}
                    {canManageAccount && showMoney && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={invoice.balance_due}
                          value={payAmounts[invoice.id] ?? invoice.balance_due.toFixed(2)}
                          onChange={(e) => setPayAmount(invoice.id, e.target.value)}
                          className="w-28"
                        />
                        <Button
                          size="sm"
                          onClick={() => handlePayInvoice(invoice)}
                          disabled={payAmount <= 0 || accountBalance <= 0}
                        >
                          Pay
                        </Button>
                      </div>
                    )}
                  </div>
                )
              }}
            />
          ) : (
            <div className="text-center py-10">
              <CheckCircle2 className="mx-auto h-8 w-8 text-success/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                No unpaid invoices for {clientName}.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction ledger */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Account Ledger</span>
            {showMoney && filteredLedger.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {filteredLedger.length} of {ledger.length} transaction{ledger.length === 1 ? '' : 's'}
              </span>
            )}
          </CardTitle>
          {ledger.length > 0 && (
            <div className="flex flex-col gap-3">
              {/* Search box */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search notes, reference, invoice, verified by…"
                  className="pl-9 pr-9"
                />
                {ledgerSearch && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setLedgerSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Time-range filter */}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="inline-flex rounded-md border border-border bg-card p-0.5 self-start">
                  {(
                    [
                      { value: 'all', label: 'All' },
                      { value: 'this-month', label: 'This month' },
                      { value: 'last-7-days', label: 'Last 7 days' },
                      { value: 'custom', label: 'Custom…' },
                    ] as { value: LedgerRange; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLedgerRange(opt.value)}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        ledgerRange === opt.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {ledgerRange === 'custom' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="ledger-from" className="text-xs text-muted-foreground whitespace-nowrap">
                        From
                      </Label>
                      <Input
                        id="ledger-from"
                        type="date"
                        value={ledgerRangeFrom}
                        onChange={(e) => setLedgerRangeFrom(e.target.value)}
                        className="h-8 w-[150px]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="ledger-to" className="text-xs text-muted-foreground whitespace-nowrap">
                        To
                      </Label>
                      <Input
                        id="ledger-to"
                        type="date"
                        value={ledgerRangeTo}
                        onChange={(e) => setLedgerRangeTo(e.target.value)}
                        className="h-8 w-[150px]"
                      />
                    </div>
                  </div>
                )}
                {filtersActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearLedgerFilters}
                    className="self-start sm:self-auto"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <div className="text-center py-10">
              <Wallet className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">No account transactions yet.</p>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className="text-center py-10">
              <Calendar className="mx-auto h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-foreground">No transactions match your filters.</p>
              <Button type="button" variant="outline" size="sm" onClick={clearLedgerFilters} className="mt-3">
                Clear filters
              </Button>
            </div>
          ) : (
            <div>
              {ledgerByMonth.map((group, groupIdx) => {
                // Compute per-month totals to show in the section header.
                let inTotal = 0
                let outTotal = 0
                for (const tx of group.items) {
                  if (tx.type === 'deposit') inTotal += tx.amount
                  else if (tx.type === 'allocation' || tx.type === 'withdrawal') outTotal += tx.amount
                  // Reversals are refunds back to the account, treated as in-flow for the month.
                  else if (tx.type === 'reversal') inTotal += tx.amount
                  // Adjustments are signed: negative moves money out, positive in.
                  else if (tx.type === 'adjustment') {
                    if (tx.amount < 0) outTotal += Math.abs(tx.amount)
                    else inTotal += tx.amount
                  }
                }
                return (
                  <div key={group.key}>
                    <div
                      className={cn(
                        'sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/60 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        groupIdx === 0 ? 'border-t' : ''
                      )}
                    >
                      <span>{group.label}</span>
                      {showMoney && (
                        <span className="flex items-center gap-3 font-normal normal-case text-muted-foreground">
                          <span className="text-success">+{formatCurrency(inTotal)}</span>
                          <span className="text-foreground">-{formatCurrency(outTotal)}</span>
                          <span className="text-muted-foreground">
                            · {group.items.length} txn{group.items.length === 1 ? '' : 's'}
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 hover:bg-secondary/40"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                                  tx.type === 'deposit' || tx.type === 'reversal'
                                    ? 'bg-success/10 text-success'
                                    : tx.type === 'allocation'
                                      ? 'bg-warning/10 text-warning'
                                      : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {tx.type}
                              </span>
                              <span className="text-sm text-muted-foreground">{formatDate(tx.transaction_date)}</span>
                              {tx.created_by_name && (
                                <span className="text-xs text-muted-foreground">by {tx.created_by_name}</span>
                              )}
                            </div>
                            <div className="text-sm text-foreground">
                              {tx.type === 'allocation' && tx.invoice_id ? (
                                <span>
                                  Applied to invoice{' '}
                                  {invoiceNumberById.get(tx.invoice_id) || tx.invoice_id}
                                </span>
                              ) : tx.type === 'reversal' && tx.invoice_id ? (
                                <span>
                                  Reversed allocation from invoice{' '}
                                  {invoiceNumberById.get(tx.invoice_id) || tx.invoice_id}
                                  {tx.notes ? ` — ${tx.notes}` : ''}
                                </span>
                              ) : (
                                <span>{tx.notes || tx.reference || (tx.method ? `Method: ${tx.method}` : '')}</span>
                              )}
                            </div>
                            {tx.verified_name && (
                              <div className="text-xs text-muted-foreground">Verified by: {tx.verified_name}</div>
                            )}
                          </div>
                          <div className="text-right sm:text-right">
                            {showMoney ? (
                              <>
                                <p
                                  className={cn(
                                    'font-semibold',
                                    tx.type === 'deposit' ? 'text-success' : 'text-foreground'
                                  )}
                                >
                                  {tx.type === 'adjustment'
                                    ? `${tx.amount < 0 ? '-' : '+'} ${formatCurrency(Math.abs(tx.amount))}`
                                    : `${tx.type === 'deposit' || tx.type === 'reversal' ? '+' : '-'} ${formatCurrency(tx.amount)}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  balance {formatCurrency(tx.running_balance)}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm text-muted-foreground">Hidden</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AccountVerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title={pendingAction.type === 'deposit' ? 'Confirm Deposit' : 'Confirm Payment'}
        description={
          pendingAction.type === 'deposit' ? (
            <span>
              You are about to deposit{' '}
              <strong>{formatCurrency(parseFloat(depositAmount) || 0)}</strong> into{' '}
              <strong>{clientName}</strong>&apos;s account.
            </span>
          ) : (
            <span>
              You are about to apply {formatCurrency(pendingAction.allocations.reduce((s, a) => s + a.amount, 0))}{' '}
              from <strong>{clientName}</strong>&apos;s account balance to{' '}
              {pendingAction.allocations.length} invoice(s).
            </span>
          )
        }
        confirmLabel={pendingAction.type === 'deposit' ? 'Record Deposit' : 'Record Payment'}
        passwordLabel="Password"
        passwordPlaceholder="Enter your login password"
        banner={
          <>
            <strong>Protected action:</strong> Enter your login password to record this transaction on
            the client account. This is the same password you use to sign in.
          </>
        }
        onConfirm={handleVerified}
      />
    </div>
  )
}
