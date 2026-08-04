'use client'

import { useMemo, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Copy, RefreshCw, Check, X, FileText, Truck, Lock, Globe } from 'lucide-react'
import {
  toggleInvoicePublicSharing,
  regenerateInvoiceShareToken,
  renewInvoiceShareToken,
  setInvoiceSharePassword,
} from '@/lib/actions/invoices'
import {
  buildInvoiceShareUrlClient,
  buildDeliveryNoteShareUrlClient,
} from '@/lib/share/invoice-url-client'
import { buildInvoiceShareUrl } from '@/lib/share/invoice-url'

type ShareMode = 'invoice' | 'delivery-note'

interface InvoiceShareSettingsProps {
  invoiceId: string
  shareToken: string
  shareKey?: string | null
  publicShareEnabled: boolean | null | undefined
  deliveryNoteShareEnabled?: boolean | null | undefined
  shareTokenExpiresAt: string | null | undefined
  shareTokenCreatedAt?: string | null | undefined
  publicShareRequiresPassword?: boolean | null | undefined
  deliveryNoteShareRequiresPassword?: boolean | null | undefined
  canManage: boolean
  baseUrl?: string
}

function formatExpiry(iso: string | null | undefined): {
  text: string
  expired: boolean
  daysLeft: number | null
} {
  if (!iso) return { text: 'No expiry set', expired: false, daysLeft: null }
  const expiry = new Date(iso)
  const now = new Date()
  const diffMs = expiry.getTime() - now.getTime()
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffMs <= 0) return { text: 'Expired', expired: true, daysLeft: 0 }
  if (daysLeft === 1) return { text: 'Expires in 1 day', expired: false, daysLeft: 1 }
  return { text: `Expires in ${daysLeft} days`, expired: false, daysLeft }
}

function modeLabel(mode: ShareMode): string {
  return mode === 'invoice' ? 'invoice' : 'delivery note'
}

export function InvoiceShareSettings({
  invoiceId,
  shareToken,
  shareKey,
  publicShareEnabled,
  deliveryNoteShareEnabled,
  shareTokenExpiresAt,
  publicShareRequiresPassword,
  deliveryNoteShareRequiresPassword,
  canManage,
  baseUrl,
}: InvoiceShareSettingsProps) {
  const [mode, setMode] = useState<ShareMode>('invoice')
  // Independent visibility + access control per document type.
  const [invoiceEnabled, setInvoiceEnabled] = useState(publicShareEnabled === true)
  const [deliveryNoteEnabled, setDeliveryNoteEnabled] = useState(
    deliveryNoteShareEnabled === true
  )
  const [invoiceRequiresPassword, setInvoiceRequiresPassword] = useState(
    publicShareRequiresPassword === true
  )
  const [deliveryNoteRequiresPassword, setDeliveryNoteRequiresPassword] = useState(
    deliveryNoteShareRequiresPassword === true
  )
  const [token, setToken] = useState(shareToken ?? '')
  const [key, setKey] = useState(shareKey ?? '')
  const [expiresAt, setExpiresAt] = useState(shareTokenExpiresAt ?? null)
  const [generatedPasswordInvoice, setGeneratedPasswordInvoice] = useState<string | null>(null)
  const [generatedPasswordDeliveryNote, setGeneratedPasswordDeliveryNote] = useState<string | null>(
    null
  )
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [passwordCopyState, setPasswordCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const enabled = mode === 'invoice' ? invoiceEnabled : deliveryNoteEnabled
  const requiresPassword =
    mode === 'invoice' ? invoiceRequiresPassword : deliveryNoteRequiresPassword
  const generatedPassword =
    mode === 'invoice' ? generatedPasswordInvoice : generatedPasswordDeliveryNote

  const expiry = useMemo(() => formatExpiry(expiresAt), [expiresAt])

  const invoiceUrl = useMemo(() => {
    if (!token || !invoiceEnabled || expiry.expired) return null
    try {
      if (baseUrl) {
        return buildInvoiceShareUrl({ shareKey: key, shareToken: token, baseUrl })
      }
      return buildInvoiceShareUrlClient({ shareKey: key, shareToken: token })
    } catch {
      return null
    }
  }, [key, token, invoiceEnabled, expiry.expired, baseUrl])

  const deliveryNoteUrl = useMemo(() => {
    if (!token || !deliveryNoteEnabled || expiry.expired) return null
    try {
      return baseUrl
        ? `${buildInvoiceShareUrl({ shareKey: key, shareToken: token, baseUrl })}?mode=delivery-note`
        : buildDeliveryNoteShareUrlClient({ shareKey: key, shareToken: token })
    } catch {
      return null
    }
  }, [key, token, deliveryNoteEnabled, expiry.expired, baseUrl])

  const activeUrl = mode === 'invoice' ? invoiceUrl : deliveryNoteUrl

  async function copyUrl(url: string | null) {
    if (!url) return
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
      setCopyState('error')
    }
  }

  async function copyPassword(password: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(password)
      } else {
        const ta = document.createElement('textarea')
        ta.value = password
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        ta.remove()
      }
      setPasswordCopyState('copied')
      setTimeout(() => setPasswordCopyState('idle'), 2000)
    } catch (err) {
      console.error('Password copy failed:', err)
      setPasswordCopyState('error')
    }
  }

  function setModeEnabled(shareMode: ShareMode, value: boolean) {
    if (shareMode === 'invoice') setInvoiceEnabled(value)
    else setDeliveryNoteEnabled(value)
  }

  function setModeRequiresPassword(shareMode: ShareMode, value: boolean) {
    if (shareMode === 'invoice') setInvoiceRequiresPassword(value)
    else setDeliveryNoteRequiresPassword(value)
  }

  function clearModeGeneratedPassword(shareMode: ShareMode) {
    if (shareMode === 'invoice') setGeneratedPasswordInvoice(null)
    else setGeneratedPasswordDeliveryNote(null)
  }

  function setModeGeneratedPassword(shareMode: ShareMode, password: string | null) {
    if (shareMode === 'invoice') setGeneratedPasswordInvoice(password)
    else setGeneratedPasswordDeliveryNote(password)
  }

  function syncResult(invoice: {
    share_token?: string | null
    public_share_key?: string | null
    public_share_enabled?: boolean | null
    public_share_requires_password?: boolean | null
    delivery_note_share_enabled?: boolean | null
    delivery_note_share_requires_password?: boolean | null
    share_token_expires_at?: string | null
    share_token_created_at?: string | null
  }) {
    if (invoice.public_share_enabled !== undefined) {
      setInvoiceEnabled(invoice.public_share_enabled === true)
    }
    if (invoice.delivery_note_share_enabled !== undefined) {
      setDeliveryNoteEnabled(invoice.delivery_note_share_enabled === true)
    }
    if (invoice.public_share_requires_password !== undefined) {
      setInvoiceRequiresPassword(invoice.public_share_requires_password === true)
    }
    if (invoice.delivery_note_share_requires_password !== undefined) {
      setDeliveryNoteRequiresPassword(invoice.delivery_note_share_requires_password === true)
    }
    if (invoice.share_token) setToken(invoice.share_token)
    if (invoice.public_share_key !== undefined) setKey(invoice.public_share_key ?? '')
    setExpiresAt(invoice.share_token_expires_at ?? null)
  }

  function setSharing(newEnabled: boolean) {
    if (!canManage) return
    setFeedback(null)
    const previousEnabled = enabled
    setModeEnabled(mode, newEnabled)
    startTransition(async () => {
      const result = await toggleInvoicePublicSharing(invoiceId, newEnabled, mode)
      if (result.error) {
        setModeEnabled(mode, previousEnabled)
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      if (result.invoice) syncResult(result.invoice)
      clearModeGeneratedPassword(mode)
      setFeedback({
        kind: 'info',
        text: newEnabled
          ? `Link visibility is now ON for the ${modeLabel(mode)} only (7 days). The other document is unchanged.`
          : `Link visibility is now OFF for the ${modeLabel(mode)} only. The other document is unchanged.`,
      })
    })
  }

  function setPasswordProtection(newRequiresPassword: boolean) {
    if (!canManage || !enabled || expiry.expired || requiresPassword === newRequiresPassword) return
    setFeedback(null)
    const previousRequiresPassword = requiresPassword
    setModeRequiresPassword(mode, newRequiresPassword)
    startTransition(async () => {
      const result = await setInvoiceSharePassword(invoiceId, newRequiresPassword, mode)
      if (result.error) {
        setModeRequiresPassword(mode, previousRequiresPassword)
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      if (result.invoice) syncResult(result.invoice)
      if (newRequiresPassword && result.password) {
        setModeGeneratedPassword(mode, result.password)
        setFeedback({
          kind: 'info',
          text: `Password protection is ON for the ${modeLabel(mode)} only. Copy the password below and send it separately.`,
        })
      } else {
        clearModeGeneratedPassword(mode)
        setFeedback({
          kind: 'info',
          text: `Access control for the ${modeLabel(mode)} is now Public. The other document is unchanged.`,
        })
      }
    })
  }

  function regeneratePassword() {
    if (!canManage || !enabled || expiry.expired) return
    setFeedback(null)
    startTransition(async () => {
      const result = await setInvoiceSharePassword(invoiceId, true, mode)
      if (result.error) {
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      if (result.invoice) syncResult(result.invoice)
      if (result.password) {
        setModeGeneratedPassword(mode, result.password)
        setFeedback({
          kind: 'info',
          text: `A new password has been generated for the ${modeLabel(mode)} only. The old password for this document no longer works.`,
        })
      }
    })
  }

  function renew() {
    if (!canManage) return
    setFeedback(null)
    startTransition(async () => {
      const result = await renewInvoiceShareToken(invoiceId, mode)
      if (result.error) {
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      if (result.invoice) syncResult(result.invoice)
      setFeedback({
        kind: 'info',
        text: `The ${modeLabel(mode)} link has been renewed. The same URL keeps working.`,
      })
    })
  }

  function regenerate() {
    if (!canManage) return
    setFeedback(null)
    startTransition(async () => {
      const result = await regenerateInvoiceShareToken(invoiceId)
      if (result.error) {
        setFeedback({ kind: 'error', text: result.error })
        return
      }
      if (result.invoice) syncResult(result.invoice)
      setGeneratedPasswordInvoice(null)
      setGeneratedPasswordDeliveryNote(null)
      setFeedback({
        kind: 'info',
        text: 'A new share link has been generated. Old invoice and delivery-note URLs and passwords no longer work.',
      })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share & Visibility</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 1. Choose which document link to configure */}
        <div className="space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Share as</p>
            <p className="text-xs text-muted-foreground">
              Visibility and access control apply only to the selected document.
            </p>
          </div>
          <div className="inline-flex h-10 w-full rounded-lg bg-muted p-1 text-muted-foreground">
            <button
              type="button"
              onClick={() => setMode('invoice')}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                mode === 'invoice'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="truncate">Invoice link</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('delivery-note')}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                mode === 'delivery-note'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Truck className="w-4 h-4 shrink-0" />
              <span className="truncate">Delivery note link</span>
            </button>
          </div>
        </div>

        {/* 2. Link visibility toggle (mode-specific) */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="public-share-toggle" className="text-sm font-medium">
              Link visibility
            </Label>
            <p className="text-xs text-muted-foreground">
              {enabled && !expiry.expired
                ? `A shareable ${modeLabel(mode)} link is active.`
                : enabled && expiry.expired
                  ? 'The link has expired. Renew it below.'
                  : `The ${modeLabel(mode)} shareable link is turned off.`}
            </p>
          </div>
          <Switch
            id="public-share-toggle"
            checked={enabled}
            onCheckedChange={setSharing}
            disabled={!canManage || isPending}
          />
        </div>

        {enabled && (
          <div className="space-y-5">
            {/* 3. Access control (mode-specific) */}
            <div className="space-y-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Access control</p>
                <p className="text-xs text-muted-foreground">
                  Choose who can open this {modeLabel(mode)} link.
                </p>
              </div>
              <div className="inline-flex h-10 w-full rounded-lg bg-muted p-1 text-muted-foreground">
                <button
                  type="button"
                  onClick={() => setPasswordProtection(false)}
                  disabled={!canManage || isPending || expiry.expired}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:pointer-events-none disabled:opacity-50',
                    !requiresPassword
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="truncate">Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordProtection(true)}
                  disabled={!canManage || isPending || expiry.expired}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:pointer-events-none disabled:opacity-50',
                    requiresPassword
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <span className="truncate">Password protected</span>
                </button>
              </div>
            </div>

            {/* Password display / regenerate */}
            {requiresPassword && !expiry.expired && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lock className="w-4 h-4" />
                  <span>Share password ({modeLabel(mode)})</span>
                </div>
                {generatedPassword ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-0 rounded-md border bg-muted px-3 py-2 text-sm text-foreground font-mono tracking-wider truncate">
                      {generatedPassword}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyPassword(generatedPassword)}
                    >
                      {passwordCopyState === 'copied' ? (
                        <Check className="w-4 h-4 mr-1" />
                      ) : passwordCopyState === 'error' ? (
                        <X className="w-4 h-4 mr-1" />
                      ) : (
                        <Copy className="w-4 h-4 mr-1" />
                      )}
                      {passwordCopyState === 'copied' ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      The password is stored securely and cannot be shown again. If you lost it,
                      generate a new one for this document only.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={regeneratePassword}
                      disabled={isPending}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Regenerate password
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Active link */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  {mode === 'invoice' ? 'Invoice link' : 'Delivery note link'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {requiresPassword ? 'Password protected' : 'Public'} •{' '}
                  {expiry.expired ? 'Expired' : expiry.text}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyUrl(activeUrl)}
                  disabled={!activeUrl}
                >
                  {copyState === 'copied' ? (
                    <Check className="w-4 h-4 mr-1" />
                  ) : copyState === 'error' ? (
                    <X className="w-4 h-4 mr-1" />
                  ) : (
                    <Copy className="w-4 h-4 mr-1" />
                  )}
                  {copyState === 'copied' ? 'Copied' : 'Copy'}
                </Button>
                {expiry.expired && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={renew}
                    disabled={isPending}
                    title="Renew link (keeps the same URL)"
                  >
                    Renew link
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={regenerate}
                  disabled={isPending}
                  title="Regenerate link (rotates the shared URL for both documents)"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {feedback && (
          <Alert variant={feedback.kind === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{feedback.text}</AlertDescription>
          </Alert>
        )}

        {!canManage && (
          <p className="text-xs text-muted-foreground">
            You don&apos;t have permission to change sharing settings.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
