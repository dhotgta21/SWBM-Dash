'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateInvoiceAssistantSettings,
  clearInvoiceAssistantApiKey,
  type InvoiceAssistantSettings,
} from '@/lib/actions/invoice-assistant-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SettingsSection, Subsection } from './SettingsSection'
import { Eye, EyeOff, KeyRound, RotateCcw, ShieldCheck } from 'lucide-react'

interface InvoiceAssistantSettingsProps {
  initialSettings: InvoiceAssistantSettings
}

export function InvoiceAssistantSettingsForm({ initialSettings }: InvoiceAssistantSettingsProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [clearing, setClearing] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)

  const hasStoredKey = initialSettings.has_api_key

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const deepseekApiKey = (formData.get('deepseekApiKey') as string | null)?.trim() ?? ''
      const deepseekModel = (formData.get('deepseekModel') as string | null)?.trim() ?? ''

      const result = await updateInvoiceAssistantSettings({
        // Only overwrite the stored key when the user actually typed something.
        // An empty field leaves the existing key in place.
        deepseekApiKey: deepseekApiKey.length > 0 ? deepseekApiKey : undefined,
        deepseekModel,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess(
          deepseekApiKey.length > 0
            ? 'AI settings saved. The new API key is now active.'
            : 'AI settings saved.',
        )
        // Clear the plaintext key from the DOM so it is not left in the input.
        if (keyInputRef.current) keyInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('AI settings submit error:', err)
      setError('Something went wrong while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!hasStoredKey) return
    const confirmed = window.confirm(
      'Remove the stored DeepSeek API key? The invoice assistant will be disabled until a new key is saved in Settings → Integrations.',
    )
    if (!confirmed) return

    setError(null)
    setSuccess(null)
    setClearing(true)
    try {
      const result = await clearInvoiceAssistantApiKey()
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('API key removed.')
        if (keyInputRef.current) keyInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('AI settings clear error:', err)
      setError('Could not remove the API key. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <SettingsSection
        title="Invoice assistant"
        description="Configure the DeepSeek credentials that power the voice-driven invoice assistant."
      >
        <div className="space-y-8">
          <Subsection
            title="DeepSeek API key"
            description="The key used to authenticate with DeepSeek. Stored AES-256-GCM encrypted — the plaintext is never written to the database."
          >
            <div className="space-y-3">
              <Label htmlFor="deepseekApiKey">API key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="deepseekApiKey"
                    ref={keyInputRef}
                    name="deepseekApiKey"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={hasStoredKey ? '•••••••••••• (leave blank to keep current)' : 'sk-...'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={reveal ? 'Hide API key' : 'Show API key'}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <KeyStatus settings={initialSettings} />

              <p className="text-xs text-muted-foreground">
                Get a key at{' '}
                <a
                  href="https://platform.deepseek.com/api_keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  platform.deepseek.com/api_keys
                </a>
                . Leave the field blank and click Save to keep the existing key.
              </p>

              {hasStoredKey && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClear}
                    disabled={clearing || saving}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {clearing ? 'Removing…' : 'Remove stored key'}
                  </Button>
                </div>
              )}
            </div>
          </Subsection>

          <Subsection
            title="Model"
            description="Override the DeepSeek model used for assistant turns. Defaults to deepseek-v4-flash."
          >
            <div className="space-y-2">
              <Label htmlFor="deepseekModel">Model name</Label>
              <Input
                id="deepseekModel"
                name="deepseekModel"
                defaultValue={initialSettings.model ?? ''}
                placeholder="deepseek-v4-flash"
                spellCheck={false}
                autoComplete="off"
                maxLength={64}
              />
              <p className="text-xs text-muted-foreground">
                Common options: <code className="font-mono">deepseek-v4-flash</code>,{' '}
                <code className="font-mono">deepseek-v4-pro</code>. Leave blank to use the server default.
              </p>
            </div>
          </Subsection>

          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">How credentials are stored</p>
              <p>
                The API key you save here is the single source of truth for the assistant. It is
                encrypted with AES-256-GCM before being written to the database, and decrypted on demand
                when an assistant turn runs.
              </p>
              <p>
                Rotate the stored key any time — the change takes effect on the next assistant turn
                (within about 30 seconds). Removing the key here disables the assistant until a new one
                is saved.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={saving} className="gap-1.5">
          {saving ? 'Saving…' : 'Save AI settings'}
        </Button>
      </div>
    </form>
  )
}

function KeyStatus({ settings }: { settings: InvoiceAssistantSettings }) {
  if (settings.has_api_key) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <KeyRound className="h-3.5 w-3.5 text-success" />
        <span>
          A key is stored
          {settings.api_key_last4 && (
            <>
              {' '}— ending in{' '}
              <code className="font-mono text-foreground">…{settings.api_key_last4}</code>
            </>
          )}
          {settings.updated_at && (
            <>
              {' '}(updated {new Date(settings.updated_at).toLocaleDateString('en-GB')})
            </>
          )}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <KeyRound className="h-3.5 w-3.5" />
      <span>No key is stored yet. Save one below to enable the AI assistant.</span>
    </div>
  )
}