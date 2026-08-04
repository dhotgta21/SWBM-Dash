'use client'

import { useState } from 'react'
import { WalletCards, KeyRound, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { changePaymentPassword } from '@/lib/actions/payment-password-settings'

interface PaymentPasswordSettingsProps {
  hasPassword: boolean
}

export function PaymentPasswordSettings({ hasPassword }: PaymentPasswordSettingsProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setIsPending(true)
    const result = await changePaymentPassword(hasPassword ? currentPassword : '', newPassword)
    setIsPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSuccess(result.message || 'Payment password updated.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletCards className="w-5 h-5" />
            Payment password
          </CardTitle>
          <CardDescription>
            Your personal password for recording invoice payments (cash, card, bank transfer,
            mark-as-paid). It is separate from your login password, client account password, and
            deletion password, and it is stored as a hash in the database — never in code or
            environment files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPassword && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No payment password is set yet. Set one now — you will need it, together with your
                name signature, to record payments on invoices.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="current-payment-password">Current payment password</Label>
                <Input
                  id="current-payment-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current payment password"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-payment-password">New payment password</Label>
              <Input
                id="new-payment-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new payment password"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-payment-password">Confirm new payment password</Label>
              <Input
                id="confirm-payment-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new payment password"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                {success}
              </div>
            )}

            <Button type="submit" disabled={isPending || !newPassword || !confirmPassword}>
              <KeyRound className="w-4 h-4 mr-2" />
              {isPending
                ? 'Saving…'
                : hasPassword
                  ? 'Change payment password'
                  : 'Set payment password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
