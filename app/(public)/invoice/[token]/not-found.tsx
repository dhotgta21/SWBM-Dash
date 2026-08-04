// app/(public)/invoice/[token]/not-found.tsx
// Shown when the share token is missing, malformed, disabled, or unknown.

import Link from 'next/link'

export default function PublicInvoiceNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full bg-card border border-border rounded-lg shadow-sm p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-destructive-muted flex items-center justify-center mb-4">
          <span className="text-2xl font-bold text-destructive">!</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">Invoice not available</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This link is invalid, has expired, or sharing has been turned off for this
          invoice. Please contact the sender if you believe this is a mistake.
        </p>
        <div className="mt-6 text-xs text-muted-foreground">
          Demo Builder Merchant
        </div>
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">Are you the sender?</p>
          <Link
            href="/invoices"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open the dashboard and check sharing settings
          </Link>
        </div>
      </div>
    </div>
  )
}
