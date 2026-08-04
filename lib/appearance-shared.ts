// lib/appearance-shared.ts
// Shared types, defaults, and helpers for the Appearance / UI customisation
// feature. Safe to import from both client and server components.

export interface AppearanceSettings {
  logo_text_enabled: boolean | null
  logo_text_primary: string | null
  logo_text_secondary: string | null
  logo_text_layout: string | null
  primary_font_url: string | null
  primary_font_family: string | null
  secondary_font_url: string | null
  secondary_font_family: string | null
  theme_primary_color: string | null
  theme_primary_foreground_color: string | null
  theme_secondary_color: string | null
  theme_secondary_foreground_color: string | null
  theme_background_color: string | null
  theme_foreground_color: string | null
  theme_card_color: string | null
  theme_muted_color: string | null
  theme_border_color: string | null
  theme_success_color: string | null
  theme_warning_color: string | null
  theme_destructive_color: string | null
}

export const DEFAULT_APPEARANCE = {
  logo_text_enabled: true,
  logo_text_primary: '',
  logo_text_secondary: '',
  logo_text_layout: 'stacked',
  primary_font_url: '',
  primary_font_family: '',
  secondary_font_url: '',
  secondary_font_family: '',
  theme_primary_color: '#b91c1c',
  theme_primary_foreground_color: '#ffffff',
  theme_secondary_color: '#f1f5f9',
  theme_secondary_foreground_color: '#0f172a',
  theme_background_color: '#f8f9fb',
  theme_foreground_color: '#0f172a',
  theme_card_color: '#ffffff',
  theme_muted_color: '#f1f5f9',
  theme_border_color: '#e2e8f0',
  theme_success_color: '#16a34a',
  theme_warning_color: '#d97706',
  theme_destructive_color: '#dc2626',
} as const satisfies AppearanceSettings

export const LOGO_TEXT_LAYOUTS = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'inline', label: 'Inline' },
  { value: 'single-line', label: 'Single line' },
  { value: 'icon-only', label: 'Icon only' },
] as const

export type LogoTextLayout = (typeof LOGO_TEXT_LAYOUTS)[number]['value']

export const THEME_COLOR_KEYS = [
  'theme_primary_color',
  'theme_primary_foreground_color',
  'theme_secondary_color',
  'theme_secondary_foreground_color',
  'theme_background_color',
  'theme_foreground_color',
  'theme_card_color',
  'theme_muted_color',
  'theme_border_color',
  'theme_success_color',
  'theme_warning_color',
  'theme_destructive_color',
] as const

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number]

export type ResolvedAppearanceSettings = {
  [K in keyof AppearanceSettings]: NonNullable<AppearanceSettings[K]>
}

export const THEME_COLOR_LABELS: Record<ThemeColorKey, string> = {
  theme_primary_color: 'Primary brand',
  theme_primary_foreground_color: 'Primary text',
  theme_secondary_color: 'Secondary background',
  theme_secondary_foreground_color: 'Secondary text',
  theme_background_color: 'Page background',
  theme_foreground_color: 'Body text',
  theme_card_color: 'Card background',
  theme_muted_color: 'Muted background',
  theme_border_color: 'Borders',
  theme_success_color: 'Success',
  theme_warning_color: 'Warning',
  theme_destructive_color: 'Destructive / error',
}

const hexRegex = /^#([0-9a-fA-F]{3}){1,2}$/

export function isValidHex(value: string): boolean {
  return hexRegex.test(value)
}

export function normalizeHex(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!isValidHex(trimmed)) return null
  return trimmed.toLowerCase()
}

export function resolveColor(value: string | null | undefined, fallback: string): string {
  return normalizeHex(value) ?? fallback
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return { h: h * 360, s: s * 100, l: l * 100 }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360
  s /= 100
  l /= 100
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  }
}

export function adjustLightness(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex)
  const hsl = rgbToHsl(r, g, b)
  hsl.l = Math.max(0, Math.min(100, hsl.l + amount))
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l)
  return rgbToHex(rgb.r, rgb.g, rgb.b)
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const FALLBACK_APPEARANCE = DEFAULT_APPEARANCE as unknown as ResolvedAppearanceSettings

export function resolveAppearance(
  settings: Partial<AppearanceSettings> | null | undefined,
): ResolvedAppearanceSettings {
  const result: Record<string, unknown> = { ...FALLBACK_APPEARANCE }
  if (!settings) return result as ResolvedAppearanceSettings

  for (const _key of Object.keys(FALLBACK_APPEARANCE) as Array<keyof AppearanceSettings>) {
    const key = _key
    const value = settings[key]
    if (value !== null && value !== undefined) {
      // Theme colours must be valid hex; fall back to default otherwise.
      if (THEME_COLOR_KEYS.includes(key as ThemeColorKey)) {
        const normalized = normalizeHex(value as string)
        if (normalized) {
          result[key] = normalized
        }
      } else {
        result[key] = value
      }
    }
  }

  return result as ResolvedAppearanceSettings
}

export function guessFontFormat(url: string): string {
  const lower = url.toLowerCase()
  if (lower.endsWith('.woff2')) return 'woff2'
  if (lower.endsWith('.woff')) return 'woff'
  if (lower.endsWith('.otf')) return 'opentype'
  return 'truetype'
}
