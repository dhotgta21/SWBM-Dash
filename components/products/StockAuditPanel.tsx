'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getStockAlerts,
  resolveStockAlert,
  markStockAlertOrdered,
  receiveStockAlertGoods,
  type StockAlertRow,
} from '@/lib/actions/stock'

interface StockAuditPanelProps {
  initialAlerts: StockAlertRow[]
  canEdit: boolean
}

function alertTypeLabel(type: string) {
  switch (type) {
    case 'low_stock':
      return <Badge variant="warning">Low stock</Badge>
    case 'out_of_stock':
      return <Badge variant="destructive">Out of stock</Badge>
    case 'order':
      return <Badge variant="info">Order requested</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

function statusLabel(status: string) {
  switch (status) {
    case 'open':
      return <Badge variant="outline">Open</Badge>
    case 'ordered':
      return <Badge variant="warning">On order</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function isDueOrOverdue(dateStr: string | null): 'overdue' | 'due_soon' | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= 2) return 'due_soon'
  return null
}

export function StockAuditPanel({ initialAlerts, canEdit }: StockAuditPanelProps) {
  const [alerts, setAlerts] = useState<StockAlertRow[]>(initialAlerts)
  const [isPending, startTransition] = useTransition()
  const [orderDialog, setOrderDialog] = useState<StockAlertRow | null>(null)
  const [receiveDialog, setReceiveDialog] = useState<StockAlertRow | null>(null)
  const [orderQty, setOrderQty] = useState('')
  const [orderEta, setOrderEta] = useState('')
  const [receiveQty, setReceiveQty] = useState('')

  async function handleRefresh() {
    startTransition(async () => {
      const result = await getStockAlerts()
      if (result.error) {
        toast.error(result.error)
      } else {
        setAlerts(result.alerts ?? [])
      }
    })
  }

  function openOrderDialog(alert: StockAlertRow) {
    setOrderDialog(alert)
    setOrderQty(
      alert.quantityOrdered != null
        ? String(alert.quantityOrdered)
        : alert.quantityNeeded != null
          ? String(alert.quantityNeeded)
          : ''
    )
    setOrderEta(alert.expectedDeliveryDate ?? '')
  }

  function openReceiveDialog(alert: StockAlertRow) {
    setReceiveDialog(alert)
    setReceiveQty(
      alert.quantityOrdered != null
        ? String(alert.quantityOrdered)
        : alert.quantityNeeded != null
          ? String(alert.quantityNeeded)
          : ''
    )
  }

  function handleMarkOrdered() {
    if (!orderDialog || !canEdit) return
    const qtyRaw = orderQty.trim()
    const qty = qtyRaw === '' ? null : Number(qtyRaw)
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) {
      toast.error('Quantity ordered must be a number 0 or more.')
      return
    }
    startTransition(async () => {
      const result = await markStockAlertOrdered(orderDialog.id, {
        quantityOrdered: qty,
        expectedDeliveryDate: orderEta.trim() || null,
      })
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Marked as ordered')
      setOrderDialog(null)
      const refreshed = await getStockAlerts()
      if (refreshed.alerts) setAlerts(refreshed.alerts)
    })
  }

  function handleReceive() {
    if (!receiveDialog || !canEdit) return
    const qty = Number(receiveQty)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Enter how many were received.')
      return
    }
    startTransition(async () => {
      const result = await receiveStockAlertGoods(receiveDialog.id, qty)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Goods received — stock updated if tracking is on')
      setReceiveDialog(null)
      const refreshed = await getStockAlerts()
      if (refreshed.alerts) setAlerts(refreshed.alerts)
    })
  }

  function handleResolve(alertId: string) {
    if (!canEdit) return
    startTransition(async () => {
      const result = await resolveStockAlert(alertId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Alert closed')
        setAlerts((prev) => prev.filter((a) => a.id !== alertId))
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Open stock alerts</CardTitle>
              <CardDescription>
                Alerts from pickers and low-stock after sales. Mark ordered (with qty / ETA), then
                confirm received to put stock back on the shelf when tracking is on.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open stock alerts.</p>
          ) : (
            <ResponsiveTable
              rows={alerts}
              keyField="id"
              renderDesktop={(rows) => (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Needed</TableHead>
                      <TableHead className="text-right">Ordered</TableHead>
                      <TableHead>ETA</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((alert) => {
                      const due = isDueOrOverdue(alert.expectedDeliveryDate)
                      return (
                        <TableRow key={alert.id}>
                          <TableCell>{alertTypeLabel(alert.alertType)}</TableCell>
                          <TableCell>{statusLabel(alert.status)}</TableCell>
                          <TableCell>
                            {alert.product ? (
                              <Link
                                href={`/admin/products/${alert.product.id}/edit`}
                                className="font-medium hover:underline"
                              >
                                {alert.product.name}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">Unknown</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {alert.invoice ? (
                              <Link
                                href={`/invoices/${alert.invoice.id}`}
                                className="hover:underline"
                              >
                                {alert.invoice.document_number}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{alert.quantityNeeded ?? '—'}</TableCell>
                          <TableCell className="text-right">{alert.quantityOrdered ?? '—'}</TableCell>
                          <TableCell>
                            {alert.expectedDeliveryDate ? (
                              <span
                                className={
                                  due === 'overdue'
                                    ? 'text-destructive font-medium'
                                    : due === 'due_soon'
                                      ? 'text-amber-700 font-medium'
                                      : undefined
                                }
                              >
                                {alert.expectedDeliveryDate}
                                {due === 'overdue' ? ' (overdue)' : due === 'due_soon' ? ' (soon)' : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {alert.status === 'open' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!canEdit || isPending}
                                  onClick={() => openOrderDialog(alert)}
                                >
                                  Ordered
                                </Button>
                              )}
                              {(alert.status === 'open' || alert.status === 'ordered') && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!canEdit || isPending}
                                  onClick={() => openReceiveDialog(alert)}
                                >
                                  Received
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                disabled={!canEdit || isPending}
                                onClick={() => handleResolve(alert.id)}
                              >
                                Close
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
              renderMobile={(alert) => {
                const due = isDueOrOverdue(alert.expectedDeliveryDate)
                return (
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      {alertTypeLabel(alert.alertType)}
                      {statusLabel(alert.status)}
                    </div>
                    <p className="font-medium text-foreground">
                      {alert.product?.name || 'Unknown product'}
                    </p>
                    {alert.invoice && (
                      <p className="text-sm text-muted-foreground">
                        Invoice:{' '}
                        <Link href={`/invoices/${alert.invoice.id}`} className="hover:underline">
                          {alert.invoice.document_number}
                        </Link>
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Needed: {alert.quantityNeeded ?? '—'}
                      {alert.quantityOrdered != null ? ` · Ordered: ${alert.quantityOrdered}` : ''}
                      {alert.expectedDeliveryDate
                        ? ` · ETA: ${alert.expectedDeliveryDate}${due === 'overdue' ? ' (overdue)' : ''}`
                        : ''}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {alert.status === 'open' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canEdit || isPending}
                          onClick={() => openOrderDialog(alert)}
                        >
                          Ordered
                        </Button>
                      )}
                      {(alert.status === 'open' || alert.status === 'ordered') && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!canEdit || isPending}
                          onClick={() => openReceiveDialog(alert)}
                        >
                          Received
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={!canEdit || isPending}
                        onClick={() => handleResolve(alert.id)}
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )
              }}
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={!!orderDialog} onOpenChange={(open) => !open && setOrderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as ordered</DialogTitle>
            <DialogDescription>
              Record what you ordered from the supplier. Qty and date are optional if you only track
              notifications; with stock tracking on, use them so “Received” can restock correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium">{orderDialog?.product?.name}</p>
            <div className="space-y-2">
              <Label htmlFor="order-qty">Quantity ordered</Label>
              <Input
                id="order-qty"
                type="number"
                min={0}
                step="any"
                value={orderQty}
                onChange={(e) => setOrderQty(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-eta">Expected delivery</Label>
              <Input
                id="order-eta"
                type="date"
                value={orderEta}
                onChange={(e) => setOrderEta(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOrderDialog(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={handleMarkOrdered}>
                Save ordered
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiveDialog} onOpenChange={(open) => !open && setReceiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm goods received</DialogTitle>
            <DialogDescription>
              When stock routing is on and the product tracks quantity, this adds the received amount
              to shelf stock. If tracking is off, the alert is closed only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium">{receiveDialog?.product?.name}</p>
            <div className="space-y-2">
              <Label htmlFor="receive-qty">Quantity received</Label>
              <Input
                id="receive-qty"
                type="number"
                min={0}
                step="any"
                value={receiveQty}
                onChange={(e) => setReceiveQty(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setReceiveDialog(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={isPending} onClick={handleReceive}>
                Confirm received
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
