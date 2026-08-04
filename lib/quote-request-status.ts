// lib/quote-request-status.ts
// Shared, non-server constants + type for quote-request statuses.
//
// These used to live in lib/quote-request-dashboard.ts (a 'use server' module),
// but Next.js forbids exporting plain objects from a 'use server' file — it
// broke the production build. They are pure data, so they live here where both
// server actions and client components can import them safely.

export type QuoteRequestStatus = 'pending' | 'reviewed' | 'invoiced' | 'rejected' | 'cancelled'

export const STATUS_ORDER: QuoteRequestStatus[] = [
  'pending',
  'reviewed',
  'invoiced',
  'rejected',
  'cancelled',
]

export const STATUS_STYLE: Record<QuoteRequestStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#f59e0b' },
  reviewed: { label: 'Reviewed', color: '#2563eb' },
  invoiced: { label: 'Invoiced', color: '#16a34a' },
  rejected: { label: 'Rejected', color: '#dc2626' },
  cancelled: { label: 'Cancelled', color: '#6b7280' },
}
