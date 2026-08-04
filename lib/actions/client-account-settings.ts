'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Self-service management of the caller's OWN client-account password.
 *
 * The client-account password authorises money actions (deposits / applying
 * balance) on a client's account. It is stored as a bcrypt hash in the locked-
 * down `public.user_security` table and is reachable only through the SECURITY
 * DEFINER RPCs (migration 126). Any authenticated user can manage their own;
 * the RPC keys the row off auth.uid().
 */
export async function changeClientAccountPassword(currentPassword: string, newPassword: string) {
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

  // Call via the authenticated user client so the RPC sees auth.uid() and
  // writes the caller's own row. The RPC is SECURITY DEFINER, so it can still
  // read/write the locked-down user_security table.
  const { data: result, error } = await supabase.rpc('change_client_account_password', {
    p_current_password: currentPassword,
    p_new_password: newPassword,
  })

  if (error) {
    console.error('changeClientAccountPassword RPC error:', error)
    const msg = (error as { message?: string }).message || ''
    if (/does not exist|Could not find the function|schema cache/i.test(msg)) {
      return {
        error:
          'Client account password is not available on this database yet (missing user_security RPCs). Ask an operator to run supabase/seed/07_fix_user_security_passwords.sql.',
      }
    }
    return { error: `Could not change the password. ${msg || 'Please try again.'}` }
  }

  if (!result?.success) {
    return { error: result?.message || 'Could not update the client account password.' }
  }

  return { success: true, message: result.message }
}

export async function getClientAccountPasswordStatus() {
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
  const { data: hasPassword } = await supabase.rpc('has_client_account_password')
  return { hasPassword: hasPassword === true }
}
