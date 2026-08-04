// app/(auth)/admin-login/page.tsx
// Server wrapper for the operator sign-in page. Exports metadata
// and a semantic H1 while the interactive form lives in a client
// component.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { getTurnstileSiteKey } from '@/lib/turnstile'
import { getPendingMfaChallenge } from '@/lib/actions/mfa'

export const metadata: Metadata = {
  title: { absolute: `Staff sign in | ${process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'Demo Builder Merchant' : 'Star Hawk Builders Merchant'}` },
  description: 'Operator sign-in for the Star Hawk trade counter and dashboard.',
  robots: { index: false, follow: true },
}

export default async function AdminLoginPage() {
  const [turnstileSiteKey, pendingMfa] = await Promise.all([
    getTurnstileSiteKey(),
    getPendingMfaChallenge(),
  ])

  return (
    <AuthPage image="admin">
      <h1 className="sr-only">Staff sign in</h1>
      <AdminLoginForm turnstileSiteKey={turnstileSiteKey} pendingMfa={pendingMfa} />
    </AuthPage>
  )
}
