'use client'

import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { logClientError } from '@/lib/actions/log-error'

interface ProductsErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Error boundary for the /admin/products route.
 *
 * Catches both server-render and client-render failures and gives the
 * operator a clear recovery action instead of the generic Next.js error
 * page. The full error is logged to the console so it can be reported
 * back for diagnosis.
 */
export default function ProductsError({ error, reset }: ProductsErrorProps) {
  useEffect(() => {
    console.error('Products page error:', error)
    logClientError(error.message, error.digest, error.stack).catch(() => {
      // Ignore logging failures so the UI still renders.
    })
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-lg font-semibold text-foreground">
        Could not load products
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Something went wrong while loading this page. Please try again, or
        contact support if the problem persists.
      </p>
      {error.digest ? (
        <p className="mt-4 text-xs font-mono text-muted-foreground">
          Error digest: {error.digest}
        </p>
      ) : null}
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  )
}
