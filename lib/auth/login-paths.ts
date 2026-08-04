/**
 * Single source of truth for the operator sign-in URL.
 *
 * The "hidden admin URL" pattern keeps the operator sign-in off the
 * default /login route so drive-by scanners don't find it. The URL is
 * configurable via env so it can be rotated without a code change and
 * (more importantly) so the literal string doesn't have to live in
 * source control under a developer's personal name.
 *
 * Lookup order (first non-empty wins):
 *   1. ADMIN_LOGIN_PATH            — server-only override
 *   2. NEXT_PUBLIC_ADMIN_LOGIN_PATH — works on both client + server
 *      (NEXT_PUBLIC_ vars are inlined into client bundles at build time)
 *   3. '/admin-login'              — safe, neutral default; the rewrite
 *      rule in next.config.ts maps this to the canonical sign-in page
 *
 * NOTE: the path MUST start with '/'. A value without a leading slash
 * would produce a broken URL like 'admin-login' instead of '/admin-login'.
 *
 * Importing this module is safe from both server contexts (server
 * actions, server components) and client contexts (client components)
 * — process.env reads work everywhere.
 */

const rawPath =
  process.env.ADMIN_LOGIN_PATH ||
  process.env.NEXT_PUBLIC_ADMIN_LOGIN_PATH ||
  '/admin-login'

/** Normalised operator sign-in path. Always starts with '/', no trailing slash. */
export const ADMIN_LOGIN_PATH: string = (() => {
  const trimmed = rawPath.trim()
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+$/, '') || '/admin-login'
})()