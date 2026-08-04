'use client'

import { cn } from '@/lib/utils'
import { type CampaignStatus } from '@/lib/products/sale'

interface CampaignStatusBadgeProps {
  status: CampaignStatus
  className?: string
}

export function CampaignStatusBadge({ status, className }: CampaignStatusBadgeProps) {
  const config: Record<CampaignStatus, { label: string; className: string; dot?: string }> = {
    draft: {
      label: 'Draft',
      className: 'bg-muted text-muted-foreground',
    },
    scheduled: {
      label: 'Scheduled',
      className: 'bg-info-muted text-info',
    },
    live: {
      label: 'Live',
      className: 'bg-success-muted text-success',
      dot: 'bg-success animate-pulse',
    },
    paused: {
      label: 'Paused',
      className: 'bg-warning-muted text-warning',
    },
    ended: {
      label: 'Ended',
      className: 'bg-muted text-muted-foreground',
    },
  }

  const { label, className: badgeClass, dot } = config[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        badgeClass,
        className
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {label}
    </span>
  )
}
