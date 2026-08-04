import { loadAppearanceSettings, generateAppearanceCss } from '@/lib/appearance'

/**
 * Server component that injects the configured appearance CSS variables and
 * custom @font-face rules. Placed in the root layout so the theme applies to
 * every route without a client-side flash of unstyled content.
 */
export async function AppearanceStyles() {
  const settings = await loadAppearanceSettings()
  const css = generateAppearanceCss(settings)

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
