'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  confirmLoad,
  getInvoiceForPicking,
  savePickState,
  markOrderCompleted,
  getDrivers,
  assignDriverToLoad,
} from '@/lib/actions/picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Package,
  MapPin,
  Phone,
  Check,
  X,
  Printer,
  Truck,
  ChevronDown,
  Hash,
  Undo2,
  PackageCheck,
  ListChecks,
  ArrowLeft,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type {
  PickerInvoiceItem,
  PickerInvoiceDetail,
  LoadItemInput,
  DriverOption,
} from '@/lib/actions/picker'

interface LineState {
  /** Quantity loaded so far (this session). */
  loadedQty: number
  /** The remainder after loadedQty is out of stock. */
  outOfStockRemainder: boolean
  /** Draft quantity in the "To load" input (defaults to the leftover). */
  draftQty?: number
}

export default function PickerInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  return <PickerInvoiceClient params={params} />
}

function buildInitialState(invoice: PickerInvoiceDetail): Record<string, LineState> {
  // Resume an in-progress (open) load exactly where the picker left off.
  // A line can have two rows: one `loaded`, one `out_of_stock` remainder.
  // Never pre-mark lines as loaded — every line starts in "To load" until
  // the picker deliberately marks it (or an open load is restored).
  if (invoice.openLoad && invoice.openLoad.items.length > 0) {
    const state: Record<string, LineState> = {}
    for (const li of invoice.openLoad.items) {
      const item = invoice.items.find((i) => i.id === li.invoiceItemId)
      if (!item) continue
      const current = state[li.invoiceItemId] || { loadedQty: 0, outOfStockRemainder: false }
      if (li.status === 'loaded') {
        current.loadedQty = Math.min(current.loadedQty + li.quantity, item.remainingQuantity)
      } else if (li.status === 'out_of_stock' || li.status === 'order') {
        current.outOfStockRemainder = true
      }
      state[li.invoiceItemId] = current
    }
    return state
  }

  return {}
}

function PickerInvoiceClient({ params }: { params: Promise<{ invoiceId: string }> }) {
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<PickerInvoiceDetail | null>(null)
  const [invoiceUpdatedAt, setInvoiceUpdatedAt] = useState<string | null>(null)
  const [itemsState, setItemsState] = useState<Record<string, LineState>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showSplitSheet, setShowSplitSheet] = useState(false)
  const [showCompleteSheet, setShowCompleteSheet] = useState(false)
  const [loadToPrint, setLoadToPrint] = useState<{ id: string; loadNumber: number } | null>(null)
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [headerExpanded, setHeaderExpanded] = useState(false)
  const router = useRouter()

  // When a load is confirmed and the print sheet opens, load the list of
  // registered drivers so the picker can hand the job off in the same step.
  useEffect(() => {
    if (!loadToPrint) return
    let cancelled = false
    getDrivers().then((res) => {
      if (cancelled) return
      if (res.drivers) setDrivers(res.drivers)
    })
    return () => {
      cancelled = true
    }
  }, [loadToPrint])

  async function handleAssignDriver() {
    if (!loadToPrint || !selectedDriverId) return
    setAssigning(true)
    const { error } = await assignDriverToLoad(loadToPrint.id, selectedDriverId)
    setAssigning(false)
    if (error) {
      toast.error(error)
      return
    }
    const name = drivers.find((d) => d.id === selectedDriverId)?.name || 'Driver'
    toast.success(`${name} assigned to this delivery`)
  }

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const { invoiceId: id } = await params
      if (cancelled) return
      setInvoiceId(id)
      const { invoice: data, error } = await getInvoiceForPicking(id)
      if (cancelled) return
      if (error || !data) {
        setLoadError(error || 'Could not load invoice')
        return
      }
      setInvoice(data)
      setInvoiceUpdatedAt(data.updatedAt)
      setItemsState(buildInitialState(data))
    })
    return () => {
      cancelled = true
    }
  }, [params])

  const refreshInvoice = useCallback(async () => {
    if (!invoice) return
    const { invoice: refreshed } = await getInvoiceForPicking(invoice.id)
    if (refreshed) {
      setInvoice(refreshed)
      setInvoiceUpdatedAt(refreshed.updatedAt)
      setItemsState(buildInitialState(refreshed))
    }
  }, [invoice])

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-destructive text-center">{loadError}</p>
        <Button variant="outline" onClick={() => router.push('/picker')}>
          Back to queue
        </Button>
      </div>
    )
  }

  if (!invoice || !invoiceId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading order…</div>
      </div>
    )
  }

  const inv = invoice

  // Lines still in play have quantity not yet covered by committed loads.
  const playableItems = inv.items.filter((item) => item.remainingQuantity > 0)

  const lineState = (itemId: string): LineState =>
    itemsState[itemId] || { loadedQty: 0, outOfStockRemainder: false }

  const isFullyAccounted = (item: PickerInvoiceItem) => {
    const s = lineState(item.id)
    if (s.loadedQty <= 0 && !s.outOfStockRemainder) return false
    return s.loadedQty >= item.remainingQuantity || s.outOfStockRemainder
  }

  const toLoadItems = playableItems.filter((item) => !isFullyAccounted(item))
  // Only FULLY accounted lines belong in the "Loaded" section — a partially
  // loaded line (3 of 10, no OOS flag) must stay in "To load" only, so the
  // section and the "X of Y accounted for" counter agree.
  const accountedItems = playableItems.filter((item) => isFullyAccounted(item))
  const allAccounted = toLoadItems.length === 0
  // Enable Complete/Split when anything has been marked — full lines, partial
  // quantities for a split load ("5 now, rest later"), or out-of-stock.
  // Requiring a fully accounted line blocked pure partial splits.
  const hasLoaded = playableItems.some((item) => {
    const s = lineState(item.id)
    return s.loadedQty > 0 || s.outOfStockRemainder
  })

  // Nothing left to load -> the screen becomes a read-only view of what is
  // actually on the printed/delivered loads (opened via "View order").
  const isReadOnly = playableItems.length === 0
  const finishedLoads = (inv.existingLoads || []).filter(
    (load) => load.status === 'printed' || load.status === 'completed'
  )

  function updateLine(itemId: string, patch: Partial<LineState>) {
    setItemsState((prev) => {
      const current = prev[itemId] || { loadedQty: 0, outOfStockRemainder: false }
      return { ...prev, [itemId]: { ...current, ...patch } }
    })
  }

  function setDraft(itemId: string, rawQuantity: number) {
    const item = inv.items.find((i) => i.id === itemId)
    if (!item) return
    const s = lineState(itemId)
    const leftover = Math.max(0, item.remainingQuantity - s.loadedQty)
    const draftQty = Number.isFinite(rawQuantity)
      ? Math.min(Math.max(0, rawQuantity), leftover)
      : 0
    updateLine(itemId, { draftQty })
  }

  function markLoaded(itemId: string) {
    const item = inv.items.find((i) => i.id === itemId)
    if (!item) return
    const s = lineState(itemId)
    const leftover = Math.max(0, item.remainingQuantity - s.loadedQty)
    const draft = Math.min(s.draftQty ?? leftover, leftover)
    if (draft <= 0) {
      toast.error('Enter a quantity to load first')
      return
    }
    updateLine(itemId, {
      loadedQty: s.loadedQty + draft,
      outOfStockRemainder: draft >= leftover ? false : s.outOfStockRemainder,
      draftQty: undefined,
    })
  }

  function markOutOfStock(itemId: string) {
    const item = inv.items.find((i) => i.id === itemId)
    if (!item) return
    const s = lineState(itemId)
    const leftover = Math.max(0, item.remainingQuantity - s.loadedQty)
    if (leftover <= 0) return
    updateLine(itemId, { outOfStockRemainder: true, draftQty: undefined })
  }

  function moveBack(itemId: string) {
    setItemsState((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  async function handleLoadComplete() {
    if (isCommitting) return
    if (!allAccounted) {
      setShowSplitSheet(true)
      return
    }
    await commitLoad(false)
  }

  async function commitLoad(isSplit: boolean) {
    if (isCommitting) return
    setIsCommitting(true)
    try {
      const items: LoadItemInput[] = playableItems
        .map((item) => {
          const s = lineState(item.id)
          return {
            invoiceItemId: item.id,
            loadedQuantity: s.loadedQty,
            outOfStockRemainder: s.outOfStockRemainder,
          }
        })
        .filter((i) => i.loadedQuantity > 0 || i.outOfStockRemainder)

      const { loadId, error } = await savePickState(
        inv.id,
        items,
        invoiceUpdatedAt || new Date().toISOString()
      )

      if (error || !loadId) {
        toast.error(error || 'Could not save load')
        return
      }

      const { load, error: confirmError } = await confirmLoad(inv.id, loadId, isSplit)
      if (confirmError || !load) {
        toast.error(confirmError || 'Could not confirm load')
        return
      }

      setSelectedDriverId('')
      setLoadToPrint(load)
      setShowSplitSheet(false)
    } finally {
      setIsCommitting(false)
    }
  }

  async function closePrintSheet() {
    setLoadToPrint(null)
    // Always rebuild from the server after a load is confirmed. Setting
    // loadToPrint to null alone does not fire Dialog onOpenChange, so the
    // previous "print closes → onOpenChange → skip refresh" path never ran
    // and left every line still marked loaded with stale remainingQuantity.
    await refreshInvoice()
  }

  async function handlePrint() {
    if (!loadToPrint) return
    let objectUrl: string | null = null
    try {
      const response = await fetch('/api/invoices/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: inv.id, loadId: loadToPrint.id, mode: 'delivery-note', copies: 1 }),
      })
      if (!response.ok) throw new Error('Print failed')
      const blob = await response.blob()
      objectUrl = window.URL.createObjectURL(blob)
      window.open(objectUrl, '_blank')
      toast.success(`Load ${loadToPrint.loadNumber} sent to printer`)
    } catch {
      toast.error('Could not print delivery note')
    } finally {
      if (objectUrl) {
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl!), 10_000)
      }
      await closePrintSheet()
    }
  }

  async function handleSkipPrint() {
    await closePrintSheet()
  }

  async function handleOrderCompleted() {
    const { error } = await markOrderCompleted(inv.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success('Order completed')
    router.push('/picker')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — back button left, order name centred; tap name for details. */}
      <div className="shrink-0 border-b bg-card">
        <div className="flex items-center gap-2 px-2 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.push('/picker')}
            aria-label="Back to queue"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => setHeaderExpanded((v) => !v)}
            aria-expanded={headerExpanded}
            aria-label={headerExpanded ? 'Hide delivery details' : 'Show delivery details'}
            className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center"
          >
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground truncate">
                {invoice.clientName}
              </h1>
              {!headerExpanded && (
                <p className="text-xs text-muted-foreground truncate">
                  {invoice.documentNumber}
                  {invoice.orderNumber ? ` · ${invoice.orderNumber}` : ''}
                </p>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                headerExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
          {/* Spacer keeps the name centred against the back button. */}
          <div className="h-10 w-10 shrink-0" aria-hidden />
        </div>
        {headerExpanded && (
          <div className="space-y-1.5 border-t bg-muted/30 px-4 py-3 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span>
                {invoice.documentNumber}
                {invoice.orderNumber ? ` · ${invoice.orderNumber}` : ''}
              </span>
            </p>
            {invoice.deliveryAddress && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{invoice.deliveryAddress}</span>
              </p>
            )}
            {invoice.clientPhone && (
              <a
                href={`tel:${invoice.clientPhone}`}
                className="flex items-center gap-2 text-primary"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{invoice.clientPhone}</span>
              </a>
            )}
          </div>
        )}
      </div>

      {/* Items — picking view, or a read-only load view when finished */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {isReadOnly ? (
          finishedLoads.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Nothing has been loaded on this order yet.
            </p>
          ) : (
            finishedLoads.map((load) => (
              <section key={load.id} className="space-y-3">
                <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  <PackageCheck className="h-3.5 w-3.5" />
                  Load {load.loadNumber}
                  <span>· {load.status === 'completed' ? 'Delivered' : 'Printed'}</span>
                </h2>
                {load.items.map((li, idx) => {
                  const item = inv.items.find((i) => i.id === li.invoiceItemId)
                  const isLoadedLine = li.status === 'loaded'
                  return (
                    <div
                      key={`${li.invoiceItemId}-${idx}`}
                      className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-3"
                    >
                      {item ? (
                        <ItemHeader item={item} />
                      ) : (
                        <p className="text-sm text-muted-foreground">Unknown item</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={isLoadedLine ? 'success' : 'destructive'} className="gap-1">
                          {isLoadedLine ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {li.quantity} {item?.unit || ''}{' '}
                          {isLoadedLine ? 'loaded' : 'out of stock'}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </section>
            ))
          )
        ) : (
          <>
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            To load
            <span className="tabular-nums">({toLoadItems.length})</span>
          </h2>
          {toLoadItems.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Everything is marked — complete the load below.
            </p>
          ) : (
            toLoadItems.map((item) => {
              const s = lineState(item.id)
              const leftover = Math.max(0, item.remainingQuantity - s.loadedQty)
              return (
                <ToLoadItemCard
                  key={item.id}
                  item={item}
                  loadedQty={s.loadedQty}
                  draftQty={Math.min(s.draftQty ?? leftover, leftover)}
                  onDraftChange={(qty) => setDraft(item.id, qty)}
                  onLoaded={() => markLoaded(item.id)}
                  onOutOfStock={() => markOutOfStock(item.id)}
                />
              )
            })
          )}
        </section>

        {accountedItems.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              <PackageCheck className="h-3.5 w-3.5" />
              Loaded
              <span className="tabular-nums">({accountedItems.length})</span>
            </h2>
            {accountedItems.map((item) => (
              <LoadedItemCard
                key={item.id}
                item={item}
                state={lineState(item.id)}
                onMoveBack={() => moveBack(item.id)}
              />
            ))}
          </section>
        )}
          </>
        )}
      </div>

      {/* Bottom action bar — stacked, full-width buttons above the tab bar. */}
      <div className="shrink-0 border-t bg-card px-4 py-3 pb-safe">
        {playableItems.length === 0 ? (
          invoice.pickingStatus === 'loaded' ? (
            <Button
              size="lg"
              onClick={() => setShowCompleteSheet(true)}
              className="h-12 w-full text-base"
            >
              <PackageCheck className="mr-2 h-5 w-5" />
              Order completed
            </Button>
          ) : invoice.pickingStatus === 'delivered' ? (
            <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-success">
              <Check className="h-5 w-5" />
              Delivered
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-muted-foreground">
              <PackageCheck className="h-5 w-5" />
              {invoice.pickingStatus === 'completed'
                ? 'Loaded — waiting for the driver'
                : 'All items are on printed loads'}
            </p>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {playableItems.length - toLoadItems.length}
              </span>
              {' of '}
              {playableItems.length} accounted for
            </p>
            <Button
              size="lg"
              onClick={handleLoadComplete}
              disabled={isPending || isCommitting || !hasLoaded}
              className="h-12 w-full text-base"
            >
              {isCommitting ? 'Saving…' : 'Complete load'}
            </Button>
          </div>
        )}
      </div>

      {/* Split confirmation sheet */}
      <Dialog open={showSplitSheet} onOpenChange={setShowSplitSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Not all items loaded</DialogTitle>
            <DialogDescription>
              Some items are not fully accounted for. Do you want to split this order and print a
              load for the items that are ready? The rest stays in the queue for another load.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowSplitSheet(false)}>
              Go back
            </Button>
            <Button onClick={() => commitLoad(true)} disabled={isPending || isCommitting || !hasLoaded}>
              Split order
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print confirmation sheet */}
      <Dialog open={!!loadToPrint} onOpenChange={(open) => { if (!open) handleSkipPrint() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Load {loadToPrint?.loadNumber} ready</DialogTitle>
            <DialogDescription>Print the delivery note for this load.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Truck className="h-4 w-4" />
              Assign driver
            </p>
            {drivers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No drivers registered yet. Add one in Settings → Team, then assign here.
              </p>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Choose a driver…</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={handleAssignDriver}
                  disabled={!selectedDriverId || assigning}
                >
                  {assigning ? 'Assigning…' : 'Assign'}
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={handleSkipPrint}>
              Skip
            </Button>
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print delivery note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order completed sheet */}
      <Dialog open={showCompleteSheet} onOpenChange={setShowCompleteSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark order completed?</DialogTitle>
            <DialogDescription>
              This will mark the order as fully picked and loaded. It will no longer appear in the
              picker queue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowCompleteSheet(false)}>
              Cancel
            </Button>
            <Button onClick={handleOrderCompleted} disabled={isPending}>
              Confirm completed
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ItemHeader({ item }: { item: PickerInvoiceItem }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground truncate">{item.productName}</p>
        {item.productCode && <p className="text-xs text-muted-foreground">{item.productCode}</p>}
        <p className="text-sm text-muted-foreground mt-0.5">
          Ordered: <span className="font-medium text-foreground tabular-nums">{item.quantity}</span>{' '}
          {item.unit || ''}
        </p>
        {item.trackStock && (
          <p className="text-xs text-muted-foreground">
            Stock: {item.stockQuantity ?? '—'} {item.reorderLevel ? `(reorder ${item.reorderLevel})` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

function ToLoadItemCard({
  item,
  loadedQty,
  draftQty,
  onDraftChange,
  onLoaded,
  onOutOfStock,
}: {
  item: PickerInvoiceItem
  loadedQty: number
  draftQty: number
  onDraftChange: (quantity: number) => void
  onLoaded: () => void
  onOutOfStock: () => void
}) {
  const leftover = Math.max(0, item.remainingQuantity - loadedQty)

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-3">
      <ItemHeader item={item} />

      {loadedQty > 0 && (
        <p className="text-xs font-medium text-success">
          {loadedQty} {item.unit || ''} already loaded — {leftover} {item.unit || ''} left
        </p>
      )}

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground whitespace-nowrap">Load qty</label>
        <input
          type="number"
          min={0}
          max={leftover}
          step="1"
          value={draftQty}
          onChange={(e) => onDraftChange(Number(e.target.value))}
          className="h-12 flex-1 rounded-lg border border-border bg-background px-3 text-base tabular-nums"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          / {leftover} {item.unit || ''} left
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOutOfStock}
          className="flex h-12 items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-card text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
          Out of stock
        </button>
        <button
          type="button"
          onClick={onLoaded}
          disabled={draftQty <= 0}
          className="flex h-12 items-center justify-center gap-1.5 rounded-lg bg-success text-sm font-medium text-success-foreground transition-colors hover:bg-success/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Check className="h-4 w-4" />
          Loaded
        </button>
      </div>
    </div>
  )
}

function LoadedItemCard({
  item,
  state,
  onMoveBack,
}: {
  item: PickerInvoiceItem
  state: LineState
  onMoveBack: () => void
}) {
  const missing = Math.max(0, item.remainingQuantity - state.loadedQty)

  return (
    <div className="rounded-xl border border-success/30 bg-success-muted/40 p-3 space-y-3">
      <ItemHeader item={item} />
      <div className="flex flex-wrap items-center gap-2">
        {state.loadedQty > 0 && (
          <Badge variant="success" className="gap-1">
            <Check className="h-3 w-3" />
            Loaded: {state.loadedQty} {item.unit || ''}
          </Badge>
        )}
        {state.outOfStockRemainder && missing > 0 && (
          <Badge variant="destructive" className="gap-1">
            <X className="h-3 w-3" />
            {missing} {item.unit || ''} out of stock
          </Badge>
        )}
      </div>
      <button
        type="button"
        onClick={onMoveBack}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Move back to &ldquo;To load&rdquo;
      </button>
    </div>
  )
}
