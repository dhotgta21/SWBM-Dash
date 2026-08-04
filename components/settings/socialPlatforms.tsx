// components/settings/socialPlatforms.tsx
// Canonical list of social / identity platforms the Settings UI and the
// site footer recognise. Keeping this in one file means the settings form
// and the footer agree on what counts as a "known" platform — and lets us
// drop in new platforms (Threads, Bluesky, Nextdoor, etc.) without
// touching either consumer.
//
// Each entry carries:
//   - id: stable identifier used as the form field suffix and React key
//   - label: human-readable name shown in the settings UI and footer
//   - hostPatterns: regexes matched against the URL hostname (after the
//     leading www. is stripped) to auto-detect the platform from a pasted
//     URL or to attach a brand icon in the footer.
//   - brand: brand-colour used to tint the icon chip in the settings UI.
//   - Icon: inline SVG component. Brand-coloured where it matters, white
//     when rendered inside the brand-coloured chip.
//   - placeholder: example URL that doubles as a UX hint.
//   - seoBoost: whether Google specifically rewards this URL in the
//     LocalBusiness sameAs field. Shown as a small badge in the UI.
//
// `lucide-react@1.20` (the version this project pins) doesn't ship the
// modern brand icons (Facebook, Twitter, etc.), so each Icon is an inline
// SVG that always renders at the requested size and inherits `currentColor`
// for the foreground stroke.

import * as React from 'react'

export interface SocialPlatform {
  id: string
  label: string
  hostPatterns: RegExp[]
  brand: string
  Icon: React.ComponentType<{ className?: string }>
  placeholder: string
  /** Google LocalBusiness `sameAs` trusts these platforms more for verifying
   *  the business for local results. Surfaced as a small badge in the UI. */
  seoBoost: boolean
  /** Short alias used in the footer button when there isn't enough room
   *  to fit the full URL host. Falls back to the parsed hostname. */
  shortName?: string
}

interface IconProps {
  className?: string
  fill?: string
}

function FacebookIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M13.5 21v-7.5h2.55l.39-2.94H13.5V8.61c0-.85.24-1.43 1.46-1.43h1.56V4.55c-.27-.04-1.2-.12-2.28-.12-2.25 0-3.79 1.37-3.79 3.89v2.18H8v2.94h2.45V21h3.05z"
      />
    </svg>
  )
}

function InstagramIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2.2c2.7 0 3.04.01 4.1.06 1.06.05 1.79.22 2.42.47.66.26 1.21.6 1.77 1.16.55.55.9 1.1 1.15 1.76.25.64.42 1.37.47 2.43.05 1.06.06 1.4.06 4.1s-.01 3.04-.06 4.1c-.05 1.06-.22 1.79-.47 2.42-.26.66-.6 1.21-1.15 1.77-.56.55-1.1.9-1.77 1.15-.64.25-1.37.42-2.42.47-1.06.05-1.4.06-4.1.06s-3.04-.01-4.1-.06c-1.06-.05-1.79-.22-2.42-.47a4.78 4.78 0 0 1-1.77-1.15 4.78 4.78 0 0 1-1.15-1.77c-.25-.64-.42-1.37-.47-2.42-.05-1.06-.06-1.4-.06-4.1s.01-3.04.06-4.1c.05-1.06.22-1.79.47-2.42.26-.66.6-1.21 1.15-1.77A4.78 4.78 0 0 1 5.5 2.73c.64-.25 1.37-.42 2.42-.47C8.98 2.21 9.32 2.2 12 2.2zm0 1.8c-2.64 0-2.94.01-3.98.06-.96.04-1.48.2-1.83.34-.46.18-.79.4-1.13.74-.35.35-.57.68-.74 1.13-.14.35-.3.87-.34 1.83-.05 1.04-.06 1.34-.06 3.98s.01 2.94.06 3.98c.04.96.2 1.48.34 1.83.18.46.4.79.74 1.13.35.35.68.57 1.13.74.35.14.87.3 1.83.34 1.04.05 1.34.06 3.98.06s2.94-.01 3.98-.06c.96-.04 1.48-.2 1.83-.34.46-.18.79-.4 1.13-.74.35-.35.57-.68.74-1.13.14-.35.3-.87.34-1.83.05-1.04.06-1.34.06-3.98s-.01-2.94-.06-3.98c-.04-.96-.2-1.48-.34-1.83a3.04 3.04 0 0 0-.74-1.13 3.04 3.04 0 0 0-1.13-.74c-.35-.14-.87-.3-1.83-.34-1.04-.05-1.34-.06-3.98-.06zM12 7.18a4.82 4.82 0 1 1 0 9.64 4.82 4.82 0 0 1 0-9.64zm0 1.8a3.02 3.02 0 1 0 0 6.04 3.02 3.02 0 0 0 0-6.04zm5-2.6a1.13 1.13 0 1 1-2.26 0 1.13 1.13 0 0 1 2.26 0z"
      />
    </svg>
  )
}

function XIcon({ className }: IconProps) {
  // Post-rebrand X (formerly Twitter) mark.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M17.53 3H20.5l-6.5 7.43L21.75 21h-6l-4.7-6.14L5.6 21H2.62l6.96-7.96L2.25 3h6.14l4.25 5.62L17.53 3zm-1.05 16.2h1.64L7.62 4.7H5.86L16.48 19.2z"
      />
    </svg>
  )
}

function LinkedInIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v14H.22V8zm7.55 0h4.37v1.92h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.48 3.04 5.48 6.99V22h-4.56v-6.2c0-1.48-.03-3.38-2.06-3.38-2.06 0-2.38 1.61-2.38 3.27V22H7.77V8z"
      />
    </svg>
  )
}

function TikTokIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M19.6 6.32a4.85 4.85 0 0 1-3.02-1.05 4.84 4.84 0 0 1-1.78-3.27h-3.04v13.55a2.49 2.49 0 1 1-1.76-2.39V9.99a5.49 5.49 0 1 0 4.76 5.45V9.5a7.84 7.84 0 0 0 4.84 1.65V8.1c-.34 0-.67-.04-1-.13v-1.65z"
      />
    </svg>
  )
}

function YouTubeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M23.5 6.2a3.02 3.02 0 0 0-2.13-2.14C19.49 3.6 12 3.6 12 3.6s-7.49 0-9.37.46A3.02 3.02 0 0 0 .5 6.2C.04 8.09.04 12 .04 12s0 3.91.46 5.8a3.02 3.02 0 0 0 2.13 2.14C4.51 20.4 12 20.4 12 20.4s7.49 0 9.37-.46a3.02 3.02 0 0 0 2.13-2.14c.46-1.89.46-5.8.46-5.8s0-3.91-.46-5.8zM9.6 15.6V8.4l6.24 3.6L9.6 15.6z"
      />
    </svg>
  )
}

function GoogleBusinessIcon({ className }: IconProps) {
  // Stylised "G" mark — the Google Business Profile wordmark.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 11v2.4h6.8c-.3 1.7-2 4.8-6.8 4.8a7.2 7.2 0 1 1 0-14.4c1.93 0 3.23.82 3.97 1.53l2.7-2.6A9.6 9.6 0 1 0 21.6 12c0-.67-.07-1.33-.2-1.95L12 11z"
      />
    </svg>
  )
}

function PinterestIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12.04 2C6.5 2 2.13 6.37 2.13 11.91c0 3.7 1.99 6.94 4.94 8.4-.07-.71-.13-1.81.03-2.59.15-.71.95-4.5.95-4.5s-.24-.49-.24-1.21c0-1.13.66-1.98 1.48-1.98.7 0 1.04.52 1.04 1.15 0 .7-.45 1.75-.68 2.72-.19.83.41 1.5 1.23 1.5 1.48 0 2.61-1.56 2.61-3.81 0-1.99-1.43-3.38-3.47-3.38-2.36 0-3.75 1.77-3.75 3.6 0 .71.27 1.48.62 1.9.07.08.08.15.06.23-.06.26-.21.83-.24.94-.04.16-.13.2-.3.12-1.11-.52-1.81-2.14-1.81-3.45 0-2.81 2.04-5.39 5.89-5.39 3.09 0 5.49 2.2 5.49 5.15 0 3.07-1.94 5.55-4.63 5.55-.91 0-1.76-.47-2.05-1.03l-.56 2.13c-.2.78-.75 1.76-1.11 2.35.83.26 1.71.4 2.64.4 5.53 0 9.91-4.46 9.91-9.9C21.94 6.36 17.56 2 12.04 2z"
      />
    </svg>
  )
}

/**
 * Rendered for any saved URL whose host doesn't match a known platform.
 * The settings UI uses this for the "Custom link" row and the footer
 * falls back to it when an identity URL is unrecognised.
 */
function GenericLinkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M10.59 13.41a1 1 0 0 1 0-1.41l3-3a3 3 0 1 1 4.24 4.24l-1.5 1.5a1 1 0 1 1-1.41-1.41l1.5-1.5a1 1 0 0 0-1.41-1.42l-3 3a1 1 0 0 1-1.42 0zm2.82-2.82a1 1 0 0 1 0 1.41l-3 3a1 1 0 1 1-1.41-1.41l3-3a1 1 0 0 1 1.41 0zM4 12a8 8 0 1 1 14.93 4h2.07a1 1 0 1 1 0 2h-3.5a1 1 0 0 1-.86-1.5l1.5-2.6a6 6 0 1 0-7.28 7.28l-2.6 1.5A1 1 0 0 1 7 22v-3.5a1 1 0 1 1 2 0v2.07A8 8 0 0 1 4 12z"
      />
    </svg>
  )
}

export const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'facebook',
    label: 'Facebook',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?facebook\.com$/i, /^(?:[a-z0-9-]+\.)?fb\.com$/i, /^(?:[a-z0-9-]+\.)?fb\.me$/i],
    brand: '#1877F2',
    Icon: FacebookIcon,
    placeholder: 'https://www.facebook.com/yourpage',
    seoBoost: true,
    shortName: 'Facebook',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?instagram\.com$/i, /^(?:[a-z0-9-]+\.)?instagr\.am$/i],
    brand: '#E4405F',
    Icon: InstagramIcon,
    placeholder: 'https://www.instagram.com/yourpage',
    seoBoost: false,
    shortName: 'Instagram',
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?x\.com$/i, /^(?:[a-z0-9-]+\.)?twitter\.com$/i, /^(?:[a-z0-9-]+\.)?t\.co$/i],
    brand: '#0F1419',
    Icon: XIcon,
    placeholder: 'https://x.com/yourhandle',
    seoBoost: false,
    shortName: 'X',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?linkedin\.com$/i, /^(?:[a-z0-9-]+\.)?lnkd\.in$/i],
    brand: '#0A66C2',
    Icon: LinkedInIcon,
    placeholder: 'https://www.linkedin.com/company/yourpage',
    seoBoost: true,
    shortName: 'LinkedIn',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?tiktok\.com$/i],
    brand: '#010101',
    Icon: TikTokIcon,
    placeholder: 'https://www.tiktok.com/@yourhandle',
    seoBoost: false,
    shortName: 'TikTok',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?youtube\.com$/i, /^(?:[a-z0-9-]+\.)?youtu\.be$/i],
    brand: '#FF0000',
    Icon: YouTubeIcon,
    placeholder: 'https://www.youtube.com/@yourchannel',
    seoBoost: false,
    shortName: 'YouTube',
  },
  {
    id: 'google_business',
    label: 'Google Business Profile',
    hostPatterns: [
      /^(?:[a-z0-9-]+\.)?google\.com$/i,
      /^(?:[a-z0-9-]+\.)?google\.co\.uk$/i,
      /^(?:[a-z0-9-]+\.)?maps\.app\.goo\.gl$/i,
      /^(?:[a-z0-9-]+\.)?goo\.gl$/i,
      /^(?:[a-z0-9-]+\.)?business\.google\.com$/i,
    ],
    // hostPatterns alone can't tell Google Maps from other Google URLs —
    // platform resolution always requires a path check below.
    brand: '#4285F4',
    Icon: GoogleBusinessIcon,
    placeholder: 'https://www.google.com/maps/place/...',
    seoBoost: true,
    shortName: 'Google',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    hostPatterns: [/^(?:[a-z0-9-]+\.)?pinterest\.com$/i, /^(?:[a-z0-9-]+\.)?pin\.it$/i],
    brand: '#E60023',
    Icon: PinterestIcon,
    placeholder: 'https://www.pinterest.com/yourpage',
    seoBoost: false,
    shortName: 'Pinterest',
  },
]

export const GENERIC_PLATFORM_ICON = GenericLinkIcon

/**
 * Match a URL to a known platform. Returns the platform id (e.g. `facebook`)
 * or null when the URL doesn't match. Used by the settings form to seed the
 * right platform row from a previously-saved newline-separated list and by
 * the site footer to swap the neutral Globe icon for the brand icon.
 *
 * The Google Business entry needs special handling — `google.com` alone is
 * not enough, we also require a `/maps` or `business.google.com` path. The
 * pattern list above intentionally still includes bare `google.com` for
 * readability; the path gate below catches false positives.
 */
export function identifySocialPlatform(url: string): SocialPlatform | null {
  let host = ''
  let path = ''
  try {
    const parsed = new URL(url)
    host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    path = parsed.pathname.toLowerCase()
  } catch {
    return null
  }

  // Google Business Profile: bare google.com with /maps OR the dedicated
  // business.google.com subdomain. Other google.com URLs (search, mail,
  // etc.) fall through to "custom" so we never accidentally claim a
  // Gmail or Google+ URL.
  if (/google\.(com|co\.uk)$/.test(host) && !/maps|\/place\/|\/dir\//.test(path)) {
    return null
  }

  for (const platform of SOCIAL_PLATFORMS) {
    if (platform.hostPatterns.some((re) => re.test(host))) {
      return platform
    }
  }
  return null
}

/**
 * Split the operator-supplied `seo_same_as` blob into per-platform URLs
 * plus a list of URLs that didn't match a known platform. The settings
 * form keeps the latter as "custom link" rows so we never silently drop
 * a URL the user previously saved.
 */
export function parseSocialLinks(raw: string | null | undefined): {
  byId: Record<string, string>
  custom: string[]
} {
  const urls = (raw ?? '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/[^\s]+$/i.test(s))

  const byId: Record<string, string> = {}
  const custom: string[] = []

  for (const url of urls) {
    const platform = identifySocialPlatform(url)
    if (platform) {
      // First URL wins for any given platform. Extra URLs (e.g. personal
      // + business page for the same network) are surfaced as custom
      // links so the operator can decide what to keep.
      if (!byId[platform.id]) byId[platform.id] = url
      else custom.push(url)
    } else {
      custom.push(url)
    }
  }

  return { byId, custom }
}

/**
 * Combine per-platform URLs and custom URLs back into the canonical
 * newline-separated string that goes into the `seo_same_as` column.
 * Order: recognised platforms first (in declaration order), then any
 * custom URLs the operator wants to keep verbatim.
 */
export function serializeSocialLinks(
  byId: Record<string, string>,
  custom: string[],
): string {
  const parts: string[] = []
  for (const platform of SOCIAL_PLATFORMS) {
    const url = byId[platform.id]
    if (url && url.trim().length > 0) parts.push(url.trim())
  }
  for (const url of custom) {
    const trimmed = url.trim()
    if (trimmed.length > 0) parts.push(trimmed)
  }
  return parts.join('\n')
}

/**
 * Pick a labelled footer entry for a URL. Prefers a recognised platform's
 * `shortName`, falls back to the URL's hostname (with leading `www.`
 * stripped) for unrecognised URLs. Kept here so the footer can stay
 * agnostic of how the settings form stored things.
 */
export function labelForSocialUrl(url: string): string {
  const platform = identifySocialPlatform(url)
  if (platform) return platform.shortName ?? platform.label
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function iconForSocialUrl(url: string): React.ComponentType<{ className?: string }> {
  const platform = identifySocialPlatform(url)
  return platform ? platform.Icon : GENERIC_PLATFORM_ICON
}

export function brandColourForSocialUrl(url: string): string | null {
  const platform = identifySocialPlatform(url)
  return platform ? platform.brand : null
}