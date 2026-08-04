// components/auth/ClientLoginForm.tsx
// Client portal login. Demo package: no captcha / Turnstile.

'use client'

import { useState } from 'react'
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
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

const ERROR_MESSAGES: Record<string, string> = {
  inactive: 'Account deactivated. Contact an admin.',
  session_expired: 'Session expired. Sign in again.',
  wrong_account: 'This account cannot use this page.',
}

interface ClientLoginFormProps {
  /** @deprecated Demo never uses captcha. */
  turnstileSiteKey?: string | null
}

export function ClientLoginForm(_props: ClientLoginFormProps) {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const justActivated = searchParams.get('welcome') === '1'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    urlError ? (ERROR_MESSAGES[urlError] ?? urlError) : null
  )

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await signIn(formData)
    if (result?.error) {
      const message =
        typeof result.error === 'string' && result.error.trim()
          ? result.error
          : 'Sign-in failed. Please try again.'
      setError(/captcha|turnstile|security check/i.test(message) ? 'Invalid email or password.' : message)
      setLoading(false)
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
          <CardDescription>Sign in to view your invoices and account.</CardDescription>
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
