// app/(auth)/register/page.tsx
// First-run client sign-up. Sealed after the first profile is
// created in the database — see isRegistrationOpen() in
// lib/actions/auth.ts.

import { notFound } from 'next/navigation'
import { AuthPage } from '@/components/auth/AuthPage'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { isRegistrationOpen } from '@/lib/actions/auth'
import { getTurnstileSiteKey } from '@/lib/turnstile'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const [{ open }, turnstileSiteKey] = await Promise.all([
    isRegistrationOpen(),
    getTurnstileSiteKey(),
  ])

  // Registration is only available while the database has zero users.
  // Once any profile exists the route is sealed forever.
  if (!open) {
    notFound()
  }

  return (
    <AuthPage image="register">
      <h1 className="sr-only">Create your client account</h1>
      <RegisterForm turnstileSiteKey={turnstileSiteKey} />
    </AuthPage>
  )
}
