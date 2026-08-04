'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileText, Truck, Loader2 } from 'lucide-react'
import { type PrintDocumentType } from '@/components/invoices/PrintOptionsDialog'
import { SelectableOptionCard } from '@/components/invoices/SelectableOptionCard'

interface DocumentTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** "Invoice" or "Quotation" — drives the label of the invoice/quotation tile. */
  documentTypeLabel: string
  /** Dialog title, e.g. "Download document" / "Preview document". */
  title: string
  /** Short helper under the title. */
  description?: string
  /** Label of the primary CTA button, e.g. "Download" / "Open preview". */
  actionLabel: string
  /** Icon shown next to the CTA. */
  ActionIcon: React.ComponentType<{ className?: string }>
  /** Fires when the user picks a document type. */
  onConfirm: (mode: PrintDocumentType) => Promise<void> | void
  loading?: boolean
  defaultMode?: PrintDocumentType
}

/**
 * Modal that asks the user which document they want to act on
 * (the invoice/quotation itself, or the delivery / picker note)
 * before running Download / Preview / etc.
 *
 * Mirrors the visual pattern of PrintOptionsDialog so the three
 * document-type pickers in this section look and behave the same.
 */
export function DocumentTypeDialog({
  open,
  onOpenChange,
  documentTypeLabel,
  title,
  description,
  actionLabel,
  ActionIcon,
  onConfirm,
  loading = false,
  defaultMode = 'invoice',
}: DocumentTypeDialogProps) {
  const [mode, setMode] = useState<PrintDocumentType>(defaultMode)

  const isInvoicePicked = mode === 'invoice'

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogContent key={open ? 'open' : 'closed'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogClose onClick={() => onOpenChange(false)} />

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SelectableOptionCard
              icon={FileText}
              title={documentTypeLabel}
              description="Full document with totals"
              selected={isInvoicePicked}
              onClick={() => setMode('invoice')}
              disabled={loading}
            />
            <SelectableOptionCard
              icon={Truck}
              title="Delivery / Picker Note"
              description="Items only, no totals"
              selected={!isInvoicePicked}
              onClick={() => setMode('delivery-note')}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onConfirm(mode)}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ActionIcon className="w-4 h-4" />
              )}
              {loading ? 'Preparing…' : actionLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}