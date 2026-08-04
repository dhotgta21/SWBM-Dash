'use client'

// Move a load line (or part of it) to another printed load on the same
// order, or into a brand-new load. Remounted per item (parent passes
// key={item.id}) so the local state always starts fresh.

import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { moveLoadItems, type InvoiceLoadDetail } from '@/lib/actions/picker'

type LoadItemRow = InvoiceLoadDetail['items'][number]

interface MoveLoadItemDialogProps {
  sourceLoad: InvoiceLoadDetail
  item: LoadItemRow
  /** Other printed loads on the same order that can receive the items. */
  otherLoads: InvoiceLoadDetail[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function MoveLoadItemDialog({
  sourceLoad,
  item,
  otherLoads,
  open,
  onOpenChange,
  onSaved,
}: MoveLoadItemDialogProps) {
  const [qty, setQty] = useState(item.quantity)
  const [target, setTarget] = useState(otherLoads[0]?.id ?? 'new')
  const [saving, setSaving] = useState(false)

  async function handleMove() {
    const moveQty = Math.min(Math.max(0, qty), item.quantity)
    if (moveQty <= 0) {
      toast.error('Enter a quantity to move')
      return
    }

    setSaving(true)
    const result = await moveLoadItems(
      sourceLoad.id,
      item.id,
      moveQty,
      target === 'new' ? { newLoad: true } : { loadId: target }
    )
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success('Items moved')
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move items</DialogTitle>
          <DialogDescription>
            Move {item.productName}
            {item.productCode ? ` (${item.productCode})` : ''} from load {sourceLoad.loadNumber} to
            another load on this order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="move-qty">
              Quantity to move (of {item.quantity})
            </label>
            <input
              id="move-qty"
              type="number"
              min={0}
              max={item.quantity}
              step="1"
              value={qty}
              onChange={(e) =>
                setQty(
                  Number.isFinite(Number(e.target.value))
                    ? Math.min(Math.max(0, Number(e.target.value)), item.quantity)
                    : 0
                )
              }
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="move-target">
              Move to
            </label>
            <select
              id="move-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            >
              {otherLoads.map((load) => (
                <option key={load.id} value={load.id}>
                  Load {load.loadNumber}
                </option>
              ))}
              <option value="new">New load…</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={saving}>
            <ArrowRightLeft className="h-4 w-4 mr-1.5" />
            {saving ? 'Moving…' : 'Move items'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
