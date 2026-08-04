// app/invite/set-password/page.tsx
// Renders the password form for a freshly-invited user (client portal
// OR staff / admin) after they've clicked the link in the invite email
// and the /invite/verify step has established a session.
//
// The wrapper here intentionally mirrors app/(auth)/layout.tsx
// (soft `#fbfbfb` background + centered card) so the visual language
// is identical to /login, /admin-login and /reset-password even though
// this route can't share the (auth) group without colliding with the
// sibling /invite/[token] and /invite/verify pages.
//
// On submit, the form calls updateUser({ password }) which lets Supabase
// enforce minimum length, complexity rules and rate limits server-side.
// We then sign the recovery/invite session out and redirect to the
// sign-in screen that matches the user's role.

import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { InviteSetPasswordForm } from '@/components/auth/InviteSetPasswordForm'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'

export const dynamic = 'force-dynamic'

// Belt-and-braces: the OTP URL is no longer in our referrer chain by the
// time this page renders, but setting referrer=no-referrer keeps any
// future query-param additions from leaking via Referer.
export const metadata: Metadata = {
  title: 'Set your password',
  other: {
    referrer: 'no-referrer',
  },
}

type Role = 'staff' | 'admin' | 'client' | 'picker' | 'driver'

function routeForRole(role: Role | null): { nextPath: string; backHref: string } {
  // Operators (admin / staff / picker / driver) sign in on the hidden operator URL.
  // Clients sign in on the public /login. Unknown roles default to the
  // client login so a future role addition can't strand someone.
  if (role === 'staff' || role === 'admin' || role === 'picker' || role === 'driver') {
    return {
      nextPath: `${ADMIN_LOGIN_PATH}?welcome=1`,
      backHref: ADMIN_LOGIN_PATH,
    }
  }
  return {
    nextPath: '/login?welcome=1',
    backHref: '/login',
  }
}

export default async function InviteSetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const { expired } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // /invite/verify must have established a session before this page is
  // reachable. If not, bounce to login — the invitee probably hit a
  // stale link or opened the URL directly.
  if (!user) {
    redirect('/login?error=session_expired')
  }

  // Look up the role so we know where to send the user post-save.
  // ANY signed-in role can land here — clients, staff and admins all
  // arrive via their respective invite flows. The previous
  // `role === 'client'` gate was bouncing staff invites before they
  // could set a password.
  let role: Role | null = null
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role === 'staff' || profile?.role === 'admin' || profile?.role === 'client' || profile?.role === 'picker' || profile?.role === 'driver') {
      role = profile.role
    }
  } catch {
    // best-effort — fall through with role=null and the default route
  }

  const { nextPath, backHref } = routeForRole(role)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbfbfb] p-4">
      <div className="w-full max-w-md">
        <InviteSetPasswordForm
          sessionExpired={expired === '1'}
          email={user.email ?? ''}
          nextPath={nextPath}
          backHref={backHref}
          role={role}
        />
      </div>
    </div>
  )
}