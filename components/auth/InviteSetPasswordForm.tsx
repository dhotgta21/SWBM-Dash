'use client'

// components/auth/InviteSetPasswordForm.tsx
// The "set your password" form shown to a freshly-invited user after they
// click the link in the staff-invite or client-portal-confirm email.
//
// Visual language matches the rest of the auth surfaces via the shared
// AuthCard wrapper — the blue→red top accent ribbon, the soft corner
// glows, the primary-tinted shield badge signalling "this unlocks a
// portal".
//
// The password rules and length check are mirrored client-side for fast
// feedback, but Supabase is the source of truth — its response flows
// back through `sanitizeAuthError()` in lib/actions/auth.ts.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { updatePassword } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AuthCard } from '@/components/auth/AuthCard'
import { cn } from '@/lib/utils'

interface InviteSetPasswordFormProps {
  /** True when the recovery/invite session expired before submit. */
  sessionExpired?: boolean
  /** The verified email address, shown next to the title. */
  email: string
  /**
   * Where the user lands after their password is saved and the recovery
   * session is signed out. Set by the parent page based on role:
   *   - client    → '/login?welcome=1'
   *   - staff/admin → `${ADMIN_LOGIN_PATH}?welcome=1`
   */
  nextPath: string
  /**
   * Where the "Back to sign in" link should send the user (the same
   * route WITHOUT the welcome flag). Splitting this from `nextPath`
   * avoids ad-hoc URL parsing in the form.
   */
  backHref: string
  /** The user's role — drives the welcome copy. */
  role?: 'staff' | 'admin' | 'picker' | 'driver' | 'client' | null
}

// Mirror of the Supabase-side minimum length so the helper text and the
// local "too short" check agree. Supabase is still the source of truth
// — this just lets us give instant feedback before the round trip.
const MIN_PASSWORD_LENGTH = 8

// Lightweight password strength heuristic. Not zxcvbn-grade — but it
// gives the user honest feedback (length, character variety) without
// shipping another dependency. Each satisfied rule bumps the score.
type StrengthLevel = 'too-weak' | 'fair' | 'good' | 'strong'

function scorePassword(value: string): { score: 0 | 1 | 2 | 3; level: StrengthLevel } {
  if (!value) return { score: 0, level: 'too-weak' }
  let score = 0
  if (value.length >= MIN_PASSWORD_LENGTH) score++
  if (value.length >= 12) score++
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++
  if (/\d/.test(value)) score++
  if (/[^A-Za-z0-9]/.test(value)) score++
  // Cap at the visualised maximum so the bar doesn't overflow.
  const clamped = Math.min(score, 3) as 0 | 1 | 2 | 3
  const level: StrengthLevel =
    clamped === 0 ? 'too-weak' : clamped === 1 ? 'fair' : clamped === 2 ? 'good' : 'strong'
  return { score: clamped, level }
}

const STRENGTH_STYLES: Record<StrengthLevel, { bar: string; label: string }> = {
  'too-weak': { bar: 'bg-destructive', label: 'Too short' },
  fair: { bar: 'bg-warning', label: 'Fair' },
  good: { bar: 'bg-info', label: 'Good' },
  strong: { bar: 'bg-success', label: 'Strong' },
}

export function InviteSetPasswordForm({
  sessionExpired,
  email,
  nextPath,
  backHref,
  role,
}: InviteSetPasswordFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(
      sessionExpired
        ? 'Sign-in expired. Use the link in your invite email.'
        : null
    )
  const [success, setSuccess] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)

  const strength = useMemo(() => scorePassword(password), [password])

  // Friendlier role copy — what surface we're unlocking.
  const portalLabel =
    role === 'picker'
      ? 'warehouse picking app'
      : role === 'staff' || role === 'admin'
        ? 'operator dashboard'
        : role === 'client'
          ? 'client portal'
          : 'account'

  // Rule checklist. We render the check / x icons in real time so the
  // user sees exactly which rule still needs attention before they
  // submit.
  const rules = [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains a symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ]

  const passwordsMatch = password === confirm && password.length > 0

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    setSuccess(false)
    setTouched(true)

    // Local mirror of the server rules. Supabase still enforces them on
    // save — this is purely UX so obvious mistakes fail fast.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      setLoading(false)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }

    const result = await updatePassword(formData)
    setLoading(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    // updatePassword() signs the user out internally — recovery / invite
    // sessions are single-use. Send them to the right sign-in screen
    // with a welcome flag.
    setSuccess(true)
    setTimeout(() => {
      router.push(nextPath)
      router.refresh()
    }, 800)
  }

  return (
    <AuthCard>
      <CardHeader className="space-y-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm shadow-primary/10 ring-1 ring-primary/15">
          <ShieldCheck className="h-5 w-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl font-bold tracking-tight">Set your password</CardTitle>
          <CardDescription>
            {email ? (
              <>
                Email verified for <span className="font-medium text-foreground">{email}</span>. Set a password to finish activating your {portalLabel}.
              </>
            ) : (
              <>Set a password to finish activating your {portalLabel}.</>
            )}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form action={handleSubmit} className="space-y-4" noValidate>
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
            <Input
              id="password"
              name="password"
              type="password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              disabled={loading || success}
              autoComplete="new-password"
              placeholder="Choose a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched(true)}
              className="bg-white"
            />
            {/* Strength meter — kept subtle so it doesn't compete with
                the primary CTA. Three filled bars = strong. */}
            {password.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-muted">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-full flex-1 rounded-full transition-colors',
                        i < strength.score ? STRENGTH_STYLES[strength.level].bar : 'bg-transparent'
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Strength: <span className="font-medium text-foreground">{STRENGTH_STYLES[strength.level].label}</span>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              minLength={MIN_PASSWORD_LENGTH}
              required
              disabled={loading || success}
              autoComplete="new-password"
              placeholder="Type the same password again"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-white"
              aria-invalid={touched && !passwordsMatch ? true : undefined}
            />
            {touched && confirm.length > 0 && !passwordsMatch && (
              <p className="text-xs text-destructive">Passwords don&apos;t match yet.</p>
            )}
          </div>

          {/* Inline rules checklist. Updates live as the user types so
              they know exactly what they still need to satisfy before
              submit. */}
          <div className="rounded-lg border border-border bg-secondary/40 p-3">
            <div className="text-xs font-medium text-foreground">Your password needs:</div>
            <ul className="mt-2 space-y-1">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={cn(
                    'flex items-center gap-2 text-xs',
                    rule.ok ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {rule.ok ? (
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <X className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button type="submit" className="w-full" disabled={loading || success}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </span>
            ) : success ? (
              'Saved'
            ) : (
              'Set password & continue'
            )}
          </Button>

          <div className="text-center text-sm">
            <Link
              href={backHref}
              className="font-medium text-primary hover:text-primary-hover"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      </CardContent>
    </AuthCard>
  )
}