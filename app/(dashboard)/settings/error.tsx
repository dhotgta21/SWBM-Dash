'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SettingsErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Settings page error:', error)
  }, [error])

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage company details and team access</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The settings page failed to load. This is usually caused by stale code, a missing
            environment variable, or a temporary database issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {error.message || 'An unexpected error occurred while loading settings.'}
              {error.digest && (
                <span className="block mt-1 font-mono text-xs">Digest: {error.digest}</span>
              )}
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            If the problem persists, restart the dev server (or redeploy) to ensure the latest
            settings form changes are active.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
