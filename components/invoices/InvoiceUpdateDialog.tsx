'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getInvoiceByNumber, updateInvoiceStatus } from '@/lib/actions/invoices'
import { createPayment } from '@/lib/actions/payments'
import { getSelectableStatuses } from '@/lib/invoice-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate, formatDateInput, PAYMENT_STATUS_STYLES } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { FileText, Loader2, Search, X } from 'lucide-react'
import { PaymentRecorder } from './PaymentRecorder'
import { PaymentHistory } from './PaymentHistory'
import {
  AccountVerificationDialog,
  type AccountVerificationData,
} from '@/components/clients/AccountVerificationDialog'

interface Payment {
  id: string
  amount: number
  payment_date: string
  method: string
  reference: string | null
  notes: string | null
}

interface InvoiceResult {
  id: string
  type: 'invoice' | 'quotation'
  document_number: string
  status: string
  issue_date: string
  due_date: string | null
  expiry_date: string | null
  total: number
  amount_paid: number
  balance_due: number
  payments: Payment[] | null
  clients:
    | {
        id: string
        first_name: string | null
        last_name: string | null
        company_name: string | null
      }
    | {
        id: string
        first_name: string | null
        last_name: string | null
        company_name: string | null
      }[]
    | null
}

function clientName(
  client: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined
) {
  return (
    client?.company_name ||
    `${client?.first_name || ''} ${client?.last_name || ''}`.trim() ||
    'Unknown'
  )
}

interface InvoiceUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canRecordPayment?: boolean
  canDeletePayment?: boolean
}

export function InvoiceUpdateDialog({
  open,
  onOpenChange,
  canRecordPayment = false,
  canDeletePayment = false,
}: InvoiceUpdateDialogProps) {
  const [query, setQuery] = useState('')
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [pendingPaid, setPendingPaid] = useState(false)
  const [showMoney, setShowMoney] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [isSearching, startSearch] = useTransition()
  const [isUpdating, startUpdate] = useTransition()

  function resetState() {
    setQuery('')
    setInvoice(null)
    setSelectedStatus('')
    setSearchError(null)
    setUpdateError(null)
    setUpdateSuccess(false)
    setPaymentSuccess(false)
    setPendingPaid(false)
    setShowMoney(false)
    setVerifyOpen(false)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchError(null)
    setUpdateError(null)
    setUpdateSuccess(false)
    setPaymentSuccess(false)
    setInvoice(null)
    setSelectedStatus('')

    if (!query.trim()) {
      setSearchError('Please enter a document number')
      return
    }

    startSearch(async () => {
      const result = await getInvoiceByNumber(query)
      if (result.error) {
        setSearchError(result.error)
      } else if (result.invoice) {
        const loaded = result.invoice as InvoiceResult
        setInvoice(loaded)
        setSelectedStatus(loaded.status.toLowerCase())
        setShowMoney(result.showMoney === true)
      }
    })
  }

  async function refreshInvoice() {
    if (!invoice) return
    const result = await getInvoiceByNumber(invoice.document_number)
    if (result.invoice) {
      const refreshed = result.invoice as InvoiceResult
      setInvoice(refreshed)
      setSelectedStatus(refreshed.status.toLowerCase())
      setShowMoney(result.showMoney === true)
    }
  }

  function handleStatusChange(newStatus: string) {
    if (!invoice || newStatus === invoice.status.toLowerCase()) return

    setSelectedStatus(newStatus)
    setPendingPaid(false)
    setUpdateError(null)
    setUpdateSuccess(false)
    setPaymentSuccess(false)

    if (newStatus === 'paid' && invoice.balance_due > 0 && showMoney) {
      setPendingPaid(true)
      return
    }

    if (newStatus === 'paid' && !showMoney) {
      // Money-restricted staff see balance_due redacted to 0, so the
      // paid transition above can never trigger — don't attempt it.
      setUpdateError('Only users with money access can mark invoices as paid.')
      return
    }

    if (newStatus === 'partial') {
      // Show the payment form; the status will flip to partial once a
      // payment is recorded (the DB trigger handles it).
      return
    }

    startUpdate(async () => {
      const result = await updateInvoiceStatus(invoice.id, newStatus)
      if (result.error) {
        setUpdateError(result.error)
      } else if (result.invoice) {
        const updatedStatus = result.invoice.status
        setInvoice((prev) =>
          prev
            ? {
                ...prev,
                status: updatedStatus || prev.status,
              }
            : null
        )
        setSelectedStatus(updatedStatus.toLowerCase())
        setUpdateSuccess(true)
      }
    })
  }

  function handlePaymentRecorded() {
    setPaymentSuccess(true)
    setUpdateError(null)
    refreshInvoice()
  }

  function handlePaymentDeleted() {
    setPaymentSuccess(true)
    refreshInvoice()
  }

  // "Mark as paid" records a full-balance payment, so it must go through the
  // Login-password re-verification (same as sign-in) as every other direct
  // payment. Step one opens the confirmation dialog; the actual write happens
  // in handleVerifiedPaid after the server checks the login password.
  function confirmPaid() {
    if (!invoice || invoice.balance_due <= 0) return
    setUpdateError(null)
    setUpdateSuccess(false)
    setPaymentSuccess(false)
    setVerifyOpen(true)
  }

  async function handleVerifiedPaid(data: AccountVerificationData) {
    if (!invoice) return { error: 'No invoice selected.' }
    const result = await createPayment({
      invoice_id: invoice.id,
      amount: invoice.balance_due,
      payment_date: formatDateInput(),
      method: 'bank_transfer',
      notes: 'Marked as paid',
      verified_name: data.verifiedName,
      confirm_password: data.password,
    })
    if (result.error) {
      return { error: result.error }
    }
    setVerifyOpen(false)
    setPendingPaid(false)
    await refreshInvoice()
    setPaymentSuccess(true)
    return {}
  }

  function cancelPaid() {
    setPendingPaid(false)
    if (invoice) {
      setSelectedStatus(invoice.status.toLowerCase())
    }
  }

  function handleClose() {
    handleOpenChange(false)
  }

  const statusOptions = invoice
    ? getSelectableStatuses(invoice.type, invoice.status.toLowerCase())
    : []

  const showPayments = invoice?.type === 'invoice'
  const payments = invoice?.payments ?? []
  const showRecordPayment =
    canRecordPayment &&
    showMoney &&
    selectedStatus === 'partial' &&
    invoice &&
    invoice.balance_due > 0
  const showPaymentHistory = showMoney && payments.length > 0
  const invoiceClient = invoice
    ? Array.isArray(invoice.clients)
      ? invoice.clients[0]
      : invoice.clients
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-red-700">Update Invoice Status</span>
          </DialogTitle>
          <DialogDescription>
            Enter a document number or paste a public share link to find the invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. INV-2026-A1, A1, or a share link"
              className="pl-9"
              disabled={isSearching}
            />
          </div>
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
          </Button>
        </form>

        {searchError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {searchError}
          </div>
        )}

        {invoice && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-semibold text-red-700 hover:underline flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    {invoice.document_number}
                  </Link>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">({invoice.type})</p>
                </div>
                {(() => {
                  const client = Array.isArray(invoice.clients)
                    ? invoice.clients[0]
                    : invoice.clients
                  return (
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{clientName(client)}</p>
                      <p className="text-xs text-gray-500">{formatDate(invoice.issue_date)}</p>
                    </div>
                  )
                })()}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-semibold text-gray-900">{showMoney ? formatCurrency(invoice.total) : '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Paid</p>
                  <p className="font-semibold text-green-600">{showMoney ? formatCurrency(invoice.amount_paid) : '—'}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Balance</p>
                  <p
                    className={cn(
                      'font-semibold',
                      invoice.balance_due > 0 ? 'text-red-600' : 'text-green-600'
                    )}
                  >
                    {showMoney ? formatCurrency(invoice.balance_due) : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-gray-100">
                <label htmlFor="status-select" className="text-sm font-medium text-gray-700">
                  Status
                </label>
                <div className="relative flex-1">
                  <Select
                    id="status-select"
                    value={selectedStatus}
                    onChange={handleStatusChange}
                    disabled={isUpdating || statusOptions.length <= 1}
                    options={statusOptions.map((option) => ({
                      value: option,
                      label: option.charAt(0).toUpperCase() + option.slice(1),
                    }))}
                    className={cn(
                      'capitalize font-medium',
                      PAYMENT_STATUS_STYLES[selectedStatus as keyof typeof PAYMENT_STATUS_STYLES]
                    )}
                  />
                  {isUpdating && (
                    <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-current opacity-70" />
                  )}
                </div>
              </div>

              {pendingPaid && invoice && (
                <div className="rounded-lg bg-warning-muted p-3 text-sm text-warning space-y-3">
                  <p>
                    This will record a payment of{' '}
                    <strong>{showMoney ? formatCurrency(invoice.balance_due) : 'the outstanding balance'}</strong>{' '}
                    and mark the invoice as paid. You&apos;ll be asked to confirm with your
                    login password.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={confirmPaid} disabled={isUpdating}>
                      {isUpdating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Yes, mark as paid'
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelPaid}
                      disabled={isUpdating}
                    >
                      No, cancel
                    </Button>
                  </div>
                </div>
              )}

              {showPayments && (showRecordPayment || showPaymentHistory) && (
                <div className="space-y-4 pt-2 border-t border-gray-100">
                  {showRecordPayment && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900">Record Payment</h4>
                      <PaymentRecorder
                        invoiceId={invoice.id}
                        documentNumber={invoice.document_number}
                        balanceDue={invoice.balance_due}
                        clientId={invoiceClient?.id}
                        clientName={clientName(invoiceClient)}
                        onRecorded={handlePaymentRecorded}
                      />
                    </div>
                  )}

                  {showPaymentHistory && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900">Payment History</h4>
                      <PaymentHistory
                        payments={payments}
                        invoiceId={invoice.id}
                        canDelete={canDeletePayment}
                        onDeleted={handlePaymentDeleted}
                      />
                    </div>
                  )}
                </div>
              )}

              {updateError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                  <X className="w-4 h-4 mt-0.5 shrink-0" />
                  {updateError}
                </div>
              )}

              {updateSuccess && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  Status updated successfully.
                </div>
              )}

              {paymentSuccess && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                  Payment updated successfully.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {invoice && (
          <AccountVerificationDialog
            open={verifyOpen}
            onOpenChange={setVerifyOpen}
            title="Confirm mark as paid"
            description={
              <span>
                Record a payment of{' '}
                <strong>
                  {showMoney ? formatCurrency(invoice.balance_due) : 'the outstanding balance'}
                </strong>{' '}
                and mark invoice <strong>{invoice.document_number}</strong> as paid?
              </span>
            }
            confirmLabel="Mark as paid"
            passwordLabel="Password"
            passwordPlaceholder="Enter your login password"
            banner={
              <>
                <strong>Protected action:</strong> Enter your login password to record this payment.
                This is the same password you use to sign in.
              </>
            }
            onConfirm={handleVerifiedPaid}
          />
        )}

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
