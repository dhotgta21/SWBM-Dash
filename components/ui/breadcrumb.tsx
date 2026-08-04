// components/ui/breadcrumb.tsx
// Lightweight visible breadcrumb trail. Complements the JSON-LD
// BreadcrumbList with an accessible nav for users and search engines.

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  readonly items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="py-4">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={index} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              {isLast || !item.href ? (
                <span className={isLast ? 'font-medium text-foreground' : undefined}>{item.label}</span>
              ) : (
                <Link href={item.href} className="transition-colors hover:text-primary">
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
