'use client'

import Link from 'next/link'
import { MapPin, Hash, Package, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PickerQueueInvoice } from '@/lib/actions/picker'

export function PickerQueueList({ invoices }: { invoices: PickerQueueInvoice[] }) {
  return (
    <div className="p-4 space-y-3">
      <h1 className="px-1 text-lg font-semibold tracking-tight text-foreground">Orders to pick</h1>
      {invoices.map((invoice) => (
        <PickerQueueCard key={invoice.id} invoice={invoice} />
      ))}
    </div>
  )
}

function PickerQueueCard({ invoice }: { invoice: PickerQueueInvoice }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:shadow-foreground/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-semibold text-foreground truncate">{invoice.clientName}</p>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hash className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {invoice.documentNumber}
              {invoice.orderNumber ? ` · ${invoice.orderNumber}` : ''}
            </span>
          </p>
          {invoice.deliveryAddress && (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="line-clamp-2">{invoice.deliveryAddress}</span>
            </p>
          )}
        </div>
        <Badge variant="primary" className="shrink-0 gap-1">
          <Package className="h-3 w-3" />
          {invoice.itemCount} {invoice.itemCount === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
        <Link href={`/picker/${invoice.id}`}>
          Pick order
          <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
      </Button>
    </div>
  )
}
