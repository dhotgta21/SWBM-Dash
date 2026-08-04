// app/(driver)/driver/history/page.tsx
// Recently completed deliveries for the signed-in driver. Read-only; tapping a
// row opens the job screen so the delivery note can be re-printed if needed.

import Link from 'next/link'
import { MapPin, CheckCircle2, History, Hash, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getDriverHistory } from '@/lib/actions/driver'

export const dynamic = 'force-dynamic'

export default async function DriverHistoryPage() {
  const { jobs, error } = await getDriverHistory()

  return (
    <div className="p-4 space-y-3">
      <h1 className="px-1 text-lg font-semibold tracking-tight text-foreground">Completed</h1>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error && (!jobs || jobs.length === 0) && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-6">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <History className="h-6 w-6" />
          </div>
          <p className="font-semibold text-foreground">No completed deliveries yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Deliveries you mark as complete will show up here.
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
            <Badge variant="success" className="shrink-0 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Delivered
            </Badge>
          </div>

          <Button asChild size="lg" variant="outline" className="mt-4 h-12 w-full text-base">
            <Link href={`/driver/${job.loadId}`}>
              View job
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  )
}
