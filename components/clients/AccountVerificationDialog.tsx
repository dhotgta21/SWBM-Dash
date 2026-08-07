'use client'

import { useState, useTransition } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface AccountVerificationData {
  /** Always empty from the dialog; server stamps operator name from profile. */
  verifiedName: string
  password: string
}

interface AccountVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  /** @deprecated Name field removed; kept so call sites compile until cleaned. */
  defaultName?: string | null
  /** @deprecated Name field removed. */
  prefillName?: boolean
  /** @deprecated Name field removed. */
  nameLabel?: string
  /** @deprecated Name field removed. */
  nameHelpText?: React.ReactNode
  passwordLabel?: string
  passwordPlaceholder?: string
  /** Amber "protected action" banner. Defaults to login-password wording. */
  banner?: React.ReactNode
  onConfirm: (data: AccountVerificationData) => Promise<{ error?: string | null } | void>
}

export function AccountVerificationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  passwordLabel = 'Password',
  passwordPlaceholder = 'Enter your login password',
  banner,
  onConfirm,
}: AccountVerificationDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Single close path: always drop any typed-but-unsubmitted password so it
  // never lingers in state across a cancel/close/reopen.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword('')
      setError(null)
    }
    onOpenChange(next)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await onConfirm({ verifiedName: '', password })
      if (result?.error) {
        setError(result.error)
        return
      }
      handleOpenChange(false)
    })
  }

  const bannerContent = banner ?? (
    <>
      <strong>Protected action:</strong> Enter your login password to continue.
      This is the same password you use to sign in.
    </>
  )

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && handleOpenChange(next)}>
      <DialogContent>
        <DialogClose onClick={() => !isPending && handleOpenChange(false)} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {bannerContent}
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-password">{passwordLabel}</Label>
            <Input
              id="account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordPlaceholder}
              disabled={isPending}
              autoComplete="current-password"
              required
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && !isPending) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => !isPending && handleOpenChange(false)}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !password}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Confirming…
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {confirmLabel}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
