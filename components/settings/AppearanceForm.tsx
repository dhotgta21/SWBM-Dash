'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateAppearanceSettings } from '@/lib/actions/appearance'
import { playSuccessSound, playErrorSound } from '@/lib/sound'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardFooter } from '@/components/ui/card'
import { SettingsSection } from './SettingsSection'
import { FontUploadField } from './FontUploadField'
import { ColorPickerField } from './ColorPickerField'
import {
  LOGO_TEXT_LAYOUTS,
  THEME_COLOR_KEYS,
  THEME_COLOR_LABELS,
  type AppearanceSettings,
  type ThemeColorKey,
  normalizeHex,
  resolveAppearance,
} from '@/lib/appearance-shared'

interface AppearanceFormProps {
  initial?: AppearanceSettings | null
  logoUrl?: string | null
  logoUpdatedAt?: string | null
  canEdit?: boolean
}

export function AppearanceForm({ initial, logoUrl, logoUpdatedAt, canEdit = true }: AppearanceFormProps) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const resolved = resolveAppearance(initial)

  const currentLogoUrl = logoUrl || '/Logo.webp'
  const displayLogoUrl = removeLogo
    ? '/Logo.webp'
    : logoPreview || (logoUpdatedAt ? `${currentLogoUrl}?v=${logoUpdatedAt}` : currentLogoUrl)

  const [logoTextEnabled, setLogoTextEnabled] = useState<boolean>(resolved.logo_text_enabled ?? true)
  const [logoTextPrimary, setLogoTextPrimary] = useState<string>(resolved.logo_text_primary || '')
  const [logoTextSecondary, setLogoTextSecondary] = useState<string>(resolved.logo_text_secondary || '')
  const [logoTextLayout, setLogoTextLayout] = useState<string>(resolved.logo_text_layout || 'stacked')
  const [primaryFontFile, setPrimaryFontFile] = useState<File | null>(null)
  const [secondaryFontFile, setSecondaryFontFile] = useState<File | null>(null)
  const [colors, setColors] = useState<Record<ThemeColorKey, string>>(() => {
    const result = {} as Record<ThemeColorKey, string>
    for (const key of THEME_COLOR_KEYS) {
      result[key] = resolved[key]
    }
    return result
  })

  const allColorsValid = THEME_COLOR_KEYS.every((key) => normalizeHex(colors[key]))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!allColorsValid) {
      playErrorSound()
      toast.error('Please fix invalid colour values.')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      formData.set('logo_text_enabled', logoTextEnabled ? 'true' : 'false')
      if (resetting) {
        formData.set('reset_defaults', 'true')
      }

      // If the user clicked "Restore default" but also selected a new file,
      // the new file wins; otherwise the remove flag is sent.
      if (removeLogo && !formData.get('logo')) {
        formData.set('remove_logo', 'true')
      }

      // Append font files explicitly so the server action receives them.
      if (primaryFontFile) {
        formData.set('primary_font', primaryFontFile)
      }
      if (secondaryFontFile) {
        formData.set('secondary_font', secondaryFontFile)
      }

      const result = await updateAppearanceSettings(formData)
      if (result?.error) {
        playErrorSound()
        toast.error('Unable to save appearance settings', { description: result.error })
      } else if (result?.success) {
        playSuccessSound()
        toast.success('Appearance settings saved')
        setPrimaryFontFile(null)
        setSecondaryFontFile(null)
        setRemoveLogo(false)
        setLogoPreview(null)
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current)
          previewUrlRef.current = null
        }
        if (logoInputRef.current) {
          logoInputRef.current.value = ''
        }
        setResetting(false)
        router.refresh()
      } else {
        playErrorSound()
        toast.error('Unexpected response from server.')
      }
    } catch (err) {
      console.error('Appearance form submit error:', err)
      playErrorSound()
      toast.error('Something went wrong while saving.')
    } finally {
      setLoading(false)
    }
  }

  // Clean up object URL on unmount.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="reset_defaults" value={resetting ? 'true' : 'false'} />
      <fieldset disabled={!canEdit || loading} className="space-y-6">
        <SettingsSection
          title="Company logo"
          description="Upload one image and we will generate all icon and logo variants automatically. Transparent PNG works best. Max 5 MB."
        >
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 rounded-lg border border-border bg-card overflow-hidden flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displayLogoUrl}
                  alt="Company logo preview"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  ref={logoInputRef}
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  disabled={!canEdit || loading}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (previewUrlRef.current) {
                      URL.revokeObjectURL(previewUrlRef.current)
                      previewUrlRef.current = null
                    }
                    if (file) {
                      setRemoveLogo(false)
                      const url = URL.createObjectURL(file)
                      previewUrlRef.current = url
                      setLogoPreview(url)
                    } else {
                      setLogoPreview(null)
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Upload one image and we will generate all icon and logo variants automatically.
                  Transparent PNG works best. Max 5 MB.
                </p>
              </div>
            </div>
            {canEdit && logoUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  setRemoveLogo(true)
                  if (previewUrlRef.current) {
                    URL.revokeObjectURL(previewUrlRef.current)
                    previewUrlRef.current = null
                  }
                  setLogoPreview(null)
                  if (logoInputRef.current) {
                    logoInputRef.current.value = ''
                  }
                }}
              >
                Restore default logo
              </Button>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Logo text"
          description="Choose whether the company name appears next to the logo and how it is formatted."
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div className="space-y-0.5">
                <Label htmlFor="logo_text_enabled" className="text-base">Show logo text</Label>
                <p className="text-xs text-muted-foreground">
                  Turn off to display only the logo mark without any text.
                </p>
              </div>
              <Switch
                id="logo_text_enabled"
                name="logo_text_enabled"
                checked={logoTextEnabled}
                onCheckedChange={setLogoTextEnabled}
                disabled={!canEdit || loading}
              />
            </div>

            {logoTextEnabled && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="logo_text_primary">Primary text</Label>
                    <Input
                      id="logo_text_primary"
                      name="logo_text_primary"
                      value={logoTextPrimary}
                      onChange={(e) => setLogoTextPrimary(e.target.value)}
                      placeholder="Defaults to company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logo_text_secondary">Secondary text</Label>
                    <Input
                      id="logo_text_secondary"
                      name="logo_text_secondary"
                      value={logoTextSecondary}
                      onChange={(e) => setLogoTextSecondary(e.target.value)}
                      placeholder="e.g. BUILDERS MERCHANT LTD."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Text layout</Label>
                  <RadioGroup
                    name="logo_text_layout"
                    value={logoTextLayout}
                    onValueChange={(value) => setLogoTextLayout(value as typeof logoTextLayout)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    {LOGO_TEXT_LAYOUTS.map((layout) => (
                      <label
                        key={layout.value}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 cursor-pointer hover:bg-secondary/50"
                      >
                        <RadioGroupItem value={layout.value} id={`layout-${layout.value}`} />
                        <span className="text-sm font-medium">{layout.label}</span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              </>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Typography"
          description="Upload custom fonts. The primary font is used for headings and body text; the secondary font is used for monospaced or accent text."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <FontUploadField
              id="primary_font"
              name="primary_font"
              label="Primary font"
              currentUrl={resolved.primary_font_url}
              currentFamily={resolved.primary_font_family}
              disabled={!canEdit || loading}
              onChange={setPrimaryFontFile}
            />
            <FontUploadField
              id="secondary_font"
              name="secondary_font"
              label="Secondary font"
              currentUrl={resolved.secondary_font_url}
              currentFamily={resolved.secondary_font_family}
              disabled={!canEdit || loading}
              onChange={setSecondaryFontFile}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Note: invoice PDFs can only use TTF or OTF fonts. WOFF/WOFF2 will fall back to the default Helvetica in PDF output.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Colour skin"
          description="Override the default red, grey and white theme. Colours are applied across the dashboard, public site, and emails."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {THEME_COLOR_KEYS.map((key) => (
              <ColorPickerField
                key={key}
                id={key}
                name={key}
                label={THEME_COLOR_LABELS[key]}
                value={colors[key]}
                onChange={(value) => setColors((prev) => ({ ...prev, [key]: value }))}
                disabled={!canEdit || loading}
              />
            ))}
          </div>
        </SettingsSection>
      </fieldset>

      {canEdit && (
        <Card>
          <CardFooter className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                if (confirm('Reset all appearance settings to defaults?')) {
                  setResetting(true)
                  // Allow the hidden input to render, then submit.
                  setTimeout(() => {
                    formRef.current?.requestSubmit()
                  }, 0)
                }
              }}
            >
              Reset to defaults
            </Button>
            <Button type="submit" disabled={loading || !allColorsValid}>
              {loading ? 'Saving…' : 'Save Appearance'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </form>
  )
}
