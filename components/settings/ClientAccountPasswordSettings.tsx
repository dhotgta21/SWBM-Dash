'use client'

import { useState } from 'react'
import { Wallet, KeyRound, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { changeClientAccountPassword } from '@/lib/actions/client-account-settings'

interface ClientAccountPasswordSettingsProps {
  hasPassword: boolean
}

export function ClientAccountPasswordSettings({ hasPassword }: ClientAccountPasswordSettingsProps) {
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
    const result = await changeClientAccountPassword(
      hasPassword ? currentPassword : '',
      newPassword
    )
    setIsPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSuccess(result.message || 'Client account password updated.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Client account password
          </CardTitle>
          <CardDescription>
            Your personal password for recording deposits and applying balance on client accounts.
            It is separate from your login password, payment password, and deletion password, and it is stored
            as a hash in the database — never in code or environment files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPassword && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No client account password is set yet. Set one now — you will need it, together with
                your username, to add money or apply balance on a client&apos;s account.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="current-client-account-password">Current client account password</Label>
                <Input
                  id="current-client-account-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current client account password"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-client-account-password">New client account password</Label>
              <Input
                id="new-client-account-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new client account password"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-client-account-password">Confirm new client account password</Label>
              <Input
                id="confirm-client-account-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new client account password"
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
              {isPending ? 'Saving…' : hasPassword ? 'Change client account password' : 'Set client account password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
