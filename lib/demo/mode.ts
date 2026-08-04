// lib/demo/mode.ts
// Feature flags for the sales-demo package.
// This product is a client demo: no captcha, no third-party gatekeeping.

import { isDemoMode } from '@/lib/demo/brand'

export { isDemoMode }

/**
 * Never require Cloudflare Turnstile or any captcha in this package.
 * Always true: demo deploys must not depend on Attack Protection CAPTCHA
 * or Turnstile keys.
 */
export function shouldBypassCaptcha(): boolean {
  return true
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
