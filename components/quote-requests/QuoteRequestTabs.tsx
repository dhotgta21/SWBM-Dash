// components/quote-requests/QuoteRequestTabs.tsx
// Nested filter control for the Quote & order requests inbox.
//
//   ┌─ Primary tabs (the "main" tab) ───────── All · Orders · Quotes
//   └─ Sub-tabs (filter within the kind) ───── All · Pending · Reviewed · …
//
// Status is visually subordinate to kind: a smaller, tinted pill row that
// sits beneath the solid primary segmented control inside one bordered
// surface. Navigation is link-based (server component) so the existing
// ?kind=&status= deep-links and metadata keep working unchanged.

import Link from 'next/link'
import { Inbox, ShoppingCart, FileSignature, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_ORDER, STATUS_STYLE, type QuoteRequestStatus } from '@/lib/quote-request-status'

export type QuoteKindFilter = 'all' | 'order' | 'quote'
export type QuoteStatusFilter = 'all' | QuoteRequestStatus

const KIND_OPTIONS: { value: QuoteKindFilter; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'All', icon: Inbox },
  { value: 'order', label: 'Orders', icon: ShoppingCart },
  { value: 'quote', label: 'Quotes', icon: FileSignature },
]

const STATUS_OPTIONS: QuoteStatusFilter[] = ['all', ...STATUS_ORDER]

interface QuoteRequestTabsProps {
  kind: QuoteKindFilter
  status: QuoteStatusFilter
  kindHref: (k: QuoteKindFilter) => string
  statusHref: (s: QuoteStatusFilter) => string
}

export function QuoteRequestTabs({
  kind,
  status,
  kindHref,
  statusHref,
}: QuoteRequestTabsProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
      {/* Primary — kind (All / Orders / Quotes). Solid fill when active so it
          reads as the top-level tab. */}
      <nav
        aria-label="Filter by request kind"
        className="flex items-center gap-1 overflow-x-auto"
      >
        <span className="shrink-0 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Show
        </span>
        <div className="flex items-center gap-1">
          {KIND_OPTIONS.map((opt) => {
            const isActive = kind === opt.value
            const Icon = opt.icon
            return (
              <Link
                key={opt.value}
                href={kindHref(opt.value)}
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
        </div>
      </nav>

      {/* Sub — status, nested under the active kind. Lighter tinted pills so
          they read as children of the primary control above. */}
      <div className="mt-2 border-t border-border/60 pt-2">
        <nav
          aria-label="Filter by status"
          className="flex items-center gap-1 overflow-x-auto"
        >
          <span className="shrink-0 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_OPTIONS.map((s) => {
              const isActive = status === s
              const dot = s === 'all' ? null : STATUS_STYLE[s].color
              const label = s === 'all' ? 'All' : STATUS_STYLE[s].label
              return (
                <Link
                  key={s}
                  href={statusHref(s)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/70'
                  )}
                >
                  {dot ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: dot }}
                      aria-hidden
                    />
                  ) : null}
                  {label}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
