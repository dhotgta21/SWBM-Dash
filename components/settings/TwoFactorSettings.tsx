'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  ShieldOff,
  Loader2,
  Smartphone,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  startMfaEnrollment,
  confirmMfaEnrollment,
  cancelMfaEnrollment,
  disableMfa,
  getMfaStatus,
} from '@/lib/actions/mfa'
import {
  AUTHENTICATOR_APP_LABELS,
  type AuthenticatorApp,
  type MfaEnrollmentStart,
  type MfaFactorSummary,
} from '@/lib/mfa/shared'
import { playSuccessSound, playErrorSound } from '@/lib/sound'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SettingsSection, Subsection } from './SettingsSection'

type Step = 'loading' | 'idle' | 'choose-app' | 'enroll' | 'disable'

const APP_OPTIONS: { value: AuthenticatorApp; label: string; description: string }[] = [
  {
    value: 'google',
    label: 'Google Authenticator',
    description: 'Scan the QR code with the Google Authenticator app on your phone.',
  },
  {
    value: 'microsoft',
    label: 'Microsoft Authenticator',
    description: 'Scan the QR code with Microsoft Authenticator (Outlook / Microsoft account app).',
  },
]

export function TwoFactorSettings() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('loading')
  const [enabled, setEnabled] = useState(false)
  const [factors, setFactors] = useState<MfaFactorSummary[]>([])
  const [selectedApp, setSelectedApp] = useState<AuthenticatorApp>('google')
  const [enrollment, setEnrollment] = useState<MfaEnrollmentStart | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setError(null)
    const result = await getMfaStatus()
    if (result.error) {
      setError(result.error)
      setStep('idle')
      return
    }
    const status = result.status!
    setEnabled(status.enabled)
    setFactors(status.factors.filter((f) => f.status === 'verified'))
    setStep('idle')
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function handleStartEnrollment() {
    setBusy(true)
    setError(null)
    try {
      const result = await startMfaEnrollment(selectedApp)
      if (result.error || !result.enrollment) {
        playErrorSound()
        setError(result.error || 'Could not start two-factor setup.')
        return
      }
      setEnrollment(result.enrollment)
      setCode('')
      setStep('enroll')
    } catch (err) {
      console.error('startMfaEnrollment', err)
      playErrorSound()
      setError('Something went wrong starting two-factor setup.')
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmEnrollment(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setBusy(true)
    setError(null)
    try {
      const result = await confirmMfaEnrollment(enrollment.factorId, code)
      if (result.error) {
        playErrorSound()
        setError(result.error)
        return
      }
      playSuccessSound()
      toast.success('Two-factor authentication enabled', {
        description: `${enrollment.appLabel} is now required when you sign in.`,
      })
      setEnrollment(null)
      setCode('')
      setStep('loading')
      await loadStatus()
      router.refresh()
    } catch (err) {
      console.error('confirmMfaEnrollment', err)
      playErrorSound()
      setError('Something went wrong confirming the authenticator.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelEnrollment() {
    if (!enrollment) {
      setStep('idle')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await cancelMfaEnrollment(enrollment.factorId)
      setEnrollment(null)
      setCode('')
      setStep('idle')
    } catch (err) {
      console.error('cancelMfaEnrollment', err)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    const factor = factors[0]
    if (!factor) return
    setBusy(true)
    setError(null)
    try {
      const result = await disableMfa(factor.id, code)
      if (result.error) {
        playErrorSound()
        setError(result.error)
        return
      }
      playSuccessSound()
      toast.success('Two-factor authentication disabled', {
        description: 'You will only need your password to sign in.',
      })
      setCode('')
      setStep('loading')
      await loadStatus()
      router.refresh()
    } catch (err) {
      console.error('disableMfa', err)
      playErrorSound()
      setError('Something went wrong disabling two-factor authentication.')
    } finally {
      setBusy(false)
    }
  }

  async function copySecret() {
    if (!enrollment?.secret) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy secret. Select and copy it manually.')
    }
  }

  const verifiedLabel =
    factors[0]?.friendlyName ||
    (enabled ? 'Authenticator app' : null)

  return (
    <SettingsSection
      title="Two-factor authentication"
      description="Add an extra sign-in step with Google Authenticator or Microsoft Authenticator so a stolen password alone cannot access the dashboard. Available for admin and staff accounts."
    >
      {step === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking two-factor status…
        </div>
      )}

      {step === 'idle' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">Status</p>
                {enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="outline">Off</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {enabled
                  ? `Protected with ${verifiedLabel}. You will be asked for a 6-digit code when you sign in.`
                  : 'Not enabled. Recommended for all admin and staff accounts with dashboard access.'}
              </p>
            </div>
            {enabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCode('')
                  setError(null)
                  setStep('disable')
                }}
              >
                <ShieldOff className="h-4 w-4 mr-2" />
                Turn off 2FA
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setError(null)
                  setSelectedApp('google')
                  setStep('choose-app')
                }}
              >
                <ShieldCheck className="h-4 w-4 mr-2" />
                Turn on 2FA
              </Button>
            )}
          </div>

          {!enabled && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground flex items-start gap-2">
              <Smartphone className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                You will set up either <strong className="text-foreground">Google Authenticator</strong> or{' '}
                <strong className="text-foreground">Microsoft Authenticator</strong>. Both apps generate
                time-based codes that work offline.
              </span>
            </div>
          )}
        </div>
      )}

      {step === 'choose-app' && (
        <div className="space-y-5">
          <Subsection
            title="Choose your authenticator app"
            description="Install one of these apps on your phone, then continue to scan the QR code."
          >
            <RadioGroup
              name="authenticator_app"
              value={selectedApp}
              onValueChange={(v) => setSelectedApp(v as AuthenticatorApp)}
              className="gap-3"
            >
              {APP_OPTIONS.map((opt) => (
                <RadioGroupItem
                  key={opt.value}
                  value={opt.value}
                  id={`app-${opt.value}`}
                  className="rounded-lg border border-border/70 bg-background px-3 py-3 hover:border-primary/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </Subsection>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleStartEnrollment} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  Continue with {AUTHENTICATOR_APP_LABELS[selectedApp]}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null)
                setStep('idle')
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'enroll' && enrollment && (
        <form onSubmit={handleConfirmEnrollment} className="space-y-5">
          <Subsection
            title={`Set up ${enrollment.appLabel}`}
            description="Scan the QR code with your app, or enter the secret key manually if you cannot scan."
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="mx-auto sm:mx-0 shrink-0 rounded-xl border border-border bg-white p-3 shadow-sm">
                {/* Supabase returns a data-URI SVG/PNG for the TOTP URI. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollment.qrCode}
                  alt={`QR code for ${enrollment.appLabel}`}
                  className="h-44 w-44"
                  width={176}
                  height={176}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Open <strong className="text-foreground">{enrollment.appLabel}</strong>, add a new
                  account, and scan this code. Then enter the 6-digit code it shows to confirm setup.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="mfa-secret">Manual setup key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="mfa-secret"
                      readOnly
                      value={enrollment.secret}
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="outline" onClick={copySecret} aria-label="Copy secret">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Subsection>

          <div className="space-y-2 max-w-xs">
            <Label htmlFor="mfa-enroll-code">Verification code</Label>
            <Input
              id="mfa-enroll-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={busy}
              className="font-mono tracking-widest text-lg"
            />
            <p className="text-xs text-muted-foreground">
              Enter the current 6-digit code from {enrollment.appLabel}.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enabling…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Enable two-factor authentication
                </>
              )}
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={handleCancelEnrollment}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {step === 'disable' && (
        <form onSubmit={handleDisable} className="space-y-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Turning off 2FA means your password alone will be enough to sign in. Enter a current
              code from your authenticator app to confirm.
            </span>
          </div>

          <div className="space-y-2 max-w-xs">
            <Label htmlFor="mfa-disable-code">Authenticator code</Label>
            <Input
              id="mfa-disable-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={busy}
              className="font-mono tracking-widest text-lg"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={busy || code.length !== 6}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling…
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4 mr-2" />
                  Turn off 2FA
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setCode('')
                setError(null)
                setStep('idle')
              }}
            >
              Keep 2FA on
            </Button>
          </div>
        </form>
      )}

      {error && step === 'idle' && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </SettingsSection>
  )
}
