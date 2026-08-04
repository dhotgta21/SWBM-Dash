// components/ui/PageHeader.tsx
// Shared page-header used by every /dashboard/* and /portal/* page.
//
// Matches the eyebrow-chip + title + subtitle + side-action pattern
// the dashboard's revenue / overview section uses. Keeps the page
// hierarchy consistent so users learn one header shape across the
// product.

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  /** Optional category chip shown above the title (e.g. "Revenue", "Catalog"). */
  eyebrow?: ReactNode
  /** Title text. */
  title: string
  /** Optional one-line subtitle / lede. */
  description?: ReactNode
  /**
   * Optional content for the right-hand side of the header. Typically
   * a primary CTA button, a stat badge, or filter pills. Stacks below
   * the title on mobile.
   */
  actions?: ReactNode
  /** Optional stat row rendered below the title block (KPIs etc.). */
  stats?: ReactNode
  /** Class passthrough. */
  className?: string
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-5 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between',
        className
      )}
    >
      <div className="space-y-2">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
        {stats ? <div className="pt-2">{stats}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
      ) : null}
    </header>
  )
}

/** Small reusable eyebrow chip — a 1.5×1.5 dot + label, matching the
 *  dashboard's "Revenue" / "Catalog" pattern. */
export function EyebrowChip({
  label,
  tone = 'primary',
}: {
  label: string
  tone?: 'primary' | 'info' | 'success' | 'warning' | 'destructive'
}) {
  const dotColor = {
    primary: 'bg-primary',
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider',
        tone === 'primary' && 'bg-primary-muted text-primary',
        tone === 'info' && 'bg-info-muted text-info',
        tone === 'success' && 'bg-success-muted text-success',
        tone === 'warning' && 'bg-warning-muted text-warning',
        tone === 'destructive' && 'bg-destructive-muted text-destructive'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} />
      {label}
    </span>
  )
}