// app/(auth)/login/page.tsx
// Server wrapper for the client portal sign-in page. Exports
// metadata and a semantic H1 while the interactive form lives
// in a client component.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { ClientLoginForm } from '@/components/auth/ClientLoginForm'
import { getTurnstileSiteKey } from '@/lib/turnstile'

export const metadata: Metadata = {
  title: { absolute: 'Client portal sign in | Star Hawk Builders Merchant' },
  description:
    'Sign in to the Star Hawk client portal to view invoices, quotes and account details.',
  robots: { index: false, follow: true },
}

export default async function LoginPage() {
  // MFA is admin-only — client portal never challenges for 2FA.
  const turnstileSiteKey = await getTurnstileSiteKey()

  return (
    <AuthPage image="login">
      <h1 className="sr-only">Client portal sign in</h1>
      <ClientLoginForm turnstileSiteKey={turnstileSiteKey} />
    </AuthPage>
  )
}
