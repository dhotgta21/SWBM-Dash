// components/quote-requests/QuoteStatusPill.tsx
// Maps a quote_requests.status string to a Badge variant + label.
// Centralised so the list page and detail page show the same chip.

import { Badge } from '@/components/ui/badge'

interface QuoteStatusPillProps {
  status: string
}

const LABELS: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info' }> = {
  pending:   { label: 'Pending',   variant: 'warning' },
  reviewed:  { label: 'Reviewed',  variant: 'info' },
  invoiced:  { label: 'Invoiced',  variant: 'success' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'default' },
}

export function QuoteStatusPill({ status }: QuoteStatusPillProps) {
  const def = LABELS[status] ?? { label: status, variant: 'default' as const }
  return <Badge variant={def.variant}>{def.label}</Badge>
}
