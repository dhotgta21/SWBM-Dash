'use client'

import { useState } from 'react'
import { convertQuoteToInvoice } from '@/lib/actions/invoices'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ConvertQuoteButton({ quoteId }: { quoteId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConvert() {
    if (!confirm('Convert this quotation to an invoice?')) return
    setLoading(true)
    setError(null)
    const result = await convertQuoteToInvoice(quoteId)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (result.invoice) {
      window.location.href = `/invoices/${result.invoice.id}`
    }
  }

  return (
    <div className="space-y-2">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="button" className="w-full" onClick={handleConvert} disabled={loading}>
        {loading ? 'Converting...' : 'Convert to Invoice'}
      </Button>
    </div>
  )
}
