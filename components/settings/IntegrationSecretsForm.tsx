'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateIntegrationSecrets,
  clearIntegrationSecret,
  updateRotationWarningDays,
  type IntegrationSecrets,
} from '@/lib/actions/integration-secrets'
import { testGoAddressConnection } from '@/lib/actions/postcode'
import { type InvoiceAssistantSettings } from '@/lib/actions/invoice-assistant-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsSection, Subsection } from './SettingsSection'
import { InvoiceAssistantSettingsForm } from './InvoiceAssistantSettings'
import { AlertTriangle, ExternalLink, Eye, EyeOff, KeyRound, RotateCcw, ShieldCheck } from 'lucide-react'

interface IntegrationSecretsFormProps {
  initialSettings: InvoiceAssistantSettings
  initialSecrets: IntegrationSecrets
}

export function IntegrationSecretsForm({ initialSettings, initialSecrets }: IntegrationSecretsFormProps) {
  return (
    <Tabs defaultValue="invoice-assistant" className="w-full">
      <TabsList className="h-11 w-full justify-start overflow-x-auto border border-border bg-muted/60 p-1 sm:w-auto">
        <TabsTrigger value="invoice-assistant" className="gap-1.5 px-3">
          Invoice assistant
        </TabsTrigger>
        <TabsTrigger value="resend" className="gap-1.5 px-3">
          Resend
        </TabsTrigger>
        <TabsTrigger value="turnstile" className="gap-1.5 px-3">
          Turnstile
        </TabsTrigger>
        <TabsTrigger value="goaddress" className="gap-1.5 px-3">
          GoAddress
        </TabsTrigger>
        <TabsTrigger value="rotation" className="gap-1.5 px-3">
          Rotation
        </TabsTrigger>
      </TabsList>

      <TabsContent value="invoice-assistant" className="mt-4 focus-visible:outline-none">
        <InvoiceAssistantSettingsForm initialSettings={initialSettings} />
      </TabsContent>

      <TabsContent value="resend" className="mt-4 focus-visible:outline-none">
        <ResendSection secrets={initialSecrets} />
      </TabsContent>

      <TabsContent value="turnstile" className="mt-4 focus-visible:outline-none">
        <TurnstileSection secrets={initialSecrets} />
      </TabsContent>

      <TabsContent value="goaddress" className="mt-4 focus-visible:outline-none">
        <GoAddressSection secrets={initialSecrets} />
      </TabsContent>

      <TabsContent value="rotation" className="mt-4 focus-visible:outline-none">
        <RotationWarningSettings secrets={initialSecrets} />
      </TabsContent>

      <div className="mt-6 flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">How credentials are stored</p>
          <p>
            API keys and tokens are AES-256-GCM encrypted before being written to the database. The
            plaintext is never returned to the browser or stored in a column.
          </p>
          <p>
            Values saved here take priority over environment variables, so you can rotate them from
            the dashboard without redeploying. Environment variables remain as fallbacks.
          </p>
        </div>
      </div>
    </Tabs>
  )
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

function ResendSection({ secrets }: { secrets: IntegrationSecrets }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const keyInputRef = useRef<HTMLInputElement>(null)
  const fromInputRef = useRef<HTMLInputElement>(null)

  const hasStoredKey = secrets.resend.hasApiKey

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const apiKey = (formData.get('resendApiKey') as string | null)?.trim() ?? ''
      const fromAddress = (formData.get('resendFromAddress') as string | null)?.trim() ?? ''

      const result = await updateIntegrationSecrets({
        resendApiKey: apiKey.length > 0 ? apiKey : undefined,
        resendFromAddress: fromAddress,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('Resend settings saved.')
        if (keyInputRef.current) keyInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('Resend settings submit error:', err)
      setError('Something went wrong while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!hasStoredKey) return
    const confirmed = window.confirm(
      'Remove the stored Resend API key? Outbound email will fall back to RESEND_API_KEY in the server environment.',
    )
    if (!confirmed) return

    setError(null)
    setSuccess(null)
    setClearing(true)
    try {
      const result = await clearIntegrationSecret('resend')
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('Resend API key removed.')
        if (keyInputRef.current) keyInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('Resend clear error:', err)
      setError('Could not remove the API key. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection
        title="Resend"
        description="Configure outbound email delivery. A Resend API key and verified sender address are required for invitations, password resets and invoice emails."
      >
        <div className="space-y-8">
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

          <Subsection
            title="API key"
            description="The Resend API key used to send transactional email. Stored AES-256-GCM encrypted."
          >
            <div className="space-y-3">
              <Label htmlFor="resendApiKey">API key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="resendApiKey"
                    ref={keyInputRef}
                    name="resendApiKey"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={hasStoredKey ? '•••••••••••• (leave blank to keep current)' : 're_...'}
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

              <KeyStatus
                hasKey={secrets.resend.hasApiKey}
                last4={secrets.resend.apiKeyLast4}
                updatedAt={secrets.resend.updatedAt}
                rotationWarningDays={secrets.rotationWarningDays}
                rotationHref="https://resend.com/api-keys"
                label="API key"
              />

              <ProviderLink href="https://resend.com/api-keys">
                Get or rotate your Resend API key
              </ProviderLink>

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
            title="From address"
            description="The sender address for outbound email. Must be a verified domain in Resend."
          >
            <div className="space-y-3">
              <Label htmlFor="resendFromAddress">From address</Label>
              <Input
                id="resendFromAddress"
                ref={fromInputRef}
                name="resendFromAddress"
                type="text"
                autoComplete="off"
                spellCheck={false}
                defaultValue={secrets.resend.fromAddress ?? ''}
                placeholder="Star Hawk Builders Merchant <noreply@yourdomain.com>"
                maxLength={256}
              />
              <ProviderLink href="https://resend.com/domains">
                Verify a domain in Resend
              </ProviderLink>
            </div>
          </Subsection>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? 'Saving…' : 'Save Resend settings'}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Turnstile
// ---------------------------------------------------------------------------

function TurnstileSection({ secrets }: { secrets: IntegrationSecrets }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const secretInputRef = useRef<HTMLInputElement>(null)

  const hasStoredKey = secrets.turnstile.hasSecretKey

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const secretKey = (formData.get('turnstileSecretKey') as string | null)?.trim() ?? ''
      const siteKey = (formData.get('turnstileSiteKey') as string | null)?.trim() ?? ''

      const result = await updateIntegrationSecrets({
        turnstileSecretKey: secretKey.length > 0 ? secretKey : undefined,
        turnstileSiteKey: siteKey,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('Turnstile settings saved.')
        if (secretInputRef.current) secretInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('Turnstile settings submit error:', err)
      setError('Something went wrong while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!hasStoredKey) return
    const confirmed = window.confirm(
      'Remove the stored Turnstile secret key? Verification will fall back to TURNSTILE_SECRET_KEY in the server environment.',
    )
    if (!confirmed) return

    setError(null)
    setSuccess(null)
    setClearing(true)
    try {
      const result = await clearIntegrationSecret('turnstile')
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('Turnstile secret key removed.')
        if (secretInputRef.current) secretInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('Turnstile clear error:', err)
      setError('Could not remove the secret key. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection
        title="Cloudflare Turnstile"
        description="Protect public forms with Cloudflare Turnstile. The site key is public; the secret key stays server-side."
      >
        <div className="space-y-8">
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

          <Subsection
            title="Secret key"
            description="Server-side key used to verify Turnstile tokens. Stored AES-256-GCM encrypted."
          >
            <div className="space-y-3">
              <Label htmlFor="turnstileSecretKey">Secret key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="turnstileSecretKey"
                    ref={secretInputRef}
                    name="turnstileSecretKey"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={
                      hasStoredKey ? '•••••••••••• (leave blank to keep current)' : '0x...'
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={reveal ? 'Hide secret key' : 'Show secret key'}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <KeyStatus
                hasKey={secrets.turnstile.hasSecretKey}
                last4={secrets.turnstile.secretKeyLast4}
                updatedAt={secrets.turnstile.updatedAt}
                rotationWarningDays={secrets.rotationWarningDays}
                rotationHref="https://dash.cloudflare.com/turnstile"
                label="Secret key"
              />

              <ProviderLink href="https://dash.cloudflare.com/turnstile">
                Manage your Turnstile widget
              </ProviderLink>

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
            title="Site key"
            description="Public site key rendered by the Turnstile widget on login, register, reset-password and checkout forms."
          >
            <div className="space-y-3">
              <Label htmlFor="turnstileSiteKey">Site key</Label>
              <Input
                id="turnstileSiteKey"
                name="turnstileSiteKey"
                type="text"
                autoComplete="off"
                spellCheck={false}
                defaultValue={secrets.turnstile.siteKey ?? ''}
                placeholder="1x00000000000000000000AA"
                maxLength={64}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to fall back to NEXT_PUBLIC_TURNSTILE_SITE_KEY in the server environment.
              </p>
            </div>
          </Subsection>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? 'Saving…' : 'Save Turnstile settings'}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </form>
  )
}

// ---------------------------------------------------------------------------
// GoAddress
// ---------------------------------------------------------------------------

function GoAddressSection({ secrets }: { secrets: IntegrationSecrets }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [reveal, setReveal] = useState(false)
  const tokenInputRef = useRef<HTMLInputElement>(null)

  const hasStoredKey = secrets.goaddress.hasToken

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const token = (formData.get('goaddressToken') as string | null)?.trim() ?? ''

      const result = await updateIntegrationSecrets({
        goaddressToken: token.length > 0 ? token : undefined,
      })

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess(
          token.length > 0
            ? 'GoAddress token saved and re-encrypted with AI_DESIGNER_KEY_ENCRYPTION_KEY / ENCRYPTION_KEY. Click Test connection to verify.'
            : 'GoAddress settings saved.',
        )
        if (tokenInputRef.current) tokenInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('GoAddress settings submit error:', err)
      setError('Something went wrong while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setError(null)
    setSuccess(null)
    setTesting(true)
    try {
      const result = await testGoAddressConnection('SW1A 1AA')
      if (result.ok) {
        setSuccess(result.message)
      } else {
        setError(result.message)
      }
    } catch (err) {
      console.error('GoAddress test error:', err)
      setError('Could not run the connection test. Please try again.')
    } finally {
      setTesting(false)
    }
  }

  async function handleClear() {
    if (!hasStoredKey) return
    const confirmed = window.confirm(
      'Remove the stored GoAddress token? Postcode lookup will fall back to GOADDRESS_TOKEN in the server environment, then to postcodes.io.',
    )
    if (!confirmed) return

    setError(null)
    setSuccess(null)
    setClearing(true)
    try {
      const result = await clearIntegrationSecret('goaddress')
      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('GoAddress token removed.')
        if (tokenInputRef.current) tokenInputRef.current.value = ''
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('GoAddress clear error:', err)
      setError('Could not remove the token. Please try again.')
    } finally {
      setClearing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection
        title="GoAddress"
        description="Enable premium UK postcode lookup. When configured, address suggestions are fetched from GoAddress; otherwise the free postcodes.io endpoint is used."
      >
        <div className="space-y-8">
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

          <Subsection
            title="API token"
            description="Your GoAddress bearer token. Stored AES-256-GCM encrypted."
          >
            <div className="space-y-3">
              <Label htmlFor="goaddressToken">API token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="goaddressToken"
                    ref={tokenInputRef}
                    name="goaddressToken"
                    type={reveal ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    placeholder={
                      hasStoredKey ? '•••••••••••• (leave blank to keep current)' : 'Bearer token'
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    aria-label={reveal ? 'Hide token' : 'Show token'}
                    className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <KeyStatus
                hasKey={secrets.goaddress.hasToken}
                last4={secrets.goaddress.tokenLast4}
                updatedAt={secrets.goaddress.updatedAt}
                rotationWarningDays={secrets.rotationWarningDays}
                rotationHref="https://portal.goaddress.io"
                label="API token"
              />

              <ProviderLink href="https://portal.goaddress.io">
                Get your GoAddress API token
              </ProviderLink>

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
                    {clearing ? 'Removing…' : 'Remove stored token'}
                  </Button>
                </div>
              )}
            </div>
          </Subsection>

          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              disabled={testing || saving || clearing}
              onClick={() => void handleTest()}
              className="gap-1.5"
            >
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? 'Saving…' : 'Save GoAddress settings'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Encryption uses <code className="text-[11px]">AI_DESIGNER_KEY_ENCRYPTION_KEY</code> on
            Vercel (or <code className="text-[11px]">ENCRYPTION_KEY</code> if you add it). After
            changing that env value, paste the GoAddress token again and Save. Do not include the
            word &quot;Bearer&quot;. Open the browser console and Vercel logs if Test connection fails -
            both now print what is SET vs MISSING.
          </p>
        </div>
      </SettingsSection>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Rotation warning threshold
// ---------------------------------------------------------------------------

function RotationWarningSettings({ secrets }: { secrets: IntegrationSecrets }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSaving(true)

    try {
      const formData = new FormData(e.currentTarget)
      const raw = (formData.get('rotationWarningDays') as string | null)?.trim() ?? ''
      const days = parseInt(raw, 10)

      const result = await updateRotationWarningDays(days)

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setSuccess('Rotation warning period saved.')
        router.refresh()
      } else {
        setError('Unexpected response from server. Please try again.')
      }
    } catch (err) {
      console.error('Rotation warning settings submit error:', err)
      setError('Something went wrong while saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <SettingsSection
        title="Rotation reminders"
        description="Choose how many days a stored secret can age before the dashboard flags it for rotation."
      >
        <div className="space-y-6">
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

          <div className="space-y-3">
            <Label htmlFor="rotationWarningDays">Warn after (days)</Label>
            <Input
              id="rotationWarningDays"
              ref={inputRef}
              name="rotationWarningDays"
              type="number"
              min={1}
              max={730}
              defaultValue={secrets.rotationWarningDays}
              autoComplete="off"
              className="max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              Default is 90 days. Set to a lower value for stricter rotation hygiene, or higher if your
              provider keys do not expire.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? 'Saving…' : 'Save reminder period'}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Shared UI bits
// ---------------------------------------------------------------------------

function KeyStatus({
  hasKey,
  last4,
  updatedAt,
  rotationWarningDays,
  rotationHref,
  label,
}: {
  hasKey: boolean
  last4: string | null
  updatedAt: string | null
  rotationWarningDays: number
  rotationHref?: string
  label: string
}) {
  if (hasKey) {
    const ageMs = updatedAt ? Date.now() - new Date(updatedAt).getTime() : null
    const ageDays = ageMs !== null ? Math.floor(ageMs / (1000 * 60 * 60 * 24)) : null
    const isStale = ageDays !== null && ageDays > rotationWarningDays

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5 text-success" />
          <span>
            A {label.toLowerCase()} is stored
            {last4 && (
              <>
                {' '}— ending in{' '}
                <code className="font-mono text-foreground">…{last4}</code>
              </>
            )}
            {ageDays !== null && (
              <>
                {' '}— last rotated {ageDays} day{ageDays === 1 ? '' : 's'} ago
              </>
            )}
          </span>
        </div>
        {isStale && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This {label.toLowerCase()} is older than {rotationWarningDays} days. Consider rotating it
              {rotationHref ? (
                <>
                  {' '}in{' '}
                  <a
                    href={rotationHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    the provider dashboard
                  </a>
                </>
              ) : null}
              {' '}and saving the new value here.
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <KeyRound className="h-3.5 w-3.5" />
      <span>No {label.toLowerCase()} is stored yet. Save one below to enable this integration.</span>
    </div>
  )
}

function ProviderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      >
        {children}
        <ExternalLink className="h-3 w-3" />
      </a>
    </p>
  )
}
