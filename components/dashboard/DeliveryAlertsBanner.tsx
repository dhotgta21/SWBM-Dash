'use client'

// Dashboard banner listing deliveries that have been assigned to a driver for
// more than 24 hours without being marked delivered. Admins can dismiss an
// alert (e.g. once they've chased the driver); it also auto-resolves when the
// invoice is delivered.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, X, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resolveDeliveryAlert, type DeliveryAlert } from '@/lib/actions/delivery-alerts'

function hoursOverdue(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 3_600_000))
}

export function DeliveryAlertsBanner({ alerts }: { alerts: DeliveryAlert[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!alerts || alerts.length === 0) return null

  function dismiss(id: string) {
    setErrorMessage(null)
    startTransition(async () => {
      const { error } = await resolveDeliveryAlert(id)
      if (error) {
        setErrorMessage(error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning-muted/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-warning">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h2 className="font-semibold">
          {alerts.length} {alerts.length === 1 ? 'delivery' : 'deliveries'} not marked delivered
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        These have been with a driver for over 24 hours. The job stays on the driver&apos;s list
        until it&apos;s marked delivered.
      </p>
      {errorMessage ? (
        <p className="text-sm font-medium text-destructive">{errorMessage}</p>
      ) : null}
      <ul className="space-y-2">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`/invoices/${alert.invoiceId}`}
                className="font-medium text-primary hover:underline"
              >
                {alert.documentNumber}
              </Link>
              <span className="text-sm text-muted-foreground"> · {alert.clientName}</span>
              <p
                className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5"
                suppressHydrationWarning
              >
                <Truck className="h-3.5 w-3.5" />
                {alert.driverName ? alert.driverName : 'Driver'} · {hoursOverdue(alert.createdAt)}h
                overdue
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss(alert.id)}
              disabled={isPending}
              className="shrink-0"
            >
              <X className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
