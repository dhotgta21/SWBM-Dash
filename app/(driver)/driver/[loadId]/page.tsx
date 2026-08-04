'use client'

// Driver job screen — name / invoice / address at the top, the delivery-note
// lines below, plus "Go to address" (Google Maps), "Print delivery note" and
// "Mark as delivered". Built on the same corrected shell as the picker detail
// so the header and the items list never overlap.

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getDriverLoad, markLoadDelivered } from '@/lib/actions/driver'
import type { DriverLoadDetail } from '@/lib/actions/driver'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MapPin, Phone, Printer, CheckCircle2, Navigation, Package, ArrowLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export const dynamic = 'force-dynamic'

export default function DriverLoadPage({ params }: { params: Promise<{ loadId: string }> }) {
  return <DriverLoadClient params={params} />
}

function DriverLoadClient({ params }: { params: Promise<{ loadId: string }> }) {
  const [loadId, setLoadId] = useState<string | null>(null)
  const [job, setJob] = useState<DriverLoadDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [showCompleteSheet, setShowCompleteSheet] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    startTransition(async () => {
      const { loadId: id } = await params
      if (cancelled) return
      // Reset stale state when navigating between jobs — otherwise a
      // previous error screen persists even after valid data arrives.
      setJob(null)
      setLoadError(null)
      setLoadId(id)
      const { job: data, error } = await getDriverLoad(id)
      if (cancelled) return
      if (error || !data) {
        setLoadError(error || 'Could not load this job')
        return
      }
      setJob(data)
    })
    return () => {
      cancelled = true
    }
  }, [params])

  async function handlePrint() {
    if (!job) return
    setPrinting(true)
    let objectUrl: string | null = null
    try {
      const response = await fetch('/api/invoices/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: job.invoiceId,
          loadId: job.loadId,
          mode: 'delivery-note',
          copies: 1,
        }),
      })
      if (!response.ok) throw new Error('Print failed')
      const blob = await response.blob()
      objectUrl = window.URL.createObjectURL(blob)
      window.open(objectUrl, '_blank')
    } catch {
      toast.error('Could not print delivery note')
    } finally {
      if (objectUrl) {
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl!), 10_000)
      }
      setPrinting(false)
    }
  }

  async function handleMarkDelivered() {
    if (!loadId || submitting) return
    setSubmitting(true)
    try {
      const { delivered, error } = await markLoadDelivered(loadId)
      if (error) {
        toast.error(error)
        return
      }
      toast.success(delivered ? 'Delivery completed' : 'Load delivered')
      setShowCompleteSheet(false)
      router.push('/driver')
    } finally {
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <p className="text-destructive text-center">{loadError}</p>
        <Button variant="outline" onClick={() => router.push('/driver')}>
          Back to jobs
        </Button>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading job…</div>
      </div>
    )
  }

  const isDone = job.loadStatus === 'completed' || job.pickingStatus === 'delivered'
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    job.deliveryAddress
  )}`

  return (
    <div className="flex h-full flex-col">
      {/* Header — back button + job details; the list below scrolls. */}
      <div className="shrink-0 border-b bg-card px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 -ml-2"
            onClick={() => router.push('/driver')}
            aria-label="Back to jobs"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">{job.clientName}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {job.documentNumber}
              {job.orderNumber ? ` · ${job.orderNumber}` : ''}
              {` · Load ${job.loadNumber}`}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          {job.deliveryAddress && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{job.deliveryAddress}</span>
            </p>
          )}
          {job.clientPhone && (
            <a
              href={`tel:${job.clientPhone}`}
              className="flex items-center gap-2 text-sm text-primary"
            >
              <Phone className="h-4 w-4 shrink-0" />
              <span>{job.clientPhone}</span>
            </a>
          )}
        </div>
        {job.deliveryAddress && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground"
          >
            <Navigation className="h-4 w-4" />
            Go to address
          </a>
        )}
      </div>

      {/* Delivery note lines — scrollable, no prices. */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Delivery note
        </p>
        {job.items.length === 0 && (
          <p className="text-sm text-muted-foreground">No items on this load.</p>
        )}
        {job.items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground truncate">{item.productName}</p>
                {item.productCode && (
                  <p className="text-xs text-muted-foreground">{item.productCode}</p>
                )}
              </div>
              <p className="text-base font-semibold text-foreground tabular-nums shrink-0">
                {item.quantity}
                {item.unit ? <span className="text-xs font-normal text-muted-foreground ml-1">{item.unit}</span> : null}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer actions — in-flow, above the tab bar. */}
      <div className="shrink-0 border-t bg-card px-4 py-3 pb-safe">
        {isDone ? (
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-5 w-5" />
            Delivered
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={printing}
              className="h-12 flex-1 text-base"
            >
              <Printer className="h-4 w-4 mr-2" />
              {printing ? 'Opening…' : 'Print note'}
            </Button>
            <Button onClick={() => setShowCompleteSheet(true)} className="h-12 flex-1 text-base">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark delivered
            </Button>
          </div>
        )}
      </div>

      {/* Mark delivered confirmation */}
      <Dialog open={showCompleteSheet} onOpenChange={setShowCompleteSheet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as delivered?</DialogTitle>
            <DialogDescription>
              Confirm this load was delivered to {job.clientName}. It will leave your jobs list and
              the invoice will be marked delivered once all its loads are done.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowCompleteSheet(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkDelivered} disabled={submitting}>
              {submitting ? 'Saving…' : 'Confirm delivered'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
