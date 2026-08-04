// app/(auth)/layout.tsx
// Thin pass-through layout for every unauthenticated surface in
// the app (sign-in, admin sign-in, register, reset-password,
// update-password, invite set-password).
//
// What lives here vs. the per-page content:
//
//   • `dynamic = 'force-dynamic'` — required so the proxy-injected
//     CSP nonce (see proxy.ts) can be applied to the framework
//     scripts that hydrate these pages.
//
//   • The children — the actual <AuthPage> wrapper, supplied by
//     each page. <AuthPage> handles the company_settings load and
//     the per-page brand-panel image so the layout stays
//     page-agnostic and the four auth pages can render with
//     distinct images at the route segment level.
//
// The phone + company name on the brand panel are pulled from
// company_settings inside <AuthPage> so the auth surfaces always
// match the marketing site. If the DB is unreachable (dev/build,
// missing env) <AuthPage> falls back to a neutral default and
// logs a warning — the auth surface is on the critical path for
// first-run setup, so we never want it blocked by a loadCompany()
// error.

import { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
