'use client'

import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface SelectableOptionCardProps {
  icon: LucideIcon
  title: string
  description?: string
  selected?: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
}

/**
 * Consistent card-style option used by the document-type pickers
 * (Download, Preview, Print) and the WhatsApp share target picker.
 *
 * Selected cards get the primary border/background treatment;
 * unselected cards use the standard card border and a hover state.
 */
export function SelectableOptionCard({
  icon: Icon,
  title,
  description,
  selected = false,
  onClick,
  disabled = false,
  className,
}: SelectableOptionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full rounded-lg border px-3 py-3 text-left transition-colors flex items-start gap-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-foreground hover:bg-secondary',
        className
      )}
    >
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-primary" />
      <span className="text-sm font-medium leading-tight">
        {title}
        {description && (
          <span className="block text-xs font-normal text-muted-foreground mt-0.5 leading-snug">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}
