// app/(auth)/login/page.tsx
// Client portal sign-in. Demo: no captcha.

import type { Metadata } from 'next'
import { AuthPage } from '@/components/auth/AuthPage'
import { ClientLoginForm } from '@/components/auth/ClientLoginForm'

export const metadata: Metadata = {
  title: { absolute: 'Client portal sign in | Demo Builder Merchant' },
  description:
    'Sign in to the Demo Builder Merchant client portal to view invoices, quotes and account details.',
  robots: { index: false, follow: true },
}

export default function LoginPage() {
  return (
    <AuthPage image="login">
      <h1 className="sr-only">Client portal sign in</h1>
      <ClientLoginForm />
    </AuthPage>
  )
}
