// components/auth/ResetPasswordForm.tsx
// Password-reset form. Demo package: no captcha / Turnstile.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Mail } from 'lucide-react'
import { resetPassword } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'

interface ResetPasswordFormProps {
  /** @deprecated Demo never uses captcha. */
  turnstileSiteKey?: string | null
}

export function ResetPasswordForm(_props: ResetPasswordFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(false)
    const result = await resetPassword(formData)
    if (result?.error) {
      setError(
        /captcha|turnstile|security check/i.test(result.error)
          ? 'Could not start password reset. Please try again.'
          : result.error
      )
    } else if (result?.success) {
      setSuccess(true)
    }
    setLoading(false)
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-info/10 text-info shadow-sm shadow-info/10 ring-1 ring-info/15">
          <Mail className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle>Reset password</CardTitle>
          <CardDescription>We will send you a reset link</CardDescription>
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
              <AlertDescription>
                If that email is registered, a reset link was prepared. Check server logs on demo
                deploys (email is not sent).
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@example.com" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </span>
            ) : (
              'Send reset link'
            )}
          </Button>
          <div className="text-center text-sm">
            <Link href="/login" className="font-medium text-primary hover:text-primary-hover">
              Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </AuthCard>
  )
}
