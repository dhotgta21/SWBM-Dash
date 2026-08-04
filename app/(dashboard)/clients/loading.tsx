import { Skeleton } from '@/components/ui/skeleton'

export default function ClientsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header — matches the PageHeader used by the page. */}
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>

      {/* Tab strip */}
      <Skeleton className="h-11 w-80 rounded-lg" />

      {/* Default view is the Client Dashboard, so a KPI-card
          skeleton is the most representative placeholder. Other
          views (accounts / temporary) replace it as soon as the
          page server-renders. */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] w-full rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}
