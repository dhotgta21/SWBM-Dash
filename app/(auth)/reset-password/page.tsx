// app/(auth)/reset-password/page.tsx
// Server wrapper for the password reset page. Exports metadata
// and a semantic H1 while the interactive form lives in a
// client component.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { getTurnstileSiteKey } from '@/lib/turnstile'

export const metadata: Metadata = {
  title: { absolute: `Reset your password | ${process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'Demo Builder Merchant' : 'Demo Builder Merchant'}` },
  description:
    'Enter your email and we will send you a secure link to reset your Demo Builder Merchant account password.',
  robots: { index: false, follow: true },
}

export default async function ResetPasswordPage() {
  const turnstileSiteKey = await getTurnstileSiteKey()

  return (
    <AuthPage image="reset">
      <h1 className="sr-only">Reset your password</h1>
      <ResetPasswordForm turnstileSiteKey={turnstileSiteKey} />
    </AuthPage>
  )
}
