// components/auth/UpdatePasswordForm.tsx
// Form shown after the user clicks a recovery link in their email.
// /auth/callback exchanges the ?code=… for a session first, then
// redirects here so the session cookie is present when the form submits.
//
// Uses the shared AuthCard treatment so the post-recovery screen
// reads as a continuation of /reset-password, /login, etc. A
// KeyRound icon badge signals "set a new key" without text-only
// ambiguity. The badge uses the info/calm tone because this is a
// follow-up to a request the user just made.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2 } from 'lucide-react'
import { updatePassword } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'

interface UpdatePasswordFormProps {
  exchangeError?: string | null
  /**
   * Where the user lands after their password is saved and the recovery
   * session is signed out. Resolved by the parent page from the user's role:
   *   - client             → '/login?welcome=1'
   *   - admin/staff/picker → `${ADMIN_LOGIN_PATH}?welcome=1`
   * Defaults to the client login so a missing prop can't strand an operator.
   */
  nextPath?: string
  /**
   * Where "Back to sign in" should send the user (the same route WITHOUT
   * the welcome flag). Operators (admin / staff / picker) go to the hidden
   * admin URL; clients go to /login.
   */
  backHref?: string
}

export function UpdatePasswordForm({
  exchangeError,
  nextPath = '/login?welcome=1',
  backHref = '/login',
}: UpdatePasswordFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const result = await updatePassword(formData)
    setLoading(false)
    if (result?.error) {
      setError(result.error)
      return
    }

    // updatePassword() signs the user out internally — recovery sessions are
    // single-use. Send them to the right sign-in screen (resolved by role in
    // the page) with a welcome flag. Navigating away here (instead of staying
    // on /update-password) is what stops the page's no-session guard from
    // bouncing the user back to /reset-password after the password is saved.
    setSuccess(true)
    setTimeout(() => {
      router.push(nextPath)
      router.refresh()
    }, 800)
  }

  if (exchangeError) {
    return (
      <AuthCard>
        <CardHeader className="space-y-5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive shadow-sm shadow-destructive/10 ring-1 ring-destructive/15">
            <KeyRound className="h-5 w-5" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <CardTitle>Reset link invalid</CardTitle>
            <CardDescription>The password reset link could not be used</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>{exchangeError}</AlertDescription>
          </Alert>
          <div className="mt-5 text-center text-sm">
            <Link
              href="/reset-password"
              className="font-medium text-primary hover:text-primary-hover"
            >
              Request a new reset link
            </Link>
          </div>
        </CardContent>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-info/10 text-info shadow-sm shadow-info/10 ring-1 ring-info/15">
          <KeyRound className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle>New password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert variant="success">
              <AlertDescription>Password saved. Taking you to sign in…</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" minLength={8} required disabled={loading || success} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required disabled={loading || success} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || success}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </span>
            ) : (
              'Update password'
            )}
          </Button>
          <div className="text-center text-sm">
            <Link href={backHref} className="font-medium text-primary hover:text-primary-hover">
              Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </AuthCard>
  )
}
