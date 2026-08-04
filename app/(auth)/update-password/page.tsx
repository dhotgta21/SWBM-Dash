import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthPage } from '@/components/auth/AuthPage'
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm'

export const dynamic = 'force-dynamic'

interface UpdatePasswordPageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function UpdatePasswordPage({ searchParams }: UpdatePasswordPageProps) {
  const { code } = await searchParams

  // Recovery links used to land here directly with ?code=… and exchange
  // inline, but cookies set during a Server Component render are not always
  // persisted to the browser. That caused the subsequent form submission
  // (a Server Action) to fail with "Auth session missing!".
  //
  // The exchange now happens in /auth/callback, which redirects back here
  // so the next request carries the session cookie. New reset emails point
  // to /auth/callback directly; this branch also catches any old links or
  // direct visits that still carry ?code=…
  if (code) {
    redirect(
      `/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent('/update-password')}`
    )
  }

  // No code in the URL. Allow the page to render only if the user already
  // has a valid session (e.g. they're already signed in). Otherwise bounce
  // them to the reset-request page so they can get a fresh link.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/reset-password')
  }

  // Resolve the role so we know where to send the user after the save:
  // clients back to /login, operators (admin / staff / picker / driver) back to the
  // hidden admin sign-in URL. `nextPath` (with ?welcome=1) is where the form
  // auto-redirects after a successful save; `backHref` (no flag) is the
  // manual "Back to sign in" link. Without this split, every operator who
  // resets their password gets bounced to the client portal and has to click
  // "Staff sign in" again.
  let backHref = '/login'
  let nextPath = '/login?welcome=1'
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'picker' || profile?.role === 'driver') {
      const { ADMIN_LOGIN_PATH } = await import('@/lib/auth/login-paths')
      backHref = ADMIN_LOGIN_PATH
      nextPath = `${ADMIN_LOGIN_PATH}?welcome=1`
    }
  } catch {
    // Fall back to /login on any lookup error — the link still works, it
    // just routes to the client portal first.
  }

  return (
    <AuthPage image="update">
      <h1 className="sr-only">Set a new password</h1>
      <UpdatePasswordForm nextPath={nextPath} backHref={backHref} />
    </AuthPage>
  )
}
