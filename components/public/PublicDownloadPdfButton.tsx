// components/public/PublicDownloadPdfButton.tsx
// Client component embedded in the public invoice view. Fetches the PDF
// from the server-side renderer so the public page matches the operator
// view without requiring 'unsafe-eval' in the browser.

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileDown, Loader2 } from 'lucide-react'

interface PublicDownloadPdfButtonProps {
  documentNumber: string
  shareToken: string
  password?: string
  mode?: 'invoice' | 'delivery-note'
}

export function PublicDownloadPdfButton({
  documentNumber,
  shareToken,
  password,
  mode = 'invoice',
}: PublicDownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { shareToken, mode, copies: 1 }
      if (password) {
        body.password = password
      }
      const res = await fetch('/api/invoices/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || `PDF request failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const suffix = mode === 'delivery-note' ? '_delivery_note' : ''
      a.download = `${documentNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate PDF')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleDownload}
        disabled={loading}
        className="w-full sm:w-auto"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4 mr-2" />
        )}
        {loading ? 'Generating PDF…' : 'Download PDF'}
      </Button>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
