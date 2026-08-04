'use server'

// Consumes a staff/client invite OTP and establishes a session.
//
// This deliberately runs as a SERVER ACTION (form POST), never on a bare GET.
// Email providers (Outlook Safe Links, Gmail, corporate security scanners)
// pre-fetch links inside emails with a GET. If the OTP were consumed on GET,
// that pre-fetch would burn the single-use token and the real person would
// later see "link expired" on their very first click. A POST only ever comes
// from a real browser (the auto-submit or the Continue button), so the token
// survives until a human actually accepts.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_OTP_TYPES = new Set(['magiclink', 'invite'])

function sanitizeNext(value: string): string {
  if (!value) return '/invite/set-password'
  if (!value.startsWith('/')) return '/invite/set-password'
  if (value.startsWith('//')) return '/invite/set-password'
  // Backslashes and control characters can trick browsers into treating the
  // path as a scheme-relative/absolute URL (e.g. "/\\evil.com") — refuse them.
  if (value.includes('\\')) return '/invite/set-password'
  if (/[\x00-\x1f\x7f]/.test(value)) return '/invite/set-password'
  return value
}

export async function consumeInvite(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const type = String(formData.get('type') ?? '')
  const next = String(formData.get('next') ?? '/invite/set-password')

  if (!token || !ALLOWED_OTP_TYPES.has(type)) {
    redirect('/login?error=invalid_invite')
  }

  const supabase = await createClient()

  // Drop any pre-existing session (e.g. an admin testing in the same browser)
  // so verifyOtp establishes the INVITEE's session cleanly rather than leaving
  // the admin's passworded session in place. token_hash verification does not
  // depend on a PKCE cookie, so clearing here is safe.
  await supabase.auth.signOut()

  const { error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: type as 'magiclink' | 'invite',
  })

  if (error) {
    redirect('/invite/verify?error=expired')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?error=session_lost')
  }

  redirect(sanitizeNext(next))
}
