import { cn } from '@/lib/utils'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  message: string
  hint?: string
  className?: string
  iconClassName?: string
}

export function EmptyState({ message, hint, className, iconClassName }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-48 flex-col items-center justify-center text-center',
        className
      )}
    >
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <Inbox className={cn('h-5 w-5', iconClassName)} />
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
