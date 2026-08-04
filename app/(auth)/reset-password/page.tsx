// app/(auth)/reset-password/page.tsx
// Password reset. Demo: no captcha.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata: Metadata = {
  title: { absolute: 'Reset your password | Demo Builder Merchant' },
  description:
    'Enter your email and we will send you a secure link to reset your Demo Builder Merchant account password.',
  robots: { index: false, follow: true },
}

export default function ResetPasswordPage() {
  return (
    <AuthPage image="reset">
      <h1 className="sr-only">Reset your password</h1>
      <ResetPasswordForm />
    </AuthPage>
  )
}
