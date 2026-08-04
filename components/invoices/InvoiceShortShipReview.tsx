'use client'

// Invoice-page warning shown when the picker short-shipped the order
// (marked items out of stock). Payment is blocked server-side until office
// staff resolves the review here.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { resolveInvoiceStockReviews, type InvoiceStockReview } from '@/lib/actions/picker'

export function InvoiceShortShipReview({
  invoiceId,
  reviews,
  canResolve,
}: {
  invoiceId: string
  reviews: InvoiceStockReview[]
  canResolve: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [resolving, setResolving] = useState(false)

  if (!reviews || reviews.length === 0) return null

  function handleResolve() {
    setResolving(true)
    startTransition(async () => {
      const { error } = await resolveInvoiceStockReviews(invoiceId)
      setResolving(false)
      if (error) {
        toast.error(error)
        return
      }
      toast.success('Review resolved — payment is unblocked')
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h2 className="font-semibold">
          Review required — {reviews.length} {reviews.length === 1 ? 'item' : 'items'} short-shipped
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        The picker marked items on this order as out of stock. Payments are blocked on this
        invoice until the shortage is reviewed and resolved.
      </p>
      <ul className="space-y-1.5">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="font-medium text-foreground truncate">{review.productName}</span>
            <span className="shrink-0 text-destructive tabular-nums">
              {review.quantityNeeded != null ? `${review.quantityNeeded} missing` : 'Out of stock'}
            </span>
          </li>
        ))}
      </ul>
      {canResolve && (
        <div className="flex justify-end">
          <Button onClick={handleResolve} disabled={isPending || resolving}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {resolving ? 'Resolving…' : 'Resolve review'}
          </Button>
        </div>
      )}
    </div>
  )
}
