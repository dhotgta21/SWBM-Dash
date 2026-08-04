'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { claimFirstAdmin } from '@/lib/actions/setup'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function FirstAdminPrompt() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClaim() {
    setLoading(true)
    setError(null)

    const result = await claimFirstAdmin()
    setLoading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Refresh the page so the new role is picked up and the prompt disappears.
    router.refresh()
  }

  return (
    <Alert className="mb-6 border-primary/20 bg-primary/5">
      <ShieldCheck className="h-5 w-5 text-primary" />
      <div className="flex-1">
        <h3 className="font-medium text-foreground">No administrator account exists yet</h3>
        <AlertDescription className="mt-1 text-muted-foreground">
          You are the only user in the system. Claim administrator access to unlock Settings and
          team management.
        </AlertDescription>
        {error && (
          <p className="mt-2 text-sm text-destructive">{error}</p>
        )}
        <div className="mt-3">
          <Button onClick={handleClaim} disabled={loading} size="sm">
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Claiming...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Claim admin access
              </span>
            )}
          </Button>
        </div>
      </div>
    </Alert>
  )
}
