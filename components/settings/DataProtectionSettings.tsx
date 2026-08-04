'use client'

import { useState } from 'react'
import { Shield, KeyRound, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { changeDeletionPassword } from '@/lib/actions/deletion-settings'

interface DataProtectionSettingsProps {
  hasPassword: boolean
}

export function DataProtectionSettings({ hasPassword }: DataProtectionSettingsProps) {
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
    const result = await changeDeletionPassword(
      hasPassword ? currentPassword : '',
      newPassword
    )
    setIsPending(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setSuccess(result.message || 'Deletion password updated.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Deletion password
          </CardTitle>
          <CardDescription>
            Your personal password for deleting clients, products, invoices, and payments. It is
            separate from your login password, payment password, and client account password, and it is stored
            as a hash in the database — never in code or environment files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasPassword && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                No deletion password is set yet. Set one now to protect critical
                data from accidental or malicious deletion.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="current-deletion-password">Current deletion password</Label>
                <Input
                  id="current-deletion-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current deletion password"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-deletion-password">New deletion password</Label>
              <Input
                id="new-deletion-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new deletion password"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-deletion-password">Confirm new deletion password</Label>
              <Input
                id="confirm-deletion-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new deletion password"
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
              {isPending ? 'Saving…' : hasPassword ? 'Change deletion password' : 'Set deletion password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
