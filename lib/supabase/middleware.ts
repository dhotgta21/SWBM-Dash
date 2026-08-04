import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { PROTECTED_ROUTE_PREFIXES, PROTECTED_PRODUCT_ROUTES } from '@/lib/auth/protected-routes'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  let user = null
  let isActive = true
  let role: string | null = null
  // True when password auth succeeded but TOTP 2FA has not been completed yet
  // (AAL1 session while a verified MFA factor exists).
  let mfaPending = false

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_active, last_active_at')
        .eq('id', user.id)
        .maybeSingle()
      // A missing profile means the auth trigger failed or was bypassed.
      // Treat it as inactive to prevent un-authorised dashboard access.
      if (!profile || profile.is_active === false) {
        isActive = false
        await supabase.auth.signOut()
      } else {
        role = profile.role

        // Throttle last-active writes to once per 5 minutes so every request
        // doesn't hit the database.
        const lastActive = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        if (lastActive < fiveMinutesAgo) {
          // Fire-and-forget: middleware correctness does not depend on this.
          supabase
            .from('profiles')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', user.id)
            .then(({ error }) => {
              if (error) console.error('Middleware: failed to stamp last_active_at:', error)
            })
        }

        // MFA is for admin + staff (main dashboard). Enforce AAL2 when they
        // have enrolled a verified factor but this session is still password-only.
        if (role === 'admin' || role === 'staff') {
          try {
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
            if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
              mfaPending = true
            }
          } catch (aalErr) {
            console.error('Middleware: MFA assurance check failed:', aalErr)
          }
        }
      }
    }
  } catch (error) {
    // If session validation fails (e.g. invalid env vars), treat as logged out
    // and let the route decide how to handle it.
    console.error('Proxy session check failed:', error)
    user = null
    isActive = true
  }

  const pathname = request.nextUrl.pathname
  // Match a prefix only on a path-segment boundary. A raw startsWith()
  // would make the `/admin` prefix also match `/admin-login` (the public
  // operator sign-in page), which then redirects unauthenticated users to
  // itself forever (ERR_TOO_MANY_REDIRECTS). Requiring the prefix to be
  // followed by end-of-path or `/` keeps `/admin`, `/admin/products`, etc.
  // protected while leaving `/admin-login` public.
  const matchesPrefix = (prefix: string) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  const isProtectedRoute =
    PROTECTED_ROUTE_PREFIXES.some(matchesPrefix) ||
    PROTECTED_PRODUCT_ROUTES.some((pattern) => pattern.test(pathname))

  if (isProtectedRoute && (!user || !isActive)) {
    // Portal routes should redirect to the public client login, not the hidden
    // operator login path, to avoid leaking ADMIN_LOGIN_PATH to scanners.
    const redirectPath = pathname.startsWith('/portal') ? '/login' : ADMIN_LOGIN_PATH
    const redirectUrl = new URL(redirectPath, request.url)
    if (!isActive) {
      redirectUrl.searchParams.set('error', 'inactive')
    }

    // Preserve any cookie changes (e.g. from signOut() clearing the session)
    // by copying them onto the redirect response. Without this, stale auth
    // cookies stay in the browser and the user keeps being redirected.
    const redirectResponse = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // Password-only session while MFA is enrolled: keep the user on the login
  // page for the authenticator step; block all protected destinations.
  if (user && isActive && mfaPending && isProtectedRoute) {
    const redirectPath =
      role === 'client' || pathname.startsWith('/portal') ? '/login' : ADMIN_LOGIN_PATH
    const redirectUrl = new URL(redirectPath, request.url)
    redirectUrl.searchParams.set('error', 'mfa_required')
    const redirectResponse = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // Redirect authenticated users away from auth pages.
  // Note: /update-password is intentionally excluded so the recovery flow
  // (which establishes a session via code exchange) can complete. The page
  // itself signs the user out after the password is changed.
  // Also skip when MFA is still pending so the login form can collect the
  // TOTP code without being bounced into the dashboard.
  if (
    user &&
    isActive &&
    !mfaPending &&
    (request.nextUrl.pathname.startsWith('/login') ||
      request.nextUrl.pathname.startsWith('/register') ||
      request.nextUrl.pathname.startsWith('/reset-password') ||
      request.nextUrl.pathname === ADMIN_LOGIN_PATH)
  ) {
    let destination: string
    if (role === 'client') {
      destination = '/portal'
    } else if (role === 'picker') {
      destination = '/picker'
    } else if (role === 'driver') {
      destination = '/driver'
    } else {
      destination = '/invoices?view=due'
    }
    return NextResponse.redirect(new URL(destination, request.url))
  }

  return response
}
