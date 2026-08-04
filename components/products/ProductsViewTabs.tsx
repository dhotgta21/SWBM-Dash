'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BarChart3, Zap, Tag, Package, Boxes } from 'lucide-react'

interface ProductsViewTabsProps {
  catalogCount: number
  temporaryCount: number
  /**
   * Counts for the campaigns tab (sub-tabs inside the campaigns view).
   * Optional — if omitted the tab falls back to a non-counter label so
   * the page can still mount before the campaigns fetch resolves.
   */
  campaignIndividualCount?: number
  campaignGroupCount?: number
  stockAlertCount?: number
  defaultView?: 'data' | 'catalog' | 'temporary' | 'campaigns' | 'stock'
}

type ProductView = 'data' | 'catalog' | 'temporary' | 'campaigns' | 'stock'

/**
 * URL-synced tab strip for the Products page.
 *
 * Tabs (in order):
 *   • Product Dashboard  — analytics dashboard for the catalog
 *                          (`?view=data`, default landing tab)
 *   • Catalog            — permanent products (`?view=catalog`)
 *   • Temporary products — walk-in queue (`?view=temporary`)
 *   • Campaigns          — product discounts + campaign groups
 *                          (`?view=campaigns`)
 *   • Stock              — Stock take / Stock audit sub-tabs
 *                          (`?view=stock`)
 *
 * Active tab is kept in `?view=` for deep-linkability and back-button
 * support. The Stock section has its own inner sub-tabs (Stock take /
 * Stock audit) driven by `?tab=` — see StockViewTabs.
 */
export function ProductsViewTabs({
  catalogCount,
  temporaryCount,
  campaignIndividualCount,
  campaignGroupCount,
  stockAlertCount,
  defaultView = 'data',
}: ProductsViewTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const params = searchParams ?? new URLSearchParams()

  const rawView = params.get('view')
  const currentView: ProductView =
    rawView === 'catalog' ||
    rawView === 'temporary' ||
    rawView === 'campaigns' ||
    rawView === 'stock'
      ? rawView
      : 'data'

  function setView(next: ProductView) {
    if (next === currentView) return
    const nextParams = new URLSearchParams(params.toString())
    if (next === defaultView) {
      nextParams.delete('view')
    } else {
      nextParams.set('view', next)
    }
    // Both Campaigns and Stock own their own inner sub-tabs via `?tab=`,
    // so clear any inherited `tab=` when entering either of them — otherwise
    // jumping from Campaigns (tab=campaigns) to Stock would leave
    // `?view=stock&tab=campaigns` in the URL, which StockViewTabs would
    // (correctly) interpret as the Stock audit sub-tab.
    if (next === 'campaigns' || next === 'stock') nextParams.delete('tab')
    const qs = nextParams.toString()
    startTransition(() => {
      router.replace(qs ? `/admin/products?${qs}` : '/admin/products', { scroll: false })
    })
  }

  const campaignsCount =
    typeof campaignIndividualCount === 'number' &&
    typeof campaignGroupCount === 'number'
      ? campaignIndividualCount + campaignGroupCount
      : null

  return (
    <Tabs value={currentView} onValueChange={(v) => setView(v as ProductView)}>
      <TabsList className="h-auto p-1.5 gap-1 rounded-xl border border-border bg-card overflow-x-auto max-w-full shadow-sm">
        <TabsTrigger
          value="data"
          className={cn(
            'inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <BarChart3 className="w-5 h-5" />
          Product Dashboard
        </TabsTrigger>
        <TabsTrigger
          value="catalog"
          className={cn(
            'group inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Package className="w-5 h-5" />
          Catalog
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
              'bg-background/60 text-muted-foreground',
              'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
            )}
          >
            {catalogCount}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="temporary"
          className={cn(
            'group inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary',
            temporaryCount > 0 && currentView !== 'temporary' &&
              'text-amber-900 hover:text-amber-950 data-[state=inactive]:hover:bg-amber-100'
          )}
        >
          <Zap
            className={cn(
              'w-5 h-5',
              temporaryCount > 0 && currentView !== 'temporary'
                ? 'text-amber-700'
                : 'text-current'
            )}
          />
          Temporary products
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
              temporaryCount > 0
                ? currentView === 'temporary'
                  ? 'bg-primary-foreground text-primary'
                  : 'bg-amber-500 text-white'
                : 'bg-background/60 text-muted-foreground'
            )}
          >
            {temporaryCount}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="campaigns"
          className={cn(
            'group inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Tag className="w-5 h-5" />
          Campaigns
          {campaignsCount !== null ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                'bg-background/60 text-muted-foreground',
                'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
              )}
              title={`${campaignIndividualCount ?? 0} discounts · ${campaignGroupCount ?? 0} groups`}
            >
              {campaignsCount}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger
          value="stock"
          className={cn(
            'inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Boxes className="w-5 h-5" />
          Stock
          {typeof stockAlertCount === 'number' && stockAlertCount > 0 ? (
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
                'bg-destructive text-white'
              )}
              title={`${stockAlertCount} open stock alert${stockAlertCount === 1 ? '' : 's'}`}
            >
              {stockAlertCount}
            </span>
          ) : null}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
