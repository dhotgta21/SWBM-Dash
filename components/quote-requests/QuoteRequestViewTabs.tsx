// components/quote-requests/QuoteRequestViewTabs.tsx
// Top-level navigation between the Quote & order requests overview
// (KPI cards + charts) and the actionable inbox (filter chips + list).
//
// Why a separate component from QuoteRequestTabs:
//   * ViewTabs changes the entire page content (dashboard vs list).
//   * QuoteRequestTabs is a sub-filter inside the inbox (kind + status).
//   They sit at different levels of the page hierarchy and the styling
//   reflects that — ViewTabs uses solid pill fills for the active tab
//   (top-level), QuoteRequestTabs uses tinted pills (subordinate).
//
// Link-based navigation (server component) so the existing deep-links
// (?view=, ?kind=, ?status=) keep working unchanged.

import Link from 'next/link'
import { LayoutDashboard, Inbox, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type QuoteRequestView = 'overview' | 'requests'

const VIEW_OPTIONS: { value: QuoteRequestView; label: string; icon: LucideIcon }[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'requests', label: 'Requests', icon: Inbox },
]

interface QuoteRequestViewTabsProps {
  view: QuoteRequestView
  viewHref: (v: QuoteRequestView) => string
}

export function QuoteRequestViewTabs({ view, viewHref }: QuoteRequestViewTabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-sm overflow-x-auto max-w-full">
      <nav
        aria-label="Quote requests view"
        className="flex items-center gap-1"
      >
        {VIEW_OPTIONS.map((opt) => {
          const isActive = view === opt.value
          const Icon = opt.icon
          return (
            <Link
              key={opt.value}
              href={viewHref(opt.value)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2.5 rounded-lg px-5 py-3 text-base font-semibold transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
            >
              <Icon className="h-5 w-5" />
              {opt.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
