// components/quote-requests/KindPill.tsx
// Visual chip for the request kind (Order vs Quote). Used in the
// dashboard list and detail pages so operators can tell at a glance
// whether the customer wants a direct order or a written quote.
//
// Document-number prefixes already encode the kind (`OR-` vs `QR-`)
// but a pill is faster to scan than reading a prefix.

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface KindPillProps {
  kind: 'quote' | 'order' | string
  className?: string
}

export function KindPill({ kind, className }: KindPillProps) {
  if (kind === 'order') {
    return (
      <Badge variant="info" className={cn('tracking-wide', className)}>
        Order
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className={cn('tracking-wide', className)}>
      Quote
    </Badge>
  )
}