// lib/appearance.ts
// Server-only re-export of appearance helpers plus DB/CSS generation.
// Client components should import from '@/lib/appearance-shared' instead.

export * from './appearance-shared'
export type * from './appearance-shared'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type ResolvedAppearanceSettings,
  resolveColor,
  resolveAppearance,
  adjustLightness,
  withAlpha,
  guessFontFormat,
} from './appearance-shared'

/**
 * Load appearance settings from the DB. Returns defaults for any missing
 * columns so un-migrated environments don't break rendering.
 */
export async function loadAppearanceSettings(): Promise<ResolvedAppearanceSettings> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('company_settings')
      .select([
        'logo_text_enabled',
        'logo_text_primary',
        'logo_text_secondary',
        'logo_text_layout',
        'primary_font_url',
        'primary_font_family',
        'secondary_font_url',
        'secondary_font_family',
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
      ].join(', '))
      .eq('id', 1)
      .maybeSingle()

    return resolveAppearance(data as Partial<AppearanceSettings> | null)
  } catch (err) {
    console.warn('Could not load appearance settings (non-fatal):', err instanceof Error ? err.message : err)
    return resolveAppearance(null)
  }
}

function generateFontFace(name: string, url: string): string {
  const format = guessFontFormat(url)
  return `@font-face { font-family: "${name}"; src: url("${url}") format("${format}"); font-display: swap; }`
}

/**
 * Generate the CSS block that overrides theme variables and registers
 * custom fonts. Safe to render inside a `<style>` tag.
 */
export function generateAppearanceCss(settings: ResolvedAppearanceSettings): string {
  const primary = resolveColor(settings.theme_primary_color, DEFAULT_APPEARANCE.theme_primary_color)
  const primaryForeground = resolveColor(settings.theme_primary_foreground_color, DEFAULT_APPEARANCE.theme_primary_foreground_color)
  const secondary = resolveColor(settings.theme_secondary_color, DEFAULT_APPEARANCE.theme_secondary_color)
  const secondaryForeground = resolveColor(settings.theme_secondary_foreground_color, DEFAULT_APPEARANCE.theme_secondary_foreground_color)
  const background = resolveColor(settings.theme_background_color, DEFAULT_APPEARANCE.theme_background_color)
  const foreground = resolveColor(settings.theme_foreground_color, DEFAULT_APPEARANCE.theme_foreground_color)
  const card = resolveColor(settings.theme_card_color, DEFAULT_APPEARANCE.theme_card_color)
  const muted = resolveColor(settings.theme_muted_color, DEFAULT_APPEARANCE.theme_muted_color)
  const border = resolveColor(settings.theme_border_color, DEFAULT_APPEARANCE.theme_border_color)
  const success = resolveColor(settings.theme_success_color, DEFAULT_APPEARANCE.theme_success_color)
  const warning = resolveColor(settings.theme_warning_color, DEFAULT_APPEARANCE.theme_warning_color)
  const destructive = resolveColor(settings.theme_destructive_color, DEFAULT_APPEARANCE.theme_destructive_color)

  const primaryMuted = withAlpha(primary, 0.1)
  const primaryHover = adjustLightness(primary, -10)

  const variables = [
    `--background: ${background};`,
    `--foreground: ${foreground};`,
    `--card: ${card};`,
    `--card-foreground: ${foreground};`,
    `--popover: ${card};`,
    `--popover-foreground: ${foreground};`,
    `--primary: ${primary};`,
    `--primary-foreground: ${primaryForeground};`,
    `--secondary: ${secondary};`,
    `--secondary-foreground: ${secondaryForeground};`,
    `--muted: ${muted};`,
    `--muted-foreground: ${foreground};`,
    `--accent: ${primaryMuted};`,
    `--accent-foreground: ${primary};`,
    `--destructive: ${destructive};`,
    `--destructive-foreground: #ffffff;`,
    `--border: ${border};`,
    `--input: ${border};`,
    `--ring: ${primary};`,
    `--success: ${success};`,
    `--warning: ${warning};`,
    `--radius: 0.625rem;`,
    `--primary-hover: ${primaryHover};`,
  ]

  if (settings.primary_font_family) {
    variables.push(`--font-sans: ${settings.primary_font_family}, ui-sans-serif, system-ui, sans-serif;`)
  }
  if (settings.secondary_font_family) {
    variables.push(`--font-mono: ${settings.secondary_font_family}, ui-monospace, monospace;`)
  }

  const fontFaces: string[] = []
  if (settings.primary_font_url && settings.primary_font_family) {
    fontFaces.push(generateFontFace(settings.primary_font_family, settings.primary_font_url))
  }
  if (settings.secondary_font_url && settings.secondary_font_family) {
    fontFaces.push(generateFontFace(settings.secondary_font_family, settings.secondary_font_url))
  }

  return `${fontFaces.join('\n')}\n:root { ${variables.join(' ')} }`
}
