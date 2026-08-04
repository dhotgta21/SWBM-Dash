// components/auth/AdminLoginForm.tsx
// Operator login form rendered by the server admin-login page.

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'
import { signIn } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'
import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm'
import { TurnstileCaptcha, type TurnstileCaptchaRef } from '@/components/turnstile/TurnstileCaptcha'

// Keep every entry to ≤ ~50 chars so it fits on a single line at
// the auth card's max-w-md width (≈ 416 px at 14 px text-sm). The
// Alert itself also enforces a 1-line max with ellipsis, but
// short copy first means no clipping for the common cases.
const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Account deactivated. Contact an admin.',
  session_expired: 'Session expired. Sign in again.',
  mfa_required: 'Enter your authenticator code to finish signing in.',
}

interface AdminLoginFormProps {
  turnstileSiteKey?: string | null
  /** When the session is AAL1 but MFA is enrolled (e.g. after a refresh). */
  pendingMfa?: { factorId: string; factorName: string } | null
}

export function AdminLoginForm({ turnstileSiteKey, pendingMfa = null }: AdminLoginFormProps) {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const justActivated = searchParams.get('welcome') === '1'

  const [loading, setLoading] = useState(false)
  // mfa_required is only meaningful when we already have a pending challenge to show.
  const initialError =
    urlError === 'mfa_required' && pendingMfa
      ? null
      : urlError
        ? (ERROR_MESSAGES[urlError] ?? urlError)
        : null
  const [error, setError] = useState<string | null>(initialError)
  const [mfa, setMfa] = useState<{ factorId: string; factorName: string } | null>(
    pendingMfa ?? null
  )
  const turnstileRef = useRef<TurnstileCaptchaRef>(null)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signIn(formData)
    if (result?.error) {
      // Always coerce to a readable string (never show raw "{}" objects).
      const message =
        typeof result.error === 'string' && result.error.trim() && result.error.trim() !== '{}'
          ? result.error
          : 'Sign-in failed. Please try again.'
      setError(message)
      setLoading(false)
      // Turnstile tokens are single-use. Reset the widget so the next attempt
      // gets a fresh token instead of re-submitting the consumed one.
      turnstileRef.current?.reset()
      return
    }
    if (result?.mfaRequired && result.factorId) {
      setMfa({
        factorId: result.factorId,
        factorName: result.factorName || 'Authenticator app',
      })
      setLoading(false)
      return
    }
    // Successful password-only sign-in redirects server-side.
  }

  if (mfa) {
    return <MfaChallengeForm factorId={mfa.factorId} factorName={mfa.factorName} />
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/10 ring-1 ring-primary/15">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Staff sign in</CardTitle>
          <CardDescription>
            Operator portal for the Demo Builder Merchant team.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="login_type" value="operator" />
          {justActivated && (
            <Alert variant="success">
              <AlertDescription>
                Your password is set. Sign in below to open the operator dashboard.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          {turnstileSiteKey ? (
            <TurnstileCaptcha ref={turnstileRef} siteKey={turnstileSiteKey} />
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
        <div className="mt-5 text-center text-sm">
          <Link href="/reset-password" className="font-medium text-primary hover:text-primary-hover">
            Forgot password?
          </Link>
        </div>
      </CardContent>
    </AuthCard>
  )
}
