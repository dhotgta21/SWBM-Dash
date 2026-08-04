'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Boxes, History } from 'lucide-react'

interface StockViewTabsProps {
  /**
   * Open stock alerts (shown at the top of the Stock take sub-tab).
   * Rendered as a red badge on the Stock take trigger so the operator
   * can see how many open alerts need attention without leaving the
   * outer Products tab.
   */
  alertCount?: number
  /**
   * Total number of history rows in the Stock audit sub-tab. Optional —
   * the tab falls back to a non-counter label when the count hasn't
   * been loaded yet.
   */
  historyCount?: number
  defaultView?: 'take' | 'audit'
  /**
   * Base path the inner tabs navigate to. Defaults to `/admin/products`
   * so deep links round-trip back to the same page.
   */
  basePath?: string
}

type StockView = 'take' | 'audit'

/**
 * Inner sub-tab strip for the Stock section of the Products page.
 *
 * Splits the previous top-level "Stock" and "Stock audit" tabs into a
 * single Stock section with two sub-tabs:
 *
 *   • Stock take  — current quantities, alerts and the take form
 *                   (`?view=stock`, default — `?tab=` not set)
 *   • Stock audit — append-only history of every stock change
 *                   (`?view=stock&tab=audit`)
 *
 * Uses `?tab=` so it doesn't collide with the outer `?view=` owned by
 * ProductsViewTabs.
 */
export function StockViewTabs({
  alertCount,
  historyCount,
  defaultView = 'take',
  basePath = '/admin/products',
}: StockViewTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // `useSearchParams` can return null during SSR without a Suspense
  // boundary. Fall back to empty params so the tabs render safely.
  const params = searchParams ?? new URLSearchParams()

  // The inner StockViewTabs uses `?tab=` so it doesn't clash with
  // the outer ProductsViewTabs which owns `?view=`.
  const currentView: StockView = params.get('tab') === 'audit' ? 'audit' : 'take'

  function setView(next: StockView) {
    if (next === currentView) return
    const nextParams = new URLSearchParams(params.toString())
    if (next === defaultView) {
      nextParams.delete('tab')
    } else {
      nextParams.set('tab', next)
    }
    const qs = nextParams.toString()
    startTransition(() => {
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
    })
  }

  const showAlertBadge = typeof alertCount === 'number' && alertCount > 0

  return (
    <Tabs value={currentView} onValueChange={(v) => setView(v as StockView)}>
      <TabsList className="h-auto p-1 rounded-lg border border-border bg-card overflow-x-auto max-w-full">
        <TabsTrigger
          value="take"
          className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Boxes className="w-4 h-4" />
          Stock take
          {showAlertBadge ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                'bg-destructive text-white'
              )}
              title={`${alertCount} open stock alert${alertCount === 1 ? '' : 's'}`}
            >
              {alertCount}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger
          value="audit"
          className={cn(
            'group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <History className="w-4 h-4" />
          Stock audit
          {typeof historyCount === 'number' ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                'bg-background/60 text-muted-foreground',
                'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
              )}
            >
              {historyCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
