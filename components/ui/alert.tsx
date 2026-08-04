import * as React from 'react'
import { cn } from '@/lib/utils'

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info'
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-muted text-foreground border-border',
      destructive: 'bg-destructive-muted text-destructive border-destructive/20',
      success: 'bg-success-muted text-success border-success/20',
      warning: 'bg-warning-muted text-warning border-warning/20',
      info: 'bg-info-muted text-info border-info/20',
    }

    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'relative w-full rounded-lg border p-4 text-sm',
          variantClasses[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Alert.displayName = 'Alert'

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    // `truncate` = overflow-hidden + text-ellipsis + whitespace-nowrap.
    // We force a single line on every auth-page alert so a long error
    // message (server-side i18n, dynamic Supabase error, etc.) can
    // never push the rest of the form down and reflow the page. The
    // auth copy is short enough to fit at the card's max-w-md width
    // without clipping, so this is a layout safety net rather than a
    // normal truncation path.
    className={cn('truncate text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
))
AlertDescription.displayName = 'AlertDescription'

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
))
AlertTitle.displayName = 'AlertTitle'

export { Alert, AlertDescription, AlertTitle }
