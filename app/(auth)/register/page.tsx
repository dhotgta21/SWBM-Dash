// app/(auth)/register/page.tsx
// First-run admin bootstrap. Demo: no captcha.

import { notFound } from 'next/navigation'
import { AuthPage } from '@/components/auth/AuthPage'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { isRegistrationOpen } from '@/lib/actions/auth'

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  const { open } = await isRegistrationOpen()

  if (!open) {
    notFound()
  }

  return (
    <AuthPage image="register">
      <h1 className="sr-only">Create your client account</h1>
      <RegisterForm />
    </AuthPage>
  )
}
