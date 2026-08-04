'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Printer,
  CheckCircle,
  Package,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Truck,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  markInvoiceDelivered,
  reconcileInvoiceStockFromLoads,
  deleteOfficeLoad,
  getDrivers,
  assignDriverToLoad,
  unassignDriverFromLoad,
  type InvoiceLoadDetail,
  type DriverOption,
} from '@/lib/actions/picker'
import { LoadEditorDialog } from '@/components/invoices/LoadEditorDialog'
import { MoveLoadItemDialog } from '@/components/invoices/MoveLoadItemDialog'

type LoadItemRow = InvoiceLoadDetail['items'][number]

interface InvoiceLoadsPanelProps {
  invoiceId: string
  pickingStatus: string
  loads: InvoiceLoadDetail[]
  canMarkDelivered: boolean
  /** Admin or invoices_edit + invoice still sent/partial and not delivered. */
  canManageLoads?: boolean
  /** Admin, invoices_edit, or invoices_change_status — assign load to a driver. */
  canAssignDriver?: boolean
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
    case 'delivered':
      return <Badge variant="success">Completed</Badge>
    case 'printed':
      return <Badge variant="default">Printed</Badge>
    case 'open':
      return <Badge variant="default">Open</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export function InvoiceLoadsPanel({
  invoiceId,
  pickingStatus,
  loads,
  canMarkDelivered,
  canManageLoads,
  canAssignDriver,
}: InvoiceLoadsPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [printingLoadId, setPrintingLoadId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingLoad, setEditingLoad] = useState<InvoiceLoadDetail | null>(null)
  const [loadToDelete, setLoadToDelete] = useState<InvoiceLoadDetail | null>(null)
  const [moveTarget, setMoveTarget] = useState<{ load: InvoiceLoadDetail; item: LoadItemRow } | null>(null)
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [driversLoaded, setDriversLoaded] = useState(false)
  const [assigningLoadId, setAssigningLoadId] = useState<string | null>(null)
  /** Pending select value per load while the user picks a driver. */
  const [driverDraft, setDriverDraft] = useState<Record<string, string>>({})

  // Load the driver list once when the panel can assign (or already has names to show).
  useEffect(() => {
    if (!canAssignDriver) return
    let cancelled = false
    getDrivers().then((res) => {
      if (cancelled) return
      if (res.drivers) setDrivers(res.drivers)
      setDriversLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [canAssignDriver])

  function openCreate() {
    setEditingLoad(null)
    setEditorOpen(true)
  }

  function openEdit(load: InvoiceLoadDetail) {
    setEditingLoad(load)
    setEditorOpen(true)
  }

  function handleDeleteLoad() {
    if (!loadToDelete) return
    startTransition(async () => {
      const result = await deleteOfficeLoad(loadToDelete.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Load ${loadToDelete.loadNumber} deleted`)
      setLoadToDelete(null)
      router.refresh()
    })
  }

  async function handlePrint(loadId: string, loadNumber: number) {
    setPrintingLoadId(loadId)
    let objectUrl: string | null = null
    try {
      const response = await fetch('/api/invoices/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, loadId, mode: 'delivery-note', copies: 1 }),
      })
      if (!response.ok) throw new Error('Print failed')
      const blob = await response.blob()
      objectUrl = window.URL.createObjectURL(blob)
      window.open(objectUrl, '_blank')
      toast.success(`Load ${loadNumber} delivery note opened`)
    } catch {
      toast.error('Could not print delivery note')
    } finally {
      if (objectUrl) {
        // Give the browser a moment to open the tab before revoking.
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl!), 10_000)
      }
      setPrintingLoadId(null)
    }
  }

  function handleMarkDelivered() {
    startTransition(async () => {
      const result = await markInvoiceDelivered(invoiceId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Order marked as delivered — stock settled from loaded lines')
        router.refresh()
      }
    })
  }

  function handleReconcileStock() {
    startTransition(async () => {
      const result = await reconcileInvoiceStockFromLoads(invoiceId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const n = result.result?.lines_adjusted ?? 0
      const restored = result.result?.restored ?? 0
      toast.success(
        n === 0
          ? 'Stock already matches loaded quantities (or stock routing is off)'
          : `Stock reconciled: ${n} line(s) adjusted` +
              (restored > 0 ? ` · restored ${restored} to shelf` : '')
      )
      router.refresh()
    })
  }

  async function handleAssignDriver(load: InvoiceLoadDetail, driverId: string) {
    if (!driverId) return
    setAssigningLoadId(load.id)
    try {
      const result = await assignDriverToLoad(load.id, driverId)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const name = drivers.find((d) => d.id === driverId)?.name || 'Driver'
      toast.success(`${name} assigned to Load ${load.loadNumber}`)
      setDriverDraft((prev) => {
        const next = { ...prev }
        delete next[load.id]
        return next
      })
      router.refresh()
    } finally {
      setAssigningLoadId(null)
    }
  }

  async function handleUnassignDriver(load: InvoiceLoadDetail) {
    setAssigningLoadId(load.id)
    try {
      const result = await unassignDriverFromLoad(load.id)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(`Driver cleared from Load ${load.loadNumber}`)
      setDriverDraft((prev) => {
        const next = { ...prev }
        delete next[load.id]
        return next
      })
      router.refresh()
    } finally {
      setAssigningLoadId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Loads &amp; delivery</CardTitle>
              <CardDescription>
                Create one or more loads, assign items and a driver — same as the picker, from the office.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {statusBadge(pickingStatus)}
              {canManageLoads && (
                <Button type="button" size="sm" onClick={openCreate} className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create load
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loads.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">No loads have been created yet.</p>
              {canManageLoads ? (
                <div className="mt-3">
                  <Button type="button" size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Create load
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Pickers will see this order in their queue and create loads as they pick it.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {loads.map((load) => {
                const draftDriverId =
                  driverDraft[load.id] ?? load.assignedDriverId ?? ''
                const canChangeDriver = canAssignDriver && load.status === 'printed'
                return (
                  <div
                    key={load.id}
                    className="rounded-lg border border-border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">Load {load.loadNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {load.items.reduce((sum, i) => sum + i.quantity, 0)} item
                          {load.items.reduce((sum, i) => sum + i.quantity, 0) === 1 ? '' : 's'}
                          {load.assignedDriverName
                            ? ` · ${load.assignedDriverName}`
                            : load.status === 'printed'
                              ? ' · No driver'
                              : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {statusBadge(load.status)}
                        {canManageLoads && load.status === 'printed' && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(load)}
                            >
                              <Pencil className="h-4 w-4 mr-1.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setLoadToDelete(load)}
                            >
                              <Trash2 className="h-4 w-4 mr-1.5" />
                              Delete
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={printingLoadId === load.id}
                          onClick={() => handlePrint(load.id, load.loadNumber)}
                        >
                          <Printer className="h-4 w-4 mr-1.5" />
                          {printingLoadId === load.id ? 'Opening…' : 'Print'}
                        </Button>
                      </div>
                    </div>

                    {canChangeDriver && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground shrink-0">
                          <Truck className="h-3.5 w-3.5" />
                          Driver
                        </p>
                        {driversLoaded && drivers.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No drivers registered. Add one in Settings → Team.
                          </p>
                        ) : (
                          <div className="flex flex-1 flex-wrap items-center gap-2">
                            <select
                              value={draftDriverId}
                              onChange={(e) =>
                                setDriverDraft((prev) => ({
                                  ...prev,
                                  [load.id]: e.target.value,
                                }))
                              }
                              disabled={assigningLoadId === load.id || !driversLoaded}
                              className="h-9 min-w-[10rem] flex-1 rounded-md border border-border bg-background px-2 text-sm"
                              aria-label={`Driver for load ${load.loadNumber}`}
                            >
                              <option value="">Choose a driver…</option>
                              {drivers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                assigningLoadId === load.id ||
                                !draftDriverId ||
                                draftDriverId === (load.assignedDriverId || '')
                              }
                              onClick={() => handleAssignDriver(load, draftDriverId)}
                            >
                              {assigningLoadId === load.id ? 'Saving…' : 'Assign'}
                            </Button>
                            {load.assignedDriverId && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={assigningLoadId === load.id}
                                onClick={() => handleUnassignDriver(load)}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {!canChangeDriver && load.assignedDriverName && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Truck className="h-3.5 w-3.5" />
                        Driver: {load.assignedDriverName}
                      </p>
                    )}

                    <ul className="text-sm space-y-1">
                      {load.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {item.productName}
                            {item.productCode && (
                              <span className="ml-2 text-xs text-muted-foreground">{item.productCode}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                            <span>
                              {item.quantity} ·{' '}
                              {item.status === 'loaded'
                                ? 'Loaded'
                                : item.status === 'out_of_stock'
                                  ? 'Out of stock'
                                  : 'Order'}
                            </span>
                            {canManageLoads &&
                              load.status === 'printed' &&
                              item.status !== 'out_of_stock' &&
                              item.quantity > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => setMoveTarget({ load, item })}
                                >
                                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
                                  Move
                                </Button>
                              )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {loads.length > 0 && canMarkDelivered && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Stock from loads</p>
                <p className="text-xs text-muted-foreground">
                  When stock routing is on, settle product quantities to what was <strong>loaded</strong>
                  (OOS / order remainder is put back on the shelf if it was deducted when the invoice was sent).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={handleReconcileStock}
              >
                {isPending ? 'Working…' : 'Reconcile stock from loads'}
              </Button>
            </div>
          )}

          {canMarkDelivered && pickingStatus !== 'delivered' && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Mark order as delivered?</p>
                <p className="text-xs text-amber-800">
                  Use when the order has left the yard or the customer has collected it. This also
                  reconciles stock from loaded lines when stock routing is on.
                  {pickingStatus === 'completed'
                    ? ' The picker has finished loading — confirm delivery or collection here if needed.'
                    : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={handleMarkDelivered}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {isPending ? 'Saving…' : 'Mark delivered'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <LoadEditorDialog
        invoiceId={invoiceId}
        load={editingLoad}
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditingLoad(null)
        }}
        onSaved={() => router.refresh()}
      />

      {moveTarget && (
        <MoveLoadItemDialog
          key={moveTarget.item.id}
          sourceLoad={moveTarget.load}
          item={moveTarget.item}
          otherLoads={loads.filter(
            (load) => load.status === 'printed' && load.id !== moveTarget.load.id
          )}
          open={!!moveTarget}
          onOpenChange={(open) => {
            if (!open) setMoveTarget(null)
          }}
          onSaved={() => router.refresh()}
        />
      )}

      <Dialog open={!!loadToDelete} onOpenChange={(open) => { if (!open) setLoadToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete load {loadToDelete?.loadNumber}?</DialogTitle>
            <DialogDescription>
              The items on this load go back to the order&apos;s remaining quantities. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setLoadToDelete(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteLoad} disabled={isPending}>
              {isPending ? 'Deleting…' : 'Delete load'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
