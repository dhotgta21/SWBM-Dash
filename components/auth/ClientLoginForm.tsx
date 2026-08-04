// components/auth/ClientLoginForm.tsx
// Client-side login form rendered by the server /login page.
// MFA is admin-only — this form never challenges for 2FA.

'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, LogIn } from 'lucide-react'
import { signIn } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'
import { TurnstileCaptcha, type TurnstileCaptchaRef } from '@/components/turnstile/TurnstileCaptcha'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

// Keep every entry to ≤ ~50 chars so it fits on a single line at
// the auth card's max-w-md width (≈ 416 px at 14 px text-sm). The
// Alert itself also enforces a 1-line max with ellipsis, but
// short copy first means no clipping for the common cases.
const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Account deactivated. Contact an admin.',
  session_expired: 'Session expired. Sign in again.',
  wrong_account: 'This account cannot use this page.',
}

interface ClientLoginFormProps {
  turnstileSiteKey?: string | null
}

export function ClientLoginForm({ turnstileSiteKey }: ClientLoginFormProps) {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const justActivated = searchParams.get('welcome') === '1'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(urlError ? (ERROR_MESSAGES[urlError] ?? urlError) : null)
  const turnstileRef = useRef<TurnstileCaptchaRef>(null)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signIn(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
      // Turnstile tokens are single-use. Reset the widget so the next attempt
      // gets a fresh token instead of re-submitting the consumed one.
      turnstileRef.current?.reset()
    }
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-info/10 text-info shadow-sm shadow-info/10 ring-1 ring-info/15">
          <LogIn className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl font-bold tracking-tight">Client portal</CardTitle>
          <CardDescription>
            Sign in to view your invoices and account.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="login_type" value="client" />
          {justActivated && (
            <Alert variant="success">
              <AlertDescription>
                Your password is set. Sign in below to open your client portal.
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
              className="bg-white"
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
              className="bg-white"
            />
          </div>
          <TurnstileCaptcha ref={turnstileRef} siteKey={turnstileSiteKey ?? undefined} />
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
        <div className="mt-5 flex items-center justify-between text-sm">
          <Link href="/reset-password" className="font-medium text-primary hover:text-primary-hover">
            Forgot password?
          </Link>
          <Link
            href={ADMIN_LOGIN_PATH}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="Staff sign in"
          >
            Staff sign in
          </Link>
        </div>
      </CardContent>
    </AuthCard>
  )
}
