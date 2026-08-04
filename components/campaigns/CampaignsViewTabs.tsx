'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Tag, Percent } from 'lucide-react'

interface CampaignsViewTabsProps {
  individualCount: number
  campaignCount: number
  defaultView?: 'individual' | 'campaigns'
  /**
   * Base path the inner tabs navigate to. Defaults to `/admin/products`
   * because the Campaigns UI now lives as a tab on the Products page;
   * the legacy `/admin/campaigns` route redirects there on load.
   *
   * Other params on the URL (q, view on the outer tabs, etc.) are
   * preserved across navigation so the operator's filter context isn't
   * blown away when toggling between Product discounts and Campaign
   * groups.
   */
  basePath?: string
}

export function CampaignsViewTabs({
  individualCount,
  campaignCount,
  defaultView = 'individual',
  basePath = '/admin/products',
}: CampaignsViewTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  // `useSearchParams` can return null during SSR without a Suspense
  // boundary. Fall back to empty params so the tabs render safely.
  const params = searchParams ?? new URLSearchParams()

  // The inner CampaignsViewTabs uses `?tab=` so it doesn't clash with
  // the outer ProductsViewTabs which owns `?view=`.
  const currentView = params.get('tab') === 'campaigns' ? 'campaigns' : 'individual'

  function setView(next: 'individual' | 'campaigns') {
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

  return (
    <Tabs value={currentView} onValueChange={(v) => setView(v as 'individual' | 'campaigns')}>
      <TabsList className="h-auto p-1 rounded-lg border border-border bg-card overflow-x-auto max-w-full">
        <TabsTrigger
          value="individual"
          className={cn(
            'group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Percent className="w-4 h-4" />
          Product discounts
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
              'bg-background/60 text-muted-foreground',
              'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
            )}
          >
            {individualCount}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="campaigns"
          className={cn(
            'group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Tag className="w-4 h-4" />
          Campaign groups
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
              'bg-background/60 text-muted-foreground',
              'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
            )}
          >
            {campaignCount}
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}