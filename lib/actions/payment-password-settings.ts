'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Self-service management of the caller's OWN payment password.
 *
 * The payment password authorises recording direct invoice payments
 * (cash/card/transfer, mark-as-paid). It is stored as a bcrypt hash in
 * `public.user_security` and is only reachable through SECURITY DEFINER RPCs
 * (migration 153). Separate from login, client-account, and deletion passwords.
 */
export async function changePaymentPassword(currentPassword: string, newPassword: string) {
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

  const { data: result, error } = await supabase.rpc('change_payment_password', {
    p_current_password: currentPassword,
    p_new_password: newPassword,
  })

  if (error) {
    console.error('changePaymentPassword RPC error:', error)
    return { error: 'Could not change the password. Please try again.' }
  }

  if (!result?.success) {
    return { error: result?.message || 'Could not update the payment password.' }
  }

  return { success: true, message: result.message }
}

export async function getPaymentPasswordStatus() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { hasPassword: false }
  }

  const { data: hasPassword } = await supabase.rpc('has_payment_password')
  return { hasPassword: hasPassword === true }
}
