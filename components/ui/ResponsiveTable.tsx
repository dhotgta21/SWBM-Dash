// components/ui/ResponsiveTable.tsx
// Responsive data table helper.
//
// Renders a real <table> on md+ and a stacked card/list layout below md.
// Callers provide both the desktop table JSX and a per-row mobile card so
// each page can keep its own link/status/money logic without duplication.

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ResponsiveTableProps<T> {
  rows: T[]
  keyField: keyof T
  renderDesktop: (rows: T[]) => React.ReactNode
  renderMobile: (row: T) => React.ReactNode
  emptyState?: React.ReactNode
  className?: string
}

export function ResponsiveTable<T>({
  rows,
  keyField,
  renderDesktop,
  renderMobile,
  emptyState,
  className,
}: ResponsiveTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <div className={className}>{emptyState}</div>
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="hidden md:block overflow-x-auto">{renderDesktop(rows)}</div>
      <ul className="md:hidden divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
        {rows.map((row) => (
          <li key={String(row[keyField])}>{renderMobile(row)}</li>
        ))}
      </ul>
    </div>
  )
}
