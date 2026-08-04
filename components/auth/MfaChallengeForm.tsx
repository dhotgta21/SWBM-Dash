// components/auth/MfaChallengeForm.tsx
// Second step of staff/admin sign-in when TOTP 2FA is enabled.
// Clients, pickers and drivers never use this flow.

'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { verifyMfaLogin } from '@/lib/actions/mfa'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'

interface MfaChallengeFormProps {
  factorId: string
  factorName?: string
}

export function MfaChallengeForm({
  factorId,
  factorName = 'Authenticator app',
}: MfaChallengeFormProps) {
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.set('factor_id', factorId)
    formData.set('code', code)
    formData.set('login_type', 'operator')

    const result = await verifyMfaLogin(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      setCode('')
    }
    // On success the server action redirects.
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    try {
      // Clears the AAL1 session so the user returns to a clean password form.
      await signOut()
    } catch {
      // signOut redirects; if it somehow returns, fall through.
      setCancelling(false)
    }
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/10 ring-1 ring-primary/15">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the 6-digit code from {factorName} to finish signing in.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Authentication code</Label>
            <Input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={loading || cancelling}
              className="font-mono tracking-widest text-lg text-center"
            />
            <p className="text-xs text-muted-foreground text-center">
              Open Google Authenticator or Microsoft Authenticator on your phone.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || cancelling || code.length !== 6}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying…
              </span>
            ) : (
              'Verify and continue'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={loading || cancelling}
            onClick={handleCancel}
          >
            {cancelling ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cancelling…
              </span>
            ) : (
              'Back to sign in'
            )}
          </Button>
        </form>
      </CardContent>
    </AuthCard>
  )
}
