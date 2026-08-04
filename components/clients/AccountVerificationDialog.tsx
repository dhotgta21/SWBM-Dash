'use client'

import { useEffect, useState, useTransition } from 'react'
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
  verifiedName: string
  password: string
}

/** Preserve case; collapse whitespace runs into a single underscore. */
function toUnderscoreName(name: string): string {
  return name.trim().replace(/\s+/g, '_')
}

interface AccountVerificationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  /** Value used to pre-fill the name field (only when prefillName is true). */
  defaultName?: string | null
  /** When false the name field starts blank so the user must type it. Defaults to true. */
  prefillName?: boolean
  nameLabel?: string
  nameHelpText?: React.ReactNode
  passwordLabel?: string
  passwordPlaceholder?: string
  /** Amber "protected action" banner. Defaults to the login-password wording. */
  banner?: React.ReactNode
  onConfirm: (data: AccountVerificationData) => Promise<{ error?: string | null } | void>
}

export function AccountVerificationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  defaultName,
  prefillName = true,
  nameLabel = 'Your name (signature)',
  nameHelpText,
  passwordLabel = 'Payment password',
  passwordPlaceholder = 'Enter your payment password',
  banner,
  onConfirm,
}: AccountVerificationDialogProps) {
  const [verifiedName, setVerifiedName] = useState(
    prefillName && defaultName ? toUnderscoreName(defaultName) : ''
  )
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

  // Keep the pre-filled name in sync if the default changes while open.
  useEffect(() => {
    if (open) {
      setVerifiedName(prefillName && defaultName ? toUnderscoreName(defaultName) : '')
    }
  }, [open, defaultName, prefillName])

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await onConfirm({ verifiedName: toUnderscoreName(verifiedName), password })
      if (result?.error) {
        setError(result.error)
        return
      }
      handleOpenChange(false)
    })
  }

  const helpText =
    nameHelpText ?? (
      <>
        Use an underscore wherever you would normally put a space. Case is kept exactly as you type it
        (e.g. <span className="font-mono">Andrew_Smith</span>).
      </>
    )

  const bannerContent = banner ?? (
    <>
      <strong>Protected action:</strong> Enter your payment password and name to record this
      transaction. This is not your login password — manage it in Settings → Security.
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
            <Label htmlFor="verified-name">{nameLabel}</Label>
            <Input
              id="verified-name"
              value={verifiedName}
              onChange={(e) => setVerifiedName(e.target.value)}
              placeholder="e.g. Andrew_Smith"
              disabled={isPending}
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted-foreground">{helpText}</p>
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
              autoComplete="off"
              required
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && verifiedName && !isPending) {
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
            disabled={isPending || !password || !verifiedName}
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
