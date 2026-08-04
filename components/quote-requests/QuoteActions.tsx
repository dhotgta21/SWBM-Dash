// components/quote-requests/QuoteActions.tsx
// Status + lifecycle buttons on a quote request detail page.
//
//   - Mark Reviewed: status → reviewed (visible to staff that this
//     has been picked up, doesn't lock anything).
//   - Reject: status → rejected (terminal, blocks conversion).
//   - Cancel: status → cancelled (terminal).
//   - Convert to Quotation: creates a real invoice in the invoices
//     table with the line items + current suggested prices, links
//     the new invoice id back to this request, and flips status to
//     'invoiced'. Redirects to the new invoice.
//
// All four are disabled while a transition is pending so the admin
// can't double-click.

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Eye,
  XCircle,
  Ban,
  FileText,
  CheckCircle2,
} from 'lucide-react'
import {
  updateQuoteRequestStatus,
  convertQuoteRequestToInvoice,
} from '@/lib/actions/admin-quote-requests'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface QuoteActionsProps {
  requestId: string
  status: string
  createdInvoiceId: string | null
  canReview: boolean
  canConvert: boolean
}

export function QuoteActions({ requestId, status, createdInvoiceId, canReview, canConvert }: QuoteActionsProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function transitionTo(next: 'reviewed' | 'rejected' | 'cancelled') {
    setError(null)
    startTransition(async () => {
      const result = await updateQuoteRequestStatus(requestId, next)
      if (!result.ok) {
        setError(result.error ?? 'Could not update the request.')
      } else {
        router.refresh()
      }
    })
  }

  function convert() {
    setError(null)
    startTransition(async () => {
      const result = await convertQuoteRequestToInvoice(requestId)
      if (result && 'error' in result) {
        setError(result.error)
      }
      // Success path redirects server-side — no client handler needed.
    })
  }

  const isInvoiced = status === 'invoiced'
  const isTerminal = isInvoiced || status === 'rejected' || status === 'cancelled'

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isInvoiced && !isTerminal && canConvert && (
          <Button
            onClick={convert}
            disabled={pending}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Convert to quotation
          </Button>
        )}

        {isInvoiced && createdInvoiceId && (
          <span className="inline-flex items-center gap-2 rounded-md bg-success-muted px-3 py-2 text-sm font-semibold text-success">
            <CheckCircle2 className="h-4 w-4" />
            Invoiced
          </span>
        )}

        {!isTerminal && status !== 'reviewed' && canReview && (
          <Button
            variant="outline"
            onClick={() => transitionTo('reviewed')}
            disabled={pending}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Mark reviewed
          </Button>
        )}

        {!isTerminal && status !== 'rejected' && canReview && (
          <Button
            variant="outline"
            onClick={() => transitionTo('rejected')}
            disabled={pending}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        )}

        {!isTerminal && status !== 'cancelled' && canReview && (
          <Button
            variant="outline"
            onClick={() => transitionTo('cancelled')}
            disabled={pending}
            className="gap-2"
          >
            <Ban className="h-4 w-4" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
