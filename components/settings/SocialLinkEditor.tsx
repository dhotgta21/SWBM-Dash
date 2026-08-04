'use client'

// components/settings/SocialLinkEditor.tsx
// Per-platform social-profile editor. Replaces the old free-text textarea
// with one row per recognised platform (Facebook, Instagram, X, LinkedIn,
// TikTok, YouTube, Google Business Profile, Pinterest). Each row has the
// brand icon, an optional "boosts local SEO" badge, the URL input, and a
// "Test" link that opens the saved URL in a new tab.
//
// Backwards compatibility with the previous textarea storage:
//   - On load, we split the newline-separated `seo_same_as` blob and match
//     each URL to a platform by hostname. Anything we don't recognise
//     surfaces as a "custom link" row so no data is silently dropped.
//   - On save, the editor mirrors its state back into a hidden
//     `seo_same_as` field in the same newline-separated format, so the
//     settings action, the SEO config loader, and the footer continue to
//     work unchanged.

import { useMemo, useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  GENERIC_PLATFORM_ICON,
  SOCIAL_PLATFORMS,
  parseSocialLinks,
  serializeSocialLinks,
} from './socialPlatforms'

interface SocialLinkEditorProps {
  /** Raw newline-separated `seo_same_as` value from the company row. */
  initialRaw?: string | null
  disabled?: boolean
}

export function SocialLinkEditor({ initialRaw, disabled = false }: SocialLinkEditorProps) {
  const initial = useMemo(() => parseSocialLinks(initialRaw), [initialRaw])

  // Per-platform URL state. Empty strings mean "not set" — we strip them
  // before serialising.
  const [byId, setById] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {}
    for (const platform of SOCIAL_PLATFORMS) {
      const url = initial.byId[platform.id]
      if (url) seeded[platform.id] = url
    }
    return seeded
  })

  // Custom URLs the operator has saved that don't match a known platform.
  // We always render at least one row so the operator can add a new one
  // without first having to click "Add custom link".
  const [custom, setCustom] = useState<string[]>(() =>
    initial.custom.length > 0 ? initial.custom : [''],
  )

  const updatePlatform = (id: string, value: string) => {
    setById((prev) => {
      const next = { ...prev }
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        delete next[id]
      } else {
        next[id] = trimmed
      }
      return next
    })
  }

  const updateCustom = (index: number, value: string) => {
    setCustom((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const addCustomRow = () => {
    // If the only existing row is empty, focus it instead of adding a
    // duplicate blank row.
    if (custom.length === 1 && custom[0].trim().length === 0) return
    setCustom((prev) => [...prev, ''])
  }

  const removeCustomRow = (index: number) => {
    setCustom((prev) => {
      const next = prev.filter((_, i) => i !== index)
      // Always keep at least one row so the operator can add more later.
      return next.length === 0 ? [''] : next
    })
  }

  // Mirror the live state back to the legacy newline-separated field so
  // the existing settings action (which reads `seo_same_as`) keeps working
  // untouched.
  const serialized = useMemo(
    () => serializeSocialLinks(byId, custom.filter((c) => c.trim().length > 0)),
    [byId, custom],
  )

  const filledPlatformCount = Object.values(byId).filter((u) => u && u.trim().length > 0).length
  const filledCustomCount = custom.filter((c) => c.trim().length > 0).length
  const filledCount = filledPlatformCount + filledCustomCount

  return (
    <div className="space-y-4">
      {/* Hidden mirror so the existing settings action keeps reading the
          legacy field. This keeps the data round-trippable with anything
          that was saved before this redesign. */}
      <input type="hidden" name="seo_same_as" value={serialized} readOnly />

      <div className="space-y-2">
        {SOCIAL_PLATFORMS.map((platform) => {
          const url = byId[platform.id] ?? ''
          const isSet = url.length > 0
          return (
            <div
              key={platform.id}
              className={cn(
                'flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors sm:flex-row sm:items-center sm:gap-4',
                isSet ? 'border-primary/40 bg-primary/5' : 'border-border',
              )}
            >
              <div className="flex items-center gap-3 sm:w-56">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white shadow-sm"
                  style={{ backgroundColor: platform.brand }}
                  aria-hidden
                >
                  <platform.Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-foreground">
                    {platform.label}
                  </p>
                  {platform.seoBoost && (
                    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                      Boosts local SEO
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1">
                <Input
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  placeholder={platform.placeholder}
                  disabled={disabled}
                  onChange={(e) => updatePlatform(platform.id, e.target.value)}
                  aria-label={`${platform.label} profile URL`}
                  className="h-9"
                />
              </div>

              <div className="flex shrink-0 items-center sm:w-28 sm:justify-end">
                {isSet ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Test <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">Not set</span>
                )}
              </div>
            </div>
          )
        })}

        {/* Custom / unrecognised link rows. Any URL the user previously
            saved that didn't match a known platform lives here so we
            don't silently lose data on the first save after this redesign. */}
        {custom.map((url, index) => (
          <CustomLinkRow
            key={`custom-${index}`}
            url={url}
            disabled={disabled}
            canRemove={custom.length > 1 || (custom.length === 1 && url.trim().length > 0)}
            onChange={(value) => updateCustom(index, value)}
            onRemove={() => removeCustomRow(index)}
          />
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addCustomRow}
          disabled={disabled || (custom.length === 1 && custom[0].trim().length === 0)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add custom link
        </Button>
      </div>

      {filledCount === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          No profiles set yet. Paste a link into any platform above and
          <strong className="font-semibold text-foreground"> Save settings</strong>
          &mdash; it will appear in the site footer and feed into Google&rsquo;s
          LocalBusiness structured data automatically.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">{filledCount}</strong>{' '}
          profile{filledCount === 1 ? '' : 's'} will appear in the site footer and in
          Google&rsquo;s LocalBusiness <code className="rounded bg-muted px-1 py-0.5 text-[10px]">sameAs</code>{' '}
          data on save. Facebook, LinkedIn and Google Business Profile carry the
          strongest local-SEO signal.
        </p>
      )}
    </div>
  )
}

function CustomLinkRow({
  url,
  disabled,
  canRemove,
  onChange,
  onRemove,
}: {
  url: string
  disabled: boolean
  canRemove: boolean
  onChange: (value: string) => void
  onRemove: () => void
}) {
  const isSet = url.trim().length > 0
  // Surface the hostname so the operator can see which site the row is
  // for without having to read the full URL. Falls back to a friendly
  // placeholder when the field is empty or the URL is malformed.
  let hostLabel = 'Custom link'
  if (url.trim().length > 0) {
    try {
      hostLabel = new URL(url.trim()).hostname.replace(/^www\./, '') || 'Custom link'
    } catch {
      // Keep the generic label for malformed URLs so we don't show a
      // half-parsed host like "https://".
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-3 transition-colors sm:flex-row sm:items-center sm:gap-4',
        isSet ? 'border-primary/40 bg-primary/5' : 'border-border',
      )}
    >
      <div className="flex items-center gap-3 sm:w-56">
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted-foreground/70 text-white shadow-sm"
          aria-hidden
        >
          <GENERIC_PLATFORM_ICON className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">
            {hostLabel}
          </p>
          <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Custom link
          </p>
        </div>
      </div>

      <div className="flex-1">
        <Input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          placeholder="https://example.com/your-profile"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Custom profile URL"
          className="h-9"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:justify-end">
        {isSet ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Test <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Not set</span>
        )}
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            aria-label="Remove custom link"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default SocialLinkEditor