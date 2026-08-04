/**
 * Build a Resend-compatible `From` header from the operator-configured
 * `RESEND_FROM_ADDRESS` env var and an optional friendly sender name.
 *
 * Resend accepts two formats:
 *   - email@example.com
 *   - Name <email@example.com>
 *
 * This helper normalises the value, quotes display names that contain
 * RFC 5322 special characters, and validates the email part so a bad
 * env var produces a clear error instead of Resend's opaque
 * "Invalid `from` field" response.
 */

// Practical email check. We keep it intentionally permissive: the real
// validation happens at the SMTP/Resend layer; this just catches obvious
// malformed values (missing @, missing TLD, whitespace, etc.).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// RFC 5322 special characters that require a display name to be quoted.
const DISPLAY_NAME_SPECIALS_RE = /[<>()\[\]\\.,;:@"]/

export interface FromHeaderResult {
  ok: true
  fromHeader: string
}

export interface FromHeaderError {
  ok: false
  error: string
}

export function buildEmailFromHeader(
  envFrom: string | undefined,
  friendlyName: string | undefined | null
): FromHeaderResult | FromHeaderError {
  // Some operators paste the example value with literal surrounding quotes
  // (e.g. from .env.example or Vercel's UI). Strip them before parsing so
  // "Name <email>" is handled the same as Name <email>.
  const raw = (envFrom ?? '').trim().replace(/^"(.*)"$/, '$1')
  if (!raw) {
    return { ok: false, error: 'RESEND_FROM_ADDRESS is not set.' }
  }

  // Already in "Name <email>" format — parse, normalise, and validate.
  const bracketMatch = raw.match(/^(.*?)\s*<([^>]*)>\s*$/)
  if (bracketMatch) {
    const displayName = bracketMatch[1].trim().replace(/^"(.*)"$/, '$1')
    const email = bracketMatch[2].trim()

    if (!email || !EMAIL_REGEX.test(email)) {
      return {
        ok: false,
        error: `Invalid email address in RESEND_FROM_ADDRESS (${email || 'empty'}). Use email@example.com or Name <email@example.com>.`,
      }
    }

    if (!displayName) {
      return { ok: true, fromHeader: email }
    }

    return {
      ok: true,
      fromHeader: `${quoteDisplayName(displayName)} <${email}>`,
    }
  }

  // Plain email address.
  if (!EMAIL_REGEX.test(raw)) {
    return {
      ok: false,
      error: `Invalid RESEND_FROM_ADDRESS (${raw}). Use email@example.com or Name <email@example.com>.`,
    }
  }

  const name = (friendlyName ?? '').trim()
  if (!name) {
    return { ok: true, fromHeader: raw }
  }

  return { ok: true, fromHeader: `${quoteDisplayName(name)} <${raw}>` }
}

function quoteDisplayName(name: string): string {
  if (DISPLAY_NAME_SPECIALS_RE.test(name)) {
    // Escape backslashes and quotes, then wrap in double quotes.
    return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return name
}
