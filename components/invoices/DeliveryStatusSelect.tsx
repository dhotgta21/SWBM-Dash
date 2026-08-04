'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { updateDeliveryStatus, type DeliveryStatusTarget } from '@/lib/actions/delivery'
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_STYLES,
  cn,
  type DeliveryStatus,
} from '@/lib/utils'

// The single legal next step from each state, per document type. Movement
// is strictly forward — once advanced, a status can never be changed back.
const NEXT_STEP: Record<
  'invoice' | 'quotation',
  Partial<Record<DeliveryStatus, DeliveryStatusTarget>>
> = {
  invoice: { draft: 'created', created: 'delivered' },
  quotation: { draft: 'created', created: 'converted' },
}

// The dropdown option labels the ACTION, not the state, when the step does
// something beyond a simple status change.
const ACTION_LABELS: Partial<Record<DeliveryStatusTarget, string>> = {
  converted: 'Convert to invoice',
}

interface DeliveryStatusSelectProps {
  invoiceId: string
  documentNumber: string
  documentType?: 'invoice' | 'quotation'
  current: DeliveryStatus
  canChange: boolean
  canConvert?: boolean
  // Mobile rows are wrapped in a Link — set this so opening the dropdown
  // or the confirm dialog doesn't navigate to the invoice.
  preventRowNavigation?: boolean
}

export function DeliveryStatusSelect({
  invoiceId,
  documentNumber,
  documentType = 'invoice',
  current,
  canChange,
  canConvert = false,
  preventRowNavigation = false,
}: DeliveryStatusSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmTarget, setConfirmTarget] = useState<DeliveryStatusTarget | null>(null)

  const nextStep = NEXT_STEP[documentType][current]
  // Each step is gated by its own permission: issuing/advancing needs
  // change-status; converting a quote needs convert-quote.
  const allowed = nextStep === 'converted' ? canConvert : canChange
  const interactive = Boolean(nextStep && allowed)

  const stopNav = (e: React.SyntheticEvent) => {
    if (preventRowNavigation) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleConfirm = () => {
    if (!confirmTarget) return
    const target = confirmTarget
    startTransition(async () => {
      const result = await updateDeliveryStatus(invoiceId, target)
      setConfirmTarget(null)
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (target === 'converted' && result.invoice) {
        toast.success(`${documentNumber} converted to invoice ${result.invoice.document_number}.`)
      } else {
        toast.success(`${documentNumber} marked as ${DELIVERY_STATUS_LABELS[target]}.`)
      }
      router.refresh()
    })
  }

  return (
    <div className="inline-flex" onClick={stopNav}>
      {interactive && nextStep ? (
        <div className="relative inline-flex items-center">
          {/* Visible pill shows the CURRENT status. The transparent select
              overlaid on top opens a menu listing ONLY the next step — the
              current status is never a selectable option. */}
          <span
            className={cn(
              'inline-flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium',
              DELIVERY_STATUS_STYLES[current],
              isPending && 'opacity-60'
            )}
          >
            {DELIVERY_STATUS_LABELS[current]}
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            )}
          </span>
          <select
            value=""
            disabled={isPending}
            onChange={(e) => {
              const target = e.target.value as DeliveryStatusTarget
              if (target) setConfirmTarget(target)
            }}
            className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-wait"
            aria-label={`Change delivery status for ${documentNumber}`}
          >
            <option value="" disabled hidden />
            <option value={nextStep}>
              {ACTION_LABELS[nextStep] ?? DELIVERY_STATUS_LABELS[nextStep]}
            </option>
          </select>
        </div>
      ) : (
        <span
          className={cn(
            'inline-flex px-2 py-1 rounded-full text-xs font-medium',
            DELIVERY_STATUS_STYLES[current]
          )}
        >
          {DELIVERY_STATUS_LABELS[current]}
        </span>
      )}

      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setConfirmTarget(null)
        }}
        className="max-w-md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmTarget === 'converted' ? 'Convert to invoice?' : 'Change delivery status?'}
            </DialogTitle>
            <DialogDescription>
              {confirmTarget === 'converted' ? (
                <>
                  You are about to convert <strong>{documentNumber}</strong> into a new
                  invoice. The quote will be marked as converted.
                </>
              ) : (
                confirmTarget && (
                  <>
                    You are about to change <strong>{documentNumber}</strong> from{' '}
                    <strong>{DELIVERY_STATUS_LABELS[current]}</strong> to{' '}
                    <strong>{DELIVERY_STATUS_LABELS[confirmTarget]}</strong>.
                  </>
                )
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone — statuses only move forward.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setConfirmTarget(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending
                ? 'Updating…'
                : confirmTarget === 'converted'
                  ? 'Yes, convert'
                  : 'Yes, change status'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
