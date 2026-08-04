// lib/demo/brand.ts
// Demo-aware brand defaults (D-003).
//
// When NEXT_PUBLIC_DEMO_MODE=true (or DEMO_MODE=true on the server), fallbacks
// and static metadata use Demo Builder Merchant. When demo mode is off, the
// production Star Hawk defaults remain so the same codebase can ship either
// environment without a hard rename.

export const PRODUCTION_COMPANY_NAME = 'Star Hawk Builders Merchant'
export const DEMO_COMPANY_NAME = 'Demo Builder Merchant'

export const PRODUCTION_SHORT_NAME = 'Star Hawk'
export const DEMO_SHORT_NAME = 'Demo BM'

export const PRODUCTION_LEGAL_NAME = 'Star Hawk Builders Merchant Ltd.'
export const DEMO_LEGAL_NAME = 'Demo Builder Merchant'

export const PRODUCTION_SITE_URL = 'https://www.starhawkbm.com'

/**
 * True when this deployment is running as the sales demo.
 * Defaults to ON for this package (Demo Builder Merchant showcase).
 * Set NEXT_PUBLIC_DEMO_MODE=false (or DEMO_MODE=false) only if you need
 * the legacy Star Hawk production brand strings back.
 */
export function isDemoMode(): boolean {
  if (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'false' ||
    process.env.DEMO_MODE === 'false'
  ) {
    return false
  }
  // Explicit true, or default-on for this demo packaging
  return true
}

/** Fallback company / trading name when DB row is missing. */
export function getDefaultCompanyName(): string {
  return isDemoMode() ? DEMO_COMPANY_NAME : PRODUCTION_COMPANY_NAME
}

/** Short label for PWA / compact UI. */
export function getDefaultShortName(): string {
  return isDemoMode() ? DEMO_SHORT_NAME : PRODUCTION_SHORT_NAME
}

/** Legal-style name used in PDF footers and logo alts. */
export function getDefaultLegalName(): string {
  return isDemoMode() ? DEMO_LEGAL_NAME : PRODUCTION_LEGAL_NAME
}

export function getDefaultTagline(): string {
  return isDemoMode()
    ? 'Trade Merchant Platform Demo'
    : 'Building Materials & Timber'
}

export function getDefaultHomeTitle(): string {
  const name = getDefaultCompanyName()
  const tag = getDefaultTagline()
  return `${name} | ${tag}`
}

export function getDefaultHomeDescription(): string {
  const name = getDefaultCompanyName()
  if (isDemoMode()) {
    return `${name}: catalogue, invoices, CRM and client portal demo for builders merchants and specialist trades.`
  }
  return (
    `Building materials, aggregates, bricks, timber, blocks & more from ${name}. ` +
    'Same-day delivery across Greater London & the Home Counties.'
  )
}

/**
 * Canonical site URL fallback when NEXT_PUBLIC_SITE_URL is unset.
 * Demo defaults to localhost so demo deploys must set the env explicitly.
 */
export function getDefaultSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  return isDemoMode() ? 'http://localhost:3000' : PRODUCTION_SITE_URL
}

/**
 * Whether to render the hard-coded Star Hawk wordmark lockup.
 * Only for production official branding; demo always uses the company name text.
 */
export function useStarHawkWordmark(companyName?: string | null): boolean {
  if (isDemoMode()) return false
  if (!companyName) return true
  return companyName === PRODUCTION_COMPANY_NAME
}

/** Active vertical pack id (Phase B). Defaults to construction. */
export function getDemoVertical(): string {
  const raw =
    process.env.NEXT_PUBLIC_DEMO_VERTICAL ||
    process.env.DEMO_VERTICAL ||
    'construction'
  return raw.trim().toLowerCase() || 'construction'
}

/** Default logo path (shipped mark in /public). */
export function getDefaultLogoPath(): string {
  return '/Logo.webp'
}

/** Wordmark lines for HTML brand lockups (navbar / dashboard). */
export function getWordmarkLines(): { title: string; subtitle: string } {
  if (isDemoMode()) {
    return { title: 'DEMO BUILDER', subtitle: 'MERCHANT' }
  }
  return { title: 'STAR HAWK', subtitle: 'BUILDERS MERCHANT LTD.' }
}
