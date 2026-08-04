'use client'

// Office load editor — create one or more printed loads for an invoice, or
// edit an existing printed load. Mirrors the picker's semantics (loaded qty
// clamped to remaining, OOS consumes the remainder) but as a desktop dialog
// on the invoice Loads tab.
//
// Create mode: plan Load 1 / Load 2 / … and put each line's quantity on the
// right load — same end result as the picker completing multiple split loads,
// without going round-trip for each vehicle.

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Loader2, Package, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  getInvoiceOrderLines,
  createOfficeLoad,
  createOfficeLoads,
  updateOfficeLoad,
  type InvoiceOrderLine,
  type InvoiceLoadDetail,
  type LoadItemInput,
} from '@/lib/actions/picker'

interface LoadEditorDialogProps {
  invoiceId: string
  /** When set, edits this printed load instead of creating a new one. */
  load?: InvoiceLoadDetail | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** Edit mode: single qty + OOS for the load being edited. */
interface EditLineDraft {
  qty: number
  oos: boolean
}

/** Create mode: qty on each planned load slot + one OOS flag for the line. */
interface CreateLineDraft {
  /** Quantity assigned to each planned load (index 0 = Load 1, …). */
  qtys: number[]
  oos: boolean
}

function emptyQtys(count: number): number[] {
  return Array.from({ length: count }, () => 0)
}

export function LoadEditorDialog({ invoiceId, load, open, onOpenChange, onSaved }: LoadEditorDialogProps) {
  const [lines, setLines] = useState<InvoiceOrderLine[]>([])
  const [editDraft, setEditDraft] = useState<Record<string, EditLineDraft>>({})
  const [createDraft, setCreateDraft] = useState<Record<string, CreateLineDraft>>({})
  /** How many loads to create in this plan (create mode only). */
  const [loadCount, setLoadCount] = useState(1)
  const [maxNewLoads, setMaxNewLoads] = useState(5)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const isEditing = !!load

  // Keep the latest onOpenChange without making the fetch effect depend on
  // it — parents pass inline handlers, and a re-render mid-edit must not
  // refetch and wipe the quantities being typed.
  const onOpenChangeRef = useRef(onOpenChange)
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  })

  useEffect(() => {
    if (!open) return
    let cancelled = false

    async function fetchLines() {
      setLoading(true)
      const res = await getInvoiceOrderLines(invoiceId, load?.id)
      if (cancelled) return
      setLoading(false)
      if (res.error || !res.lines) {
        toast.error(res.error || 'Could not load order lines')
        onOpenChangeRef.current(false)
        return
      }
      setLines(res.lines)
      // 0 = order already at the per-order cap (save will error); still show the form.
      setMaxNewLoads(Math.max(0, res.maxNewLoads ?? 5))

      if (load) {
        // Prefill from the load's own rows.
        const initial: Record<string, EditLineDraft> = {}
        for (const li of load.items) {
          const current = initial[li.invoiceItemId] || { qty: 0, oos: false }
          if (li.status === 'loaded') current.qty += li.quantity
          else current.oos = true
          initial[li.invoiceItemId] = current
        }
        setEditDraft(initial)
        setCreateDraft({})
        setLoadCount(1)
      } else {
        // Default: one load, full remaining qty on that load (one-click full load).
        const initial: Record<string, CreateLineDraft> = {}
        for (const line of res.lines) {
          if (line.remaining > 0) {
            initial[line.invoiceItemId] = { qtys: [line.remaining], oos: false }
          }
        }
        setCreateDraft(initial)
        setEditDraft({})
        setLoadCount(1)
      }
    }

    fetchLines()
    return () => {
      cancelled = true
    }
  }, [open, invoiceId, load])

  // When the user changes how many loads they're planning, resize each line's
  // qty array. Growing pads with 0; shrinking drops the trailing slots.
  function setPlannedLoadCount(next: number) {
    const upper = Math.max(1, maxNewLoads)
    const clamped = Math.min(Math.max(1, next), upper)
    setLoadCount(clamped)
    setCreateDraft((prev) => {
      const nextDraft: Record<string, CreateLineDraft> = {}
      for (const [id, d] of Object.entries(prev)) {
        const qtys = emptyQtys(clamped)
        for (let i = 0; i < clamped; i++) {
          qtys[i] = d.qtys[i] ?? 0
        }
        // If we reduced load count, fold any dropped trailing slots into the
        // last remaining load so quantities aren't silently lost.
        if (d.qtys.length > clamped) {
          let spilled = 0
          for (let i = clamped; i < d.qtys.length; i++) {
            spilled += d.qtys[i] || 0
          }
          if (spilled > 0) {
            qtys[clamped - 1] = (qtys[clamped - 1] || 0) + spilled
          }
        }
        nextDraft[id] = { qtys, oos: d.oos }
      }
      // Ensure every line with remaining stock has a draft row.
      for (const line of lines) {
        if (line.remaining > 0 && !nextDraft[line.invoiceItemId]) {
          nextDraft[line.invoiceItemId] = { qtys: emptyQtys(clamped), oos: false }
        }
      }
      return nextDraft
    })
  }

  function setEditQty(invoiceItemId: string, raw: number, remaining: number) {
    const qty = Number.isFinite(raw) ? Math.min(Math.max(0, raw), remaining) : 0
    setEditDraft((prev) => ({
      ...prev,
      [invoiceItemId]: { ...(prev[invoiceItemId] || { qty: 0, oos: false }), qty },
    }))
  }

  function toggleEditOos(invoiceItemId: string) {
    setEditDraft((prev) => ({
      ...prev,
      [invoiceItemId]: {
        ...(prev[invoiceItemId] || { qty: 0, oos: false }),
        oos: !(prev[invoiceItemId]?.oos),
      },
    }))
  }

  function setCreateQty(invoiceItemId: string, loadIndex: number, raw: number, remaining: number) {
    setCreateDraft((prev) => {
      const current = prev[invoiceItemId] || { qtys: emptyQtys(loadCount), oos: false }
      const qtys = [...current.qtys]
      while (qtys.length < loadCount) qtys.push(0)
      // Cap this slot so total across loads never exceeds remaining.
      const others = qtys.reduce((sum, q, i) => (i === loadIndex ? sum : sum + q), 0)
      const maxForSlot = Math.max(0, remaining - others)
      const qty = Number.isFinite(raw) ? Math.min(Math.max(0, raw), maxForSlot) : 0
      qtys[loadIndex] = qty
      return { ...prev, [invoiceItemId]: { qtys, oos: current.oos } }
    })
  }

  function toggleCreateOos(invoiceItemId: string) {
    setCreateDraft((prev) => {
      const current = prev[invoiceItemId] || { qtys: emptyQtys(loadCount), oos: false }
      return {
        ...prev,
        [invoiceItemId]: { qtys: [...current.qtys], oos: !current.oos },
      }
    })
  }

  // Lines worth showing: anything with quantity left (or already on this load).
  const visibleLines = lines.filter((line) => {
    if (line.remaining > 0) return true
    if (isEditing) return !!editDraft[line.invoiceItemId]
    return !!createDraft[line.invoiceItemId]
  })

  function buildCreateLoads(): LoadItemInput[][] | null {
    // One array of items per planned load slot.
    const planned: LoadItemInput[][] = Array.from({ length: loadCount }, () => [])

    for (const line of visibleLines) {
      const d = createDraft[line.invoiceItemId] || { qtys: emptyQtys(loadCount), oos: false }
      const qtys = [...d.qtys]
      while (qtys.length < loadCount) qtys.push(0)

      let totalLoaded = 0
      for (let i = 0; i < loadCount; i++) {
        const qty = Math.min(Math.max(0, qtys[i] || 0), line.remaining)
        totalLoaded += qty
      }
      totalLoaded = Math.min(totalLoaded, line.remaining)

      // Re-clamp if the sum somehow overshot (defensive).
      let remainingBudget = line.remaining
      const clampedQtys = qtys.slice(0, loadCount).map((q) => {
        const qty = Math.min(Math.max(0, q || 0), remainingBudget)
        remainingBudget -= qty
        return qty
      })
      totalLoaded = clampedQtys.reduce((s, q) => s + q, 0)

      // Put OOS remainder on the last load that has any loaded qty for this
      // line; if none loaded, put pure-OOS on the first planned load.
      let oosLoadIndex = -1
      if (d.oos && totalLoaded < line.remaining) {
        for (let i = loadCount - 1; i >= 0; i--) {
          if (clampedQtys[i] > 0) {
            oosLoadIndex = i
            break
          }
        }
        if (oosLoadIndex < 0) oosLoadIndex = 0
      }

      for (let i = 0; i < loadCount; i++) {
        const loadedQuantity = clampedQtys[i]
        const outOfStockRemainder = oosLoadIndex === i
        if (loadedQuantity > 0 || outOfStockRemainder) {
          planned[i].push({
            invoiceItemId: line.invoiceItemId,
            loadedQuantity,
            outOfStockRemainder,
          })
        }
      }
    }

    const nonEmpty = planned.filter((items) => items.length > 0)
    if (nonEmpty.length === 0) return null
    return nonEmpty
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (load) {
        const items = visibleLines
          .map((line) => {
            const d = editDraft[line.invoiceItemId] || { qty: 0, oos: false }
            return {
              invoiceItemId: line.invoiceItemId,
              loadedQuantity: Math.min(Math.max(0, d.qty), line.remaining),
              outOfStockRemainder: d.oos,
            }
          })
          .filter((item) => item.loadedQuantity > 0 || item.outOfStockRemainder)

        if (items.length === 0) {
          toast.error('Add at least one item to the load')
          return
        }

        const result = await updateOfficeLoad(load.id, items)
        if (result.error) {
          toast.error(result.error)
          return
        }
        toast.success(`Load ${load.loadNumber} updated`)
      } else {
        const planned = buildCreateLoads()
        if (!planned) {
          toast.error('Add at least one item to a load')
          return
        }

        if (planned.length === 1) {
          const result = await createOfficeLoad(invoiceId, planned[0])
          if (result.error) {
            toast.error(result.error)
            return
          }
          toast.success(
            result.loadNumber != null
              ? `Load ${result.loadNumber} created — visible to drivers`
              : 'Load created — visible to drivers'
          )
        } else {
          const result = await createOfficeLoads(invoiceId, planned)
          if (result.error) {
            toast.error(result.error)
            return
          }
          const nums = result.loadNumbers?.join(', ') || planned.length
          toast.success(`Loads ${nums} created — visible to drivers`)
        }
      }

      onOpenChange(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit load ${load?.loadNumber}` : 'Create load'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Fix the quantities on this load. If it is already assigned to a driver, they will see the updated contents — re-print the note if needed.'
              : 'Choose what goes on each load (Load 1, Load 2, …), same as the picker splitting an order across vehicles. Loads are printed straight away and become visible to drivers.'}
          </DialogDescription>
        </DialogHeader>

        {!isEditing && !loading && visibleLines.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">How many loads?</p>
              <p className="text-xs text-muted-foreground">
                Put quantities on Load 1, Load 2, … then save once.
                {maxNewLoads < 20 ? ` Up to ${maxNewLoads} more on this order.` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={loadCount <= 1}
                onClick={() => setPlannedLoadCount(loadCount - 1)}
                aria-label="Fewer loads"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
                {loadCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={loadCount >= Math.max(1, maxNewLoads)}
                onClick={() => setPlannedLoadCount(loadCount + 1)}
                aria-label="More loads"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : visibleLines.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Everything on this order is already accounted for on other loads.
            </p>
          </div>
        ) : isEditing ? (
          <div className="space-y-2">
            {visibleLines.map((line) => {
              const d = editDraft[line.invoiceItemId] || { qty: 0, oos: false }
              return (
                <div
                  key={line.invoiceItemId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.productCode ? `${line.productCode} · ` : ''}
                      Ordered {line.ordered} {line.unit || ''} · {line.remaining} {line.unit || ''} left
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={line.remaining}
                    step="1"
                    value={d.qty}
                    onChange={(e) => setEditQty(line.invoiceItemId, Number(e.target.value), line.remaining)}
                    className="h-10 w-24 rounded-md border border-border bg-background px-3 text-sm tabular-nums"
                    aria-label={`Quantity to load for ${line.productName}`}
                  />
                  <Button
                    type="button"
                    variant={d.oos ? 'danger' : 'outline'}
                    size="sm"
                    onClick={() => toggleEditOos(line.invoiceItemId)}
                  >
                    Out of stock
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {loadCount > 1 && (
              <div
                className="grid gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground px-1"
                style={{
                  gridTemplateColumns: `minmax(0,1fr) repeat(${loadCount}, minmax(4.5rem, 5.5rem)) auto`,
                }}
              >
                <span>Product</span>
                {Array.from({ length: loadCount }, (_, i) => (
                  <span key={i} className="text-center">
                    Load {i + 1}
                  </span>
                ))}
                <span className="text-center w-[6.5rem]">OOS</span>
              </div>
            )}
            {visibleLines.map((line) => {
              const d = createDraft[line.invoiceItemId] || {
                qtys: emptyQtys(loadCount),
                oos: false,
              }
              const qtys = [...d.qtys]
              while (qtys.length < loadCount) qtys.push(0)
              const assigned = qtys.slice(0, loadCount).reduce((s, q) => s + (q || 0), 0)
              const leftover = Math.max(0, line.remaining - assigned)

              return (
                <div
                  key={line.invoiceItemId}
                  className={
                    loadCount === 1
                      ? 'flex flex-wrap items-center gap-3 rounded-lg border border-border p-3'
                      : 'grid items-center gap-2 rounded-lg border border-border p-3'
                  }
                  style={
                    loadCount > 1
                      ? {
                          gridTemplateColumns: `minmax(0,1fr) repeat(${loadCount}, minmax(4.5rem, 5.5rem)) auto`,
                        }
                      : undefined
                  }
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{line.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.productCode ? `${line.productCode} · ` : ''}
                      Ordered {line.ordered} {line.unit || ''} · {line.remaining} {line.unit || ''} left
                      {loadCount > 1 && assigned > 0 && (
                        <span>
                          {' '}
                          · {assigned} assigned
                          {leftover > 0 ? ` · ${leftover} unassigned` : ''}
                        </span>
                      )}
                    </p>
                  </div>

                  {loadCount === 1 ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={line.remaining}
                        step="1"
                        value={qtys[0] ?? 0}
                        onChange={(e) =>
                          setCreateQty(line.invoiceItemId, 0, Number(e.target.value), line.remaining)
                        }
                        className="h-10 w-24 rounded-md border border-border bg-background px-3 text-sm tabular-nums"
                        aria-label={`Quantity on load 1 for ${line.productName}`}
                      />
                      <Button
                        type="button"
                        variant={d.oos ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => toggleCreateOos(line.invoiceItemId)}
                      >
                        Out of stock
                      </Button>
                    </>
                  ) : (
                    <>
                      {Array.from({ length: loadCount }, (_, i) => (
                        <input
                          key={i}
                          type="number"
                          min={0}
                          max={line.remaining}
                          step="1"
                          value={qtys[i] ?? 0}
                          onChange={(e) =>
                            setCreateQty(line.invoiceItemId, i, Number(e.target.value), line.remaining)
                          }
                          className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm tabular-nums text-center"
                          aria-label={`Quantity on load ${i + 1} for ${line.productName}`}
                        />
                      ))}
                      <Button
                        type="button"
                        variant={d.oos ? 'danger' : 'outline'}
                        size="sm"
                        className="w-[6.5rem]"
                        onClick={() => toggleCreateOos(line.invoiceItemId)}
                      >
                        Out of stock
                      </Button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || visibleLines.length === 0}>
            {saving
              ? 'Saving…'
              : isEditing
                ? 'Save changes'
                : loadCount > 1
                  ? `Create ${loadCount} loads`
                  : 'Create load'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
