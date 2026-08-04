'use server'

import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * Re-verify the operator by signing in again with their current password.
 * This is the same technique used by changePassword and provides a strong
 * second factor before moving money. The plaintext password is never stored
 * or logged — Supabase Auth compares it against the bcrypt hash.
 *
 * Runs on the server only (`'use server'`); the browser merely collects the
 * password and forwards it over HTTPS. It never decides whether it is correct.
 *
 * The password check is performed against an isolated, session-less anon
 * client (no cookie persistence) so that a successful verification cannot
 * rotate or overwrite the operator's existing auth cookies. The request's
 * own client is only used to read the authenticated user's email from the
 * Auth session (not profiles.email, which can diverge while an email-change
 * confirmation is pending).
 */
export async function verifyOperatorPassword(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!password || password.length === 0) {
    return { ok: false, error: 'Password is required to confirm this action.' }
  }

  // Auth is the source of truth for the login email. profiles.email can lag
  // behind (e.g. after a password or email change) and would cause a false
  // "Incorrect password" even when the operator typed the right password.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email || user.id !== userId) {
    return { ok: false, error: 'Could not verify operator identity.' }
  }

  // Isolated client: persistSession/autoRefresh disabled, so this sign-in
  // never touches the request's cookie store and can't rotate the session.
  const verifier = createPublicClient()
  const { error } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  })

  if (error) {
    return { ok: false, error: 'Incorrect password. The action was not recorded.' }
  }

  // Make sure the throwaway session (if any) is discarded immediately.
  await verifier.auth.signOut().catch(() => {})

  return { ok: true }
}
