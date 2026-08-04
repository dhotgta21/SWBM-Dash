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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Printer, Loader2, FileText, Truck } from 'lucide-react'
import { SelectableOptionCard } from '@/components/invoices/SelectableOptionCard'

export type PrintDocumentType = 'invoice' | 'delivery-note'

interface PrintOptionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentTypeLabel: string
  defaultDocumentType?: PrintDocumentType
  onPrint: (options: {
    mode: PrintDocumentType
    copies: number
  }) => Promise<void>
  loading?: boolean
}

export function PrintOptionsDialog({
  open,
  onOpenChange,
  documentTypeLabel,
  defaultDocumentType = 'invoice',
  onPrint,
  loading = false,
}: PrintOptionsDialogProps) {
  const [mode, setMode] = useState<PrintDocumentType>(defaultDocumentType)
  const [copies, setCopies] = useState(1)

  const invoiceLabel = documentTypeLabel === 'Quotation' ? 'Quotation' : 'Invoice'

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogContent key={open ? 'open' : 'closed'}>
        <DialogHeader>
          <DialogTitle>Print options</DialogTitle>
          <DialogDescription>Choose what to print and how many copies.</DialogDescription>
        </DialogHeader>
        <DialogClose onClick={() => onOpenChange(false)} />

        <div className="space-y-5">
          {/* Document type */}
          <div className="space-y-2">
            <Label>Document</Label>
            <div className="grid grid-cols-2 gap-3">
              <SelectableOptionCard
                icon={FileText}
                title={invoiceLabel}
                description="Full document with totals"
                selected={mode === 'invoice'}
                onClick={() => setMode('invoice')}
                disabled={loading}
              />
              <SelectableOptionCard
                icon={Truck}
                title="Delivery / Picker Note"
                description="Items only, no totals"
                selected={mode === 'delivery-note'}
                onClick={() => setMode('delivery-note')}
                disabled={loading}
              />
            </div>
          </div>

          {/* Copies */}
          <div className="space-y-2">
            <Label htmlFor="print-copies">Copies</Label>
            <Input
              id="print-copies"
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) => {
                const n = Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1)))
                setCopies(n)
              }}
              className="w-24"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void onPrint({ mode, copies })}
              disabled={loading}
              className="gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {loading ? 'Preparing…' : 'Print'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
