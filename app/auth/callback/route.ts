// app/auth/callback/route.ts
// Exchange a Supabase auth code/token (recovery, signup, magiclink, etc.)
// for a session, then redirect the user to an internal destination.
//
// This MUST be a Route Handler, not a Server Component. In Next.js 16,
// cookies().set() throws during a Server Component render, and
// lib/supabase/server.ts intentionally swallows that throw. When the
// exchange happened in a page.tsx, the session cookie was silently dropped
// from the redirect response, so /update-password saw no session and bounced
// the user straight back to /reset-password (the email-entry form). Route
// Handlers can write cookies onto the response, so the session survives the
// redirect and the set-new-password form can render.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Only allow same-origin internal paths so a crafted link can't bounce the
// freshly-minted session out to an attacker-controlled URL.
function sanitizeNext(value: string | null): string {
  if (!value) return '/update-password'
  if (!value.startsWith('/')) return '/update-password'
  if (value.startsWith('//')) return '/update-password'
  // Backslashes and control characters can trick browsers into treating the
  // path as a scheme-relative/absolute URL (e.g. "/\\evil.com") or smuggle
  // CRLF into the redirect — refuse anything containing them.
  if (value.includes('\\')) return '/update-password'
  if (/[\x00-\x1f\x7f]/.test(value)) return '/update-password'
  return value
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const next = sanitizeNext(url.searchParams.get('next'))

  // Nothing to exchange — not a valid auth callback.
  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', origin))
  }

  // Build the success redirect up-front so the Supabase client can write the
  // freshly-exchanged session cookie straight onto the response we return.
  const response = NextResponse.redirect(new URL(next, origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // PKCE recovery/confirmation links carry `code`; the default Supabase
  // email templates can also carry `token_hash` + `type`. Support both.
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! })

  if (error) {
    // No session was established (link expired or already used). Send them to
    // request a fresh reset link instead of /update-password, which would just
    // bounce them here again.
    return NextResponse.redirect(
      new URL('/reset-password?error=invalid_link', origin)
    )
  }

  return response
}
