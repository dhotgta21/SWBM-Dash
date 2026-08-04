// lib/turnstile.ts
// Captcha is disabled for this demo package. Stubs remain so older call sites
// compile without pulling Cloudflare Turnstile at runtime.

export const TURNSTILE_INPUT_NAME = 'cf-turnstile-response'

/** Always null: demo never renders or requires Turnstile. */
export async function getTurnstileSecretKey(): Promise<string | null> {
  return null
}

/** Always null: demo never renders or requires Turnstile. */
export async function getTurnstileSiteKey(): Promise<string | null> {
  return null
}

export function clearTurnstileCredentialCache(): void {
  // no-op
}

export function getTurnstileToken(_formData: FormData): string | null {
  return null
}

/** Always OK: captcha is not used. */
export async function verifyTurnstileToken(_token: string): Promise<string | null> {
  return null
}

/** Always OK: captcha is not used. */
export async function verifyTurnstileFormField(_formData: FormData): Promise<string | null> {
  return null
}
