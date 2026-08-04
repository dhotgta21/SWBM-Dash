'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Lock, Eye, EyeOff } from 'lucide-react'
import { verifyInvoiceSharePassword } from '@/lib/actions/invoices'
import { PublicInvoiceView } from './PublicInvoiceView'
import type { InvoicePdfProps } from '@/components/invoices/InvoicePdfTemplate'

interface PublicInvoicePasswordGateProps {
  token: string
  mode?: 'invoice' | 'delivery-note'
}

export function PublicInvoicePasswordGate({ token, mode = 'invoice' }: PublicInvoicePasswordGateProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState<{
    invoice: InvoicePdfProps['invoice'] & { share_token: string }
    company: InvoicePdfProps['company']
    bankDetails: InvoicePdfProps['bankDetails']
  } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading || !password.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifyInvoiceSharePassword(token, password.trim(), mode)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.invoice && result.company) {
        setUnlocked({
          invoice: result.invoice as InvoicePdfProps['invoice'] & { share_token: string },
          company: result.company as InvoicePdfProps['company'],
          bankDetails: (result.bankDetails ?? {}) as InvoicePdfProps['bankDetails'],
        })
      } else {
        setError('Could not load the document. Please try again.')
      }
    } catch (err) {
      console.error('Password verification failed:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (unlocked) {
    return (
      <PublicInvoiceView
        invoice={unlocked.invoice}
        company={unlocked.company}
        bankDetails={unlocked.bankDetails}
        logoSrc="/Logo.webp"
        mode={mode === 'delivery-note' ? 'delivery-note' : undefined}
        downloadToken={token}
        downloadPassword={password}
      />
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Password protected document</CardTitle>
          <CardDescription>
            This document is private. Enter the password supplied by the sender to view it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-password">Password</Label>
              <div className="relative">
                <Input
                  id="share-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading || !password.trim()}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Checking…
                </>
              ) : (
                'View document'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
