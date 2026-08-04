'use client'

// Dashboard banner listing invoices with unresolved picker short-shipments.
// Payment is blocked on these invoices until office staff resolves the
// review on the invoice page.

import Link from 'next/link'
import { AlertTriangle, PackageX } from 'lucide-react'

export interface ShortShipReviewRow {
  invoiceId: string
  documentNumber: string
  itemCount: number
}

export function ShortShipReviewBanner({ reviews }: { reviews: ShortShipReviewRow[] }) {
  if (!reviews || reviews.length === 0) return null

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <h2 className="font-semibold">
          {reviews.length} {reviews.length === 1 ? 'invoice needs' : 'invoices need'} review — items
          short-shipped
        </h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Pickers marked items out of stock on these orders. Payment is blocked until the shortage
        is reviewed on the invoice.
      </p>
      <ul className="space-y-2">
        {reviews.map((review) => (
          <li
            key={review.invoiceId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`/invoices/${review.invoiceId}`}
                className="font-medium text-primary hover:underline"
              >
                {review.documentNumber}
              </Link>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <PackageX className="h-3.5 w-3.5" />
                {review.itemCount} {review.itemCount === 1 ? 'item' : 'items'} short
              </p>
            </div>
            <Link
              href={`/invoices/${review.invoiceId}`}
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Review →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
