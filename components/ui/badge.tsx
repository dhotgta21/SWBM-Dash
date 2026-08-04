// components/ui/badge.tsx
// Small status pill. Variants match the semantic colour tokens so
// they read consistently across the dashboard.

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-foreground',
        primary: 'bg-primary/10 text-primary',
        success: 'bg-success-muted text-success',
        warning: 'bg-warning-muted text-warning',
        destructive: 'bg-destructive-muted text-destructive',
        info: 'bg-info-muted text-info',
        outline: 'border border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
