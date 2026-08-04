// app/(auth)/admin-login/page.tsx
// Server wrapper for the operator sign-in page.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { getPendingMfaChallenge } from '@/lib/actions/mfa'

export const metadata: Metadata = {
  title: { absolute: 'Staff sign in | Demo Builder Merchant' },
  description: 'Operator sign-in for the Demo Builder Merchant trade counter and dashboard.',
  robots: { index: false, follow: true },
}

export default async function AdminLoginPage() {
  const pendingMfa = await getPendingMfaChallenge()

  return (
    <AuthPage image="admin">
      <h1 className="sr-only">Staff sign in</h1>
      <AdminLoginForm pendingMfa={pendingMfa} />
    </AuthPage>
  )
}
