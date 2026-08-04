'use server'

import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { safeActionError } from '@/lib/errors'

/**
 * Self-service management of the caller's OWN deletion password.
 *
 * The deletion password is per-user (migration 126): each operator sets and
 * uses their own. It is stored as a bcrypt hash in the locked-down
 * `public.user_security` table and is reachable only through the SECURITY
 * DEFINER RPCs. Any authenticated user can manage their own; the RPC keys the
 * row off auth.uid().
 */
export async function changeDeletionPassword(currentPassword: string, newPassword: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  // Rate-limit wrong current-password attempts BEFORE verifying — otherwise
  // the bcrypt check is an unbounded online guessing oracle. Fail closed:
  // if the limiter is unavailable, refuse rather than allow unlimited tries.
  const rl = await rateLimit(
    supabase,
    `deletion-password-change:${user.id}`,
    5,
    15 * 60_000,
    { failOpen: false }
  )
  if (!rl.allowed) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  // Call via the authenticated user client so the RPC sees auth.uid() and
  // writes the caller's own row. The RPC is SECURITY DEFINER, so it can still
  // read/write the locked-down user_security table.
  const { data: result, error } = await supabase.rpc('change_deletion_password', {
    p_current_password: currentPassword,
    p_new_password: newPassword,
  })

  if (error) {
    // Log the raw error so we can diagnose exactly what PostgREST/Postgres
    // returned. This is a privileged action, so exposing the raw code and
    // message to the UI is acceptable for debugging.
    console.error('changeDeletionPassword RPC error:', error)
    const code = (error as { code?: string }).code || 'unknown'
    const message = (error as { message?: string }).message || 'No message'
    return {
      error: `${safeActionError('deletion-settings.changeDeletionPassword', error, 'Could not update the deletion password.')} (code: ${code}, message: ${message})`,
    }
  }

  if (!result?.success) {
    return { error: result?.message || 'Could not update the deletion password.' }
  }

  return { success: true, message: result.message }
}

export async function getDeletionPasswordStatus() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { hasPassword: false }
  }

  // Use the user client (not the admin client): the per-user status keys off
  // auth.uid(), which is NULL under service_role. Returns only a boolean — the
  // bcrypt hash itself is never returned to the browser.
  const { data: hasPassword } = await supabase.rpc('has_deletion_password')
  return { hasPassword: hasPassword === true }
}
