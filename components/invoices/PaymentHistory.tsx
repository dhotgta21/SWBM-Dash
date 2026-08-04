'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { deletePayment } from '@/lib/actions/payments'

interface Payment {
  id: string
  amount: number
  payment_date: string
  method: string
  reference: string | null
  notes: string | null
  source?: string | null
}

interface PaymentHistoryProps {
  payments: Payment[]
  invoiceId: string
  canDelete?: boolean
  onDeleted?: () => void
}

export function PaymentHistory({ payments, invoiceId, canDelete = false, onDeleted }: PaymentHistoryProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)

  async function handleConfirmDelete(password: string) {
    if (!deletingId) return { error: 'No payment selected' }
    setIsPending(true)
    const result = await deletePayment(deletingId, invoiceId, password)
    setIsPending(false)
    if (result?.error) {
      return { error: result.error }
    }
    setDialogOpen(false)
    setDeletingId(null)
    router.refresh()
    onDeleted?.()
  }

  if (payments.length === 0) {
    return <div className="text-sm text-gray-500">No payments recorded yet.</div>
  }

  return (
    <div className="space-y-3">
      {payments.map((payment) => (
        <div key={payment.id} className="flex justify-between items-start gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900">{formatCurrency(payment.amount)}</p>
            <p className="text-xs text-gray-500 capitalize">
              {payment.source === 'client_account'
                ? 'Client account'
                : payment.method.replace(/_/g, ' ')}
            </p>
            {payment.reference && <p className="text-xs text-gray-500">Ref: {payment.reference}</p>}
            {payment.notes && <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">{formatDate(payment.payment_date)}</div>
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-9 w-9 p-0"
                onClick={() => {
                  setDeletingId(payment.id)
                  setDialogOpen(true)
                }}
                disabled={isPending}
                aria-label="Delete payment"
              >
                {deletingId === payment.id && isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      ))}

      <DeletionPasswordDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setDeletingId(null)
        }}
        title="Delete payment?"
        description={
          <>
            This hides the payment record. It can be restored by restoring the
            parent invoice from <strong>Recently deleted</strong>.
          </>
        }
        confirmLabel="Delete payment"
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
