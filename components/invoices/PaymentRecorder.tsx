'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, CreditCard, AlertTriangle } from 'lucide-react'
import { createPayment } from '@/lib/actions/payments'
import { applyClientAccountBalance } from '@/lib/actions/client-account'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn, formatCurrency, formatDateInput } from '@/lib/utils'
import {
  AccountVerificationDialog,
  type AccountVerificationData,
} from '@/components/clients/AccountVerificationDialog'

type PaymentMode = 'account' | 'direct'
type DirectMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'

interface PaymentRecorderProps {
  invoiceId: string
  balanceDue: number
  /** Used in the confirmation copy. Falls back to the invoice id when omitted. */
  documentNumber?: string
  /** Wallet (pay-from-account) mode — disabled when these are omitted. */
  clientId?: string
  clientName?: string
  accountBalance?: number
  /** Staff may pay from the client wallet (clients_manage_account + see money, or admin). */
  canPayFromAccount?: boolean
  onRecorded?: () => void
}

const METHOD_OPTIONS: { value: DirectMethod; label: string }[] = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'ecod', label: 'e-COD (Cash on Delivery)' },
  { value: 'other', label: 'Other' },
]

const METHOD_LABEL: Record<DirectMethod, string> = {
  bank_transfer: 'bank transfer',
  cash: 'cash',
  card: 'card',
  cheque: 'cheque',
  ecod: 'e-COD',
  other: 'other',
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function PaymentRecorder({
  invoiceId,
  balanceDue,
  documentNumber,
  clientId,
  clientName,
  accountBalance = 0,
  canPayFromAccount = false,
  onRecorded,
}: PaymentRecorderProps) {
  const safeDocumentNumber = documentNumber || invoiceId
  const safeClientName = clientName || 'this client'
  const router = useRouter()

  const walletAvailable = canPayFromAccount && accountBalance > 0
  const [mode, setMode] = useState<PaymentMode>(walletAvailable ? 'account' : 'direct')

  const accountMax = useMemo(
    () => roundMoney(Math.min(balanceDue, Math.max(0, accountBalance))),
    [balanceDue, accountBalance]
  )

  const [amount, setAmount] = useState(
    (walletAvailable ? accountMax : balanceDue).toFixed(2)
  )
  const [paymentDate, setPaymentDate] = useState(formatDateInput())
  const [method, setMethod] = useState<DirectMethod>('bank_transfer')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numericAmount = parseFloat(amount) || 0
  const maxAmount = mode === 'account' ? accountMax : balanceDue
  const remainingAfter = roundMoney(accountBalance - numericAmount)

  function switchMode(next: PaymentMode) {
    setMode(next)
    setError(null)
    if (next === 'account') {
      setAmount(accountMax.toFixed(2))
    } else {
      setAmount(balanceDue.toFixed(2))
    }
  }

  function openVerification(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Payment amount must be greater than zero.')
      return
    }
    if (numericAmount > balanceDue) {
      setError(`Amount exceeds the invoice balance of ${formatCurrency(balanceDue)}.`)
      return
    }
    if (mode === 'account') {
      if (accountBalance <= 0) {
        setError('Transaction unsuccessful — there is no money in this client account.')
        return
      }
      if (numericAmount > accountBalance) {
        setError(
          `Transaction unsuccessful due to insufficient amount of money. Available balance: ${formatCurrency(accountBalance)}.`
        )
        return
      }
    }
    setVerifyOpen(true)
  }

  async function handleVerified(data: AccountVerificationData) {
    setLoading(true)
    setError(null)

    if (mode === 'account') {
      if (!clientId) {
        setLoading(false)
        return { error: 'Client account is not available for this invoice.' }
      }
      const result = await applyClientAccountBalance({
        client_id: clientId,
        allocations: [{ invoice_id: invoiceId, amount: numericAmount }],
        notes: notes.trim() || `Payment towards invoice ${safeDocumentNumber}`,
        verified_name: data.verifiedName,
        confirm_password: data.password,
      })
      setLoading(false)
      if (result.error) return { error: result.error }
    } else {
      const result = await createPayment({
        invoice_id: invoiceId,
        amount: numericAmount,
        payment_date: paymentDate,
        method,
        reference,
        notes,
        verified_name: data.verifiedName,
        confirm_password: data.password,
      })
      setLoading(false)
      if (result.error) return { error: result.error }
    }

    setVerifyOpen(false)
    setReference('')
    setNotes('')
    router.refresh()
    onRecorded?.()
    return {}
  }

  if (balanceDue <= 0) {
    return (
      <div className="text-center py-4 text-green-600 font-medium">
        This invoice is fully paid.
      </div>
    )
  }

  const dialogTitle = mode === 'account' ? 'Pay from client account' : 'Confirm payment'
  const dialogDescription =
    mode === 'account' ? (
      <span>
        Are you sure you want to pay{' '}
        <strong>{formatCurrency(numericAmount)}</strong> from{' '}
        <strong>{safeClientName}</strong>&apos;s account balance towards invoice{' '}
        <strong>{safeDocumentNumber}</strong>?
      </span>
    ) : (
      <span>
        Are you sure you want to record a{' '}
        <strong>{formatCurrency(numericAmount)}</strong> payment by{' '}
        <strong>{METHOD_LABEL[method]}</strong> for invoice{' '}
        <strong>{safeDocumentNumber}</strong>?
      </span>
    )

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Payment source toggle — wallet is the default when available. */}
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => walletAvailable && switchMode('account')}
          disabled={!walletAvailable}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            mode === 'account'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
            !walletAvailable && 'opacity-50 cursor-not-allowed'
          )}
          title={
            walletAvailable
              ? 'Deduct from the client prepaid balance'
              : canPayFromAccount
                ? 'No balance available on this account'
                : 'You are not allowed to manage client accounts'
          }
        >
          <Wallet className="h-4 w-4" />
          From client account
        </button>
        <button
          type="button"
          onClick={() => switchMode('direct')}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            mode === 'direct'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          <CreditCard className="h-4 w-4" />
          Direct payment
        </button>
      </div>

      {mode === 'account' && (
        <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Available balance</span>
            <span className="font-semibold text-foreground">{formatCurrency(accountBalance)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">After this payment</span>
            <span
              className={cn(
                'font-semibold',
                remainingAfter >= 0 ? 'text-success' : 'text-destructive'
              )}
            >
              {formatCurrency(Math.max(0, remainingAfter))}
            </span>
          </div>
        </div>
      )}

      <form onSubmit={openVerification} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={maxAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          {mode === 'direct' ? (
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date *</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="account-method">Method</Label>
              <Input id="account-method" value="Client account" disabled />
            </div>
          )}
        </div>

        {mode === 'direct' && (
          <div className="space-y-2">
            <Label htmlFor="method">Method *</Label>
            <Select
              id="method"
              value={method}
              onChange={(value) => setMethod(value as DirectMethod)}
              options={METHOD_OPTIONS}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="reference">Reference</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={mode === 'account' ? 'Optional note' : 'e.g. Transaction ID'}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="paymentNotes">Notes</Label>
          <textarea
            id="paymentNotes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <Button type="submit" disabled={loading || (mode === 'account' && !walletAvailable)}>
          {mode === 'account' ? (
            <>
              <Wallet className="w-4 h-4 mr-2" />
              Pay from account
            </>
          ) : (
            'Record Payment'
          )}
        </Button>
      </form>

      <AccountVerificationDialog
        key={mode}
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title={dialogTitle}
        description={dialogDescription}
        confirmLabel={mode === 'account' ? 'Pay from account' : 'Record Payment'}
        prefillName={false}
        nameLabel={mode === 'account' ? 'Username' : undefined}
        nameHelpText={
          mode === 'account' ? (
            <>
              Enter your username — your account name with an underscore wherever you would normally put a space
              (e.g. <span className="font-mono">Andrew_Smith</span>). It must match your account name.
            </>
          ) : undefined
        }
        passwordLabel={
          mode === 'account' ? 'Client account password' : 'Payment password'
        }
        passwordPlaceholder={
          mode === 'account'
            ? 'Enter your client account password'
            : 'Enter your payment password'
        }
        banner={
          mode === 'account' ? (
            <>
              <strong>Protected action:</strong> Enter your username and your client account password to pay from this
              client account. This is separate from your login password and payment password. Manage it in Settings →
              Security → Client Account.
            </>
          ) : (
            <>
              <strong>Protected action:</strong> Enter your payment password and name to record this payment. This is
              not your login password — set or change it in Settings → Security → Payments.
            </>
          )
        }
        onConfirm={handleVerified}
      />
    </div>
  )
}
