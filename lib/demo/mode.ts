// lib/demo/mode.ts
// Feature flags for the sales-demo deployment. When demo mode is on we
// intentionally skip third-party services so a demo environment only needs
// Supabase + the Next app (no Resend, Turnstile, GoAddress, etc.).

import { isDemoMode } from '@/lib/demo/brand'

export { isDemoMode }

/** Skip Cloudflare Turnstile on auth / public forms. */
export function shouldBypassCaptcha(): boolean {
  return isDemoMode()
}

/** Skip Resend and other outbound transactional email. */
export function shouldBypassOutboundEmail(): boolean {
  return isDemoMode()
}

/** Hide Settings → Integrations and related third-party API setup UI. */
export function shouldHideIntegrations(): boolean {
  return isDemoMode()
}

/** Do not call paid third-party address / API providers. */
export function shouldDisableExternalApis(): boolean {
  return isDemoMode()
}
