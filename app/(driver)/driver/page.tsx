// app/(driver)/driver/page.tsx
// Driver landing queue — the same idea as the picker queue, but listing the
// printed delivery loads assigned to the signed-in driver.

import Link from 'next/link'
import { MapPin, Truck, CheckCircle2, ArrowRight, Hash } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getDriverQueue } from '@/lib/actions/driver'

export const dynamic = 'force-dynamic'

export default async function DriverQueuePage() {
  const { jobs, error } = await getDriverQueue()

  return (
    <div className="p-4 space-y-3">
      <h1 className="px-1 text-lg font-semibold tracking-tight text-foreground">Your deliveries</h1>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && (!jobs || jobs.length === 0) && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="font-semibold text-foreground">All caught up</p>
          <p className="mt-1 text-sm text-muted-foreground">
            No deliveries assigned to you right now.
          </p>
        </div>
      )}

      {jobs?.map((job) => (
        <div
          key={job.loadId}
          className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:shadow-foreground/5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-semibold text-foreground truncate">{job.clientName}</p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hash className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {job.documentNumber}
                  {job.orderNumber ? ` · ${job.orderNumber}` : ''}
                  {` · Load ${job.loadNumber}`}
                </span>
              </p>
              {job.deliveryAddress && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{job.deliveryAddress}</span>
                </p>
              )}
            </div>
            <Badge variant="primary" className="shrink-0 gap-1">
              <Truck className="h-3 w-3" />
              {job.itemCount} {job.itemCount === 1 ? 'item' : 'items'}
            </Badge>
          </div>

          <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
            <Link href={`/driver/${job.loadId}`}>
              Open job
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  )
}
