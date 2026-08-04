'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { markClientReviewed } from '@/lib/actions/clients'
import { CheckCircle2 } from 'lucide-react'

interface MarkReviewedButtonProps {
  clientId: string
}

export function MarkReviewedButton({ clientId }: MarkReviewedButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    const result = await markClientReviewed(clientId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={loading}
        className="gap-2"
      >
        <CheckCircle2 className="h-4 w-4" />
        {loading ? 'Marking...' : 'Mark as reviewed'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
