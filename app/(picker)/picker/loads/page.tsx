'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { getTodayLoads, reprintLoad } from '@/lib/actions/picker'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Package, Printer, ArrowRight, Loader2 } from 'lucide-react'

type LoadRow = NonNullable<Awaited<ReturnType<typeof getTodayLoads>>['loads']>[number]

export default function PickerLoadsPage() {
  const [loads, setLoads] = useState<LoadRow[]>([])
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const { loads: data, error } = await getTodayLoads()
      if (error) {
        toast.error(error)
        return
      }
      setLoads(data || [])
    })
  }, [])

  async function handleReprint(loadId: string) {
    const { load, error } = await reprintLoad(loadId)
    if (error || !load) {
      toast.error(error || 'Could not reprint')
      return
    }
    let objectUrl: string | null = null
    try {
      const response = await fetch('/api/invoices/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: load.invoiceId, loadId: load.id, mode: 'delivery-note', copies: 1 }),
      })
      if (!response.ok) throw new Error('Print failed')
      const blob = await response.blob()
      objectUrl = window.URL.createObjectURL(blob)
      window.open(objectUrl, '_blank')
      toast.success(`Load ${load.loadNumber} reprinted`)
    } catch {
      toast.error('Could not reprint delivery note')
    } finally {
      if (objectUrl) {
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl!), 10_000)
      }
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading loads…</div>
      </div>
    )
  }

  const inProgress = loads.filter((load) => load.status === 'open')
  const printed = loads.filter((load) => load.status !== 'open')

  if (loads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Package className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">No loads today</h1>
        <p className="mt-1 text-sm text-muted-foreground">Loads you print will appear here.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="px-1 text-lg font-semibold tracking-tight text-foreground">Loads</h1>

      {inProgress.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            In progress
          </h2>
          {inProgress.map((load) => (
            <div
              key={load.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{load.documentNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    Load {load.loadNumber} · {load.itemCount} items
                  </p>
                </div>
                <Badge variant="warning" className="shrink-0 gap-1">
                  <Loader2 className="h-3 w-3" />
                  Not printed
                </Badge>
              </div>
              <Button asChild size="lg" className="mt-3 h-12 w-full text-base">
                <Link href={`/picker/${load.invoiceId}`}>
                  Resume
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          ))}
        </section>
      )}

      {printed.length > 0 && (
        <section className="space-y-3">
          <h2 className="px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Printed today
          </h2>
          {printed.map((load) => (
            <div
              key={load.id}
              className="rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{load.documentNumber}</p>
                  <p className="text-sm text-muted-foreground">
                    Load {load.loadNumber} · {load.itemCount} items
                  </p>
                  {load.printedAt && (
                    <p className="text-xs text-muted-foreground">
                      Printed at {new Date(load.printedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Badge variant={load.status === 'completed' ? 'success' : 'info'}>
                    {load.status === 'completed' ? 'Delivered' : 'Printed'}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => handleReprint(load.id)}>
                    <Printer className="h-4 w-4 mr-1.5" />
                    Reprint
                  </Button>
                  <Link
                    href={`/picker/${load.invoiceId}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View order
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
