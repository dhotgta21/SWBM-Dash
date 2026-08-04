'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Users, Zap } from 'lucide-react'

export type ClientView = 'dashboard' | 'accounts' | 'temporary'

interface ClientsViewTabsProps {
  accountsCount: number
  temporaryCount: number
  /**
   * When no `?view=` is set, decide which tab is the landing tab. Defaults to
   * "dashboard" so the operator lands on the aggregate analytics view rather
   * than a long list. The temp tab is auto-selected when there are zero
   * accounts but temps exist (handled at the page level, not here).
   */
  defaultView?: ClientView
  /**
   * The view the server actually resolved when the URL has no `?view=`
   * param (e.g. auto-picked "temporary"). Used for the highlight so the
   * active tab matches the rendered content.
   */
  resolvedView?: ClientView
}

/**
 * URL-synced tab strip for the Clients page. Keeps the active tab in
 * `?view=` so:
 *   - the URL is shareable / bookmarkable (`/clients?view=temporary`)
 *   - the browser back / forward buttons work
 *   - the server-rendered tab content matches the URL on first paint
 *
 * Uses shallow navigation (no full reload, no scroll jump) so flipping
 * between views feels instant.
 */
export function ClientsViewTabs({
  accountsCount,
  temporaryCount,
  defaultView = 'dashboard',
  resolvedView,
}: ClientsViewTabsProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const rawView = searchParams.get('view')
  const currentView: ClientView =
    rawView === 'temporary' || rawView === 'accounts' || rawView === 'dashboard'
      ? rawView
      : (resolvedView ?? 'dashboard')

  function setView(next: ClientView) {
    if (next === currentView) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === defaultView) {
      // Keep the URL clean: the default view is implicit.
      params.delete('view')
    } else {
      params.set('view', next)
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/clients?${qs}` : '/clients', { scroll: false })
    })
  }

  return (
    <Tabs value={currentView} onValueChange={(v) => setView(v as ClientView)}>
      <TabsList className="h-auto p-1.5 gap-1 rounded-xl border border-border bg-card overflow-x-auto max-w-full shadow-sm">
        <TabsTrigger
          value="dashboard"
          className={cn(
            'inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <LayoutDashboard className="w-5 h-5" />
          Client Dashboard
        </TabsTrigger>
        <TabsTrigger
          value="accounts"
          className={cn(
            'group inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary'
          )}
        >
          <Users className="w-5 h-5" />
          Account clients
          <span
            className={cn(
              'inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-[10px] font-semibold',
              'bg-background/60 text-muted-foreground',
              'group-data-[state=active]:bg-primary-foreground group-data-[state=active]:text-primary'
            )}
          >
            {accountsCount}
          </span>
        </TabsTrigger>
        <TabsTrigger
          value="temporary"
          className={cn(
            'group inline-flex items-center gap-2.5 px-5 py-3 rounded-lg text-base font-semibold transition-colors whitespace-nowrap',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-secondary',
            temporaryCount > 0 && currentView !== 'temporary' &&
              'text-amber-900 data-[state=inactive]:hover:text-amber-950 data-[state=inactive]:hover:bg-amber-100'
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
          Temporary clients
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
      </TabsList>
    </Tabs>
  )
}
