'use client'

// Shared bottom tab bar for the picker/driver mobile shells. Highlights the
// active tab using the current pathname so warehouse staff always know which
// section they are in.
//
// Icons are passed as names (not components) because the layouts are Server
// Components — component functions cannot cross the server→client boundary.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, Package, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  'clipboard-list': ClipboardList,
  package: Package,
  history: History,
}

export interface BottomTab {
  href: string
  label: string
  icon: keyof typeof ICONS
  /** Match only the exact path (for the section index) vs. nested routes. */
  exact?: boolean
}

export function BottomTabBar({ tabs }: { tabs: BottomTab[] }) {
  const pathname = usePathname()

  const matches = (tab: BottomTab) =>
    tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)

  // Pick the most specific matching tab so e.g. /picker/loads activates
  // "Loads" rather than both "Loads" and the "/picker" prefix tab.
  const activeHref = tabs
    .filter(matches)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav className="shrink-0 sticky bottom-0 z-30 border-t border-border bg-card pb-safe">
      <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((tab) => {
          const active = tab.href === activeHref
          const Icon = ICONS[tab.icon]
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
