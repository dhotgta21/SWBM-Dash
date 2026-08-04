// components/shop/BreadcrumbNav.tsx
// Visible breadcrumb trail for public-shop pages. Does NOT emit JSON-LD —
// pages should emit the matching BreadcrumbList schema separately so the
// visible trail and structured data stay in sync.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  readonly label: string
  readonly href?: string
}

interface BreadcrumbNavProps {
  readonly items: readonly BreadcrumbItem[]
  readonly className?: string
}

export function BreadcrumbNav({ items, className }: BreadcrumbNavProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('mb-8', className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-foreground/70">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="contents">
              {index > 0 && (
                <span aria-hidden="true">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    isLast && 'font-medium text-foreground'
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
