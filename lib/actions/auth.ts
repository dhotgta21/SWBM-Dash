'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { createMemoryRateLimiter } from '@/lib/rate-limit/memory'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { getTurnstileToken } from '@/lib/turnstile'
import { getClientIp } from '@/lib/ip'
import { safeActionError } from '@/lib/errors'
import { shouldBypassCaptcha } from '@/lib/demo/mode'
import { Client as PostgresClient } from 'pg'

// Two-tier rate limiting:
//   1. In-memory pre-filter. Cheap, keeps a flood of repeat requests from
//      hammering the DB. Lives in this Node process only — useless on its
//      own in serverless, but a useful first pass on a single warm instance.
//   2. Supabase-backed shared limiter (lib/rate-limit.ts). The source of
//      truth. Survives cold starts, works across instances.
//
// Together they give: cheap hot-path rejection + correct cross-instance
// enforcement. The in-memory layer must NEVER be more permissive than the
// shared one — same max, same window.

const memRateLimiter = createMemoryRateLimiter({ maxBuckets: 1000 })

/**
 * Two-tier check. Both tiers must pass. The shared check always runs
 * after the in-memory one (so we still have a correct cross-instance
 * answer) but the in-memory check can short-circuit on a hot burst.
 */
async function twoTierRateLimit(
  key: string,
  max: number,
  windowMs: number,
  failOpen = false
): Promise<RateLimitResult> {
  const mem = memRateLimiter.check(key, max, windowMs)
  if (!mem.allowed) return mem

  // We need a Supabase client for the shared check. The caller is in a
  // 'use server' action so the cookies are already set. We can use the
  // same client the action will use; the RPC is SECURITY DEFINER and
  // works for anon callers.
  const supabase = await createClient()
  return rateLimit(supabase, key, max, windowMs, { failOpen })
}

function sanitizeAuthError(error: { message?: string; code?: string }) {
  // Don't leak internal Supabase details to users, and don't reveal whether
  // an email address is registered. Return a single generic message for all
  // credential / confirmation / not-found failures.
  const code = error.code
  const raw = (error.message ?? '').trim()
  const msg = raw.toLowerCase()

  if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    return 'Too many attempts. Please try again later.'
  }
  if (code === 'invalid_credentials' || code === 'email_not_confirmed' || code === 'user_not_found') {
    return 'Invalid email or password.'
  }
  // Supabase often returns an empty or literal "{}" message when CAPTCHA /
  // Attack Protection blocks the request (common on demo projects without
  // Turnstile). Never surface "{}" in the UI.
  if (
    !raw ||
    raw === '{}' ||
    raw === '"{}"' ||
    msg.includes('captcha') ||
    msg.includes('captcha_failed') ||
    code === 'captcha_failed'
  ) {
    if (shouldBypassCaptcha()) {
      return 'Sign-in blocked by Supabase CAPTCHA. In Supabase: Authentication → Attack Protection → turn CAPTCHA off for this demo project, then try again.'
    }
    return 'Please complete the security check and try again.'
  }
  return raw
}

// Friendly, non-leaky messages for the password set/change actions. Returning
// Supabase's raw text leaks internals — including the literal "Current password
// required when setting new password." string that strands invited users. Map the
// known cases and collapse everything else to one generic line.
function friendlyPasswordError(error: { message?: string; code?: string }): string {
  const msg = (error.message ?? '').toLowerCase()
  const code = error.code
  if (code === 'same_password' || msg.includes('same password')) {
    return 'New password must be different from your current password.'
  }
  if (code === 'weak_password' || msg.includes('weak password') || msg.includes('password is too weak')) {
    return 'That password is too weak. Use at least 8 characters with a mix of letters, numbers and symbols.'
  }
  // Supabase returns this when the account already has a password and the
  // project requires the current password to change it — i.e. this is NOT a
  // fresh invite: the link was opened while already signed in, or the email
  // was already registered. A brand-new invitee has no password, so this path
  // should never be hit for them.
  if (
    msg.includes('current password required') ||
    msg.includes('reauthentication') ||
    code === 'reauthentication_needed'
  ) {
    return 'This account already has a password. Sign out (or open the invite link in a private/incognito window) and use "Forgot password?" on the sign-in page to reset it.'
  }
  if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a few minutes and try again.'
  }
  return 'Could not set the password. The link may have expired — please request a new invite and try again.'
}

function debugLog(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args)
  }
}

function rateLimitMessage(retryAfter: number): string {
  // Round up so the user sees at least 1 second when applicable.
  const seconds = Math.max(1, Math.ceil(retryAfter))
  return `Too many attempts. Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

// Account lockout settings. After MAX_FAILED_SIGN_IN_ATTEMPTS failures we
// lock the account for LOCKOUT_DURATION_MS. These are intentionally
// conservative: a real user who mistypes a password a few times will wait
// 30 minutes, while an attacker gets at most 5 guesses per half-hour window.
const MAX_FAILED_SIGN_IN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

function isLocked(lockedUntil: string | null | undefined): boolean {
  if (!lockedUntil) return false
  return new Date(lockedUntil).getTime() > Date.now()
}

function lockoutMessage(lockedUntil: string): string {
  const minutes = Math.max(
    1,
    Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60_000)
  )
  return `Account is locked due to too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
}

async function getPostgresClient() {
  const connectionString = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error('Missing POSTGRES_PRISMA_URL or POSTGRES_URL')
  }
  // Strip sslmode from the connection string so we can supply our own SSL
  // config. Supabase pooler uses a self-signed cert.
  const cleanUrl = connectionString
    .replace(/([?&])sslmode=[^&]*&?/g, '$1')
    .replace(/\?&/, '?')
    .replace(/\?$/, '')
  const client = new PostgresClient({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

async function recordFailedSignIn(email: string) {
  let client: PostgresClient | undefined
  try {
    client = await getPostgresClient()
    await client.query("SET session_replication_role = 'replica'")

    const profileRes = await client.query(
      'SELECT id, failed_sign_in_attempts, locked_until FROM public.profiles WHERE email = $1',
      [email]
    )
    const profile = profileRes.rows[0] as
      | { id: string; failed_sign_in_attempts: number | null; locked_until: string | null }
      | undefined
    if (!profile) return

    const attempts = (profile.failed_sign_in_attempts || 0) + 1
    const lockedUntil =
      attempts >= MAX_FAILED_SIGN_IN_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : profile.locked_until

    await client.query(
      'UPDATE public.profiles SET failed_sign_in_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, lockedUntil, profile.id]
    )

    // Re-read the fresh counter and clamp the lock decision on it. The
    // increment above is a read-modify-write, so two concurrent failures could
    // both compute the same `attempts` and miss the threshold; re-checking the
    // stored value makes sure a concurrent request that already pushed the
    // count to the threshold still results in a lock. The residual race is
    // bounded by the sign-in rate limit (5 attempts/email/min), which caps how
    // far the counter can drift inside one window.
    const freshRes = await client.query(
      'SELECT failed_sign_in_attempts, locked_until FROM public.profiles WHERE id = $1',
      [profile.id]
    )
    const fresh = freshRes.rows[0] as
      | { failed_sign_in_attempts: number | null; locked_until: string | null }
      | undefined
    if (fresh && (fresh.failed_sign_in_attempts || 0) >= MAX_FAILED_SIGN_IN_ATTEMPTS && !fresh.locked_until) {
      await client.query('UPDATE public.profiles SET locked_until = $1 WHERE id = $2', [
        new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString(),
        profile.id,
      ])
    }
  } catch (e) {
    console.error('signIn: unexpected error recording failed sign-in attempt:', e)
  } finally {
    if (client) {
      try {
        await client.query("SET session_replication_role = 'origin'")
      } catch {
        // ignore
      }
      await client.end()
    }
  }
}

export async function signIn(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = formData.get('password') as string
  const loginType = (formData.get('login_type') as string)?.trim().toLowerCase()

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  // The client portal login and operator login share the same Supabase
  // credentials, but each portal is only valid for the matching role.
  // Reject cross-portal sign-in attempts before a session is useful.
  if (loginType !== 'client' && loginType !== 'operator') {
    return { error: 'Invalid login request.' }
  }

  // When Supabase Auth Attack Protection is enabled, the Turnstile token must
  // be passed directly to Supabase Auth so it can verify it at the auth API
  // level. Do not verify it ourselves here - that would consume the single-use
  // token and cause Supabase to reject it as a duplicate.
  // Demo mode skips captcha entirely (Turnstile is not configured).
  const captchaToken = getTurnstileToken(formData)
  if (!shouldBypassCaptcha() && !captchaToken) {
    return { error: 'Please complete the security check.' }
  }

  const headersList = await headers()
  const ip = getClientIp(headersList)

  const emailLimit = await twoTierRateLimit(`signin:${email}`, 5, 60_000, false)
  if (!emailLimit.allowed) {
    return { error: rateLimitMessage(emailLimit.retryAfter) }
  }
  const ipLimit = await twoTierRateLimit(`signin-ip:${ip}`, 20, 60_000, false)
  if (!ipLimit.allowed) {
    return { error: rateLimitMessage(ipLimit.retryAfter) }
  }

  const supabase = await createClient()
  // Use the service-role admin client for the pre-authentication profile
  // lookup. Anonymous requests cannot read public.profiles due to RLS, so
  // the regular client would see no row and incorrectly treat the account as
  // deactivated.
  const adminClient = createAdminClient()

  // Look up the profile by email before attempting authentication. This lets
  // us enforce account lockout early and avoids a second profile lookup on
  // success. If no profile exists, treat it as invalid credentials (same as
  // Supabase would) but don't reveal whether the email is registered.
  const { data: profileRow, error: profileError } = await adminClient
    .from('profiles')
    .select('id, is_active, role, locked_until, failed_sign_in_attempts')
    .eq('email', email)
    .maybeSingle()

  let profile = profileRow

  if (profileError) {
    console.error('signIn: profile lookup error', { code: profileError.code, message: profileError.message })
  }

  if (profile && isLocked(profile.locked_until)) {
    // The account is locked — refuse the sign-in, but return the SAME generic
    // message as a wrong password so the lock state can't be used to confirm
    // that an email address belongs to a registered account.
    return { error: 'Invalid email or password.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    ...(captchaToken ? { options: { captchaToken } } : {}),
  })

  if (error) {
    console.error('signIn: Supabase sign-in error', { code: error.code, message: error.message })
    // Record the failed attempt against the profile (if any) so repeated
    // failures eventually lock the account.
    await recordFailedSignIn(email)
    return { error: sanitizeAuthError(error) }
  }

  debugLog('signIn: Supabase sign-in success')

  if (!data.user) {
    // Should not happen after a successful Supabase sign-in, but handle
    // defensively.
    return { error: 'An unexpected error occurred. Please try again.' }
  }

  // The pre-auth lookup keys on profiles.email, which can legitimately
  // diverge from the Auth email while an email-change confirmation is
  // pending (updateUserDetails mirrors the requested address into profiles
  // immediately, but Auth only adopts it once confirmed). In that window the
  // user still signs in with their old Auth email, so fall back to the
  // authenticated user's id — otherwise every sign-in would be refused as
  // "deactivated" until the confirmation link is clicked.
  //
  // profiles.email has no unique constraint, so a by-email hit that belongs
  // to a DIFFERENT user must not drive role/active checks either — resolve
  // by id in that case too.
  if (profile && profile.id !== data.user.id) {
    profile = null
  }
  if (!profile) {
    const { data: profileById, error: profileByIdError } = await adminClient
      .from('profiles')
      .select('id, is_active, role, locked_until, failed_sign_in_attempts')
      .eq('id', data.user.id)
      .maybeSingle()
    if (profileByIdError) {
      console.error('signIn: profile-by-id lookup error', {
        code: profileByIdError.code,
        message: profileByIdError.message,
      })
    }
    profile = profileById
    if (profile && isLocked(profile.locked_until)) {
      await supabase.auth.signOut()
      return { error: 'Invalid email or password.' }
    }
  }

  // Verify the user account is active. Client portal users go to
  // /portal (their own dashboard) instead of the operator dashboard.
  if (!profile || profile.is_active === false) {
    console.error('signIn: account inactive or missing profile', { profile })
    await supabase.auth.signOut()
    return { error: 'Your account has been deactivated. Contact an administrator.' }
  }

  // Portal/role enforcement. The client portal login only accepts
  // client accounts; the operator login accepts admins and staff.
  // Sign the user out so the invalid session can't be reused.
  if (loginType === 'client' && profile.role !== 'client') {
    await supabase.auth.signOut()
    return { error: 'This account cannot sign in to the client portal.' }
  }
  if (loginType === 'operator' && profile.role === 'client') {
    await supabase.auth.signOut()
    return { error: 'Client accounts must use the client portal to sign in.' }
  }
  if (loginType === 'client' && profile.role === 'picker') {
    await supabase.auth.signOut()
    return { error: 'This account cannot sign in to the client portal.' }
  }
  if (loginType === 'client' && profile.role === 'driver') {
    await supabase.auth.signOut()
    return { error: 'This account cannot sign in to the client portal.' }
  }

  // Clear any prior failed attempts now that the user has authenticated.
  // Update last_sign_in_at in the same write.
  ;(async () => {
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          failed_sign_in_attempts: 0,
          locked_until: null,
          last_sign_in_at: new Date().toISOString(),
        })
        .eq('id', data.user.id)
      if (updateError) console.error('signIn: failed to update profile after sign-in:', updateError)
    } catch (e) {
      console.error('signIn: unexpected error updating profile after sign-in:', e)
    }
  })()

  // Two-factor authentication for admin and staff (main dashboard operators).
  // Clients, pickers and drivers skip this step.
  if (profile.role === 'admin' || profile.role === 'staff') {
    // Password auth only elevates to AAL1. Hand control back to the staff
    // login form so they can enter their TOTP code before redirect.
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError) {
      console.error('signIn: MFA assurance level check failed', aalError)
    } else if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2') {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()
      if (factorsError) {
        console.error('signIn: listFactors failed', factorsError)
        await supabase.auth.signOut()
        return { error: 'Could not start two-factor authentication. Please try again.' }
      }
      const verified = factors?.totp?.find((f) => f.status === 'verified')
      if (!verified) {
        // AAL says MFA is next but no verified factor — do not leave a half
        // session hanging around.
        await supabase.auth.signOut()
        return {
          error:
            'Two-factor authentication is misconfigured on this account. Contact an administrator.',
        }
      }
      return {
        mfaRequired: true as const,
        factorId: verified.id,
        factorName: verified.friendly_name ?? 'Authenticator app',
      }
    }
  }

  revalidatePath('/', 'layout')
  if (profile.role === 'client') {
    redirect('/portal')
  }
  if (profile.role === 'picker') {
    redirect('/picker')
  }
  if (profile.role === 'driver') {
    redirect('/driver')
  }
  // Land on Analytics after sign-in — money-collection KPIs,
  // overdue queue and top-debtors are the highest-leverage things
  // an operator should see first thing every morning.
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()

  // Figure out where to send the user after sign-out. Clients go to the
  // public client login; staff/admins go to the hidden operator URL.
  let isClient = false
  try {
    const { data: userData } = await supabase.auth.getUser()
    if (userData.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle()
      isClient = profile?.role === 'client'
    }
  } catch {
    // If session lookup fails, fall back to the operator login.
  }

  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect(isClient ? '/login' : ADMIN_LOGIN_PATH)
}

export async function resetPassword(formData: FormData) {
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  if (!email) {
    return { error: 'Email is required.' }
  }

  // Pass the Turnstile token to Supabase Auth so Attack Protection can verify
  // it at the auth API level. Demo mode skips captcha.
  const captchaToken = getTurnstileToken(formData)
  if (!shouldBypassCaptcha() && !captchaToken) {
    return { error: 'Please complete the security check.' }
  }

  const headersList = await headers()
  const ip = getClientIp(headersList)

  const emailLimit = await twoTierRateLimit(`reset:${email}`, 3, 60_000, false)
  if (!emailLimit.allowed) {
    return { error: rateLimitMessage(emailLimit.retryAfter) }
  }
  const ipLimit = await twoTierRateLimit(`reset-ip:${ip}`, 10, 60_000, false)
  if (!ipLimit.allowed) {
    return { error: rateLimitMessage(ipLimit.retryAfter) }
  }

  const supabase = await createClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.error('resetPassword: NEXT_PUBLIC_APP_URL is not set')
    return { error: 'Password reset is unavailable. Please contact support.' }
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/update-password`,
    ...(captchaToken ? { captchaToken } : {}),
  })

  if (error) {
    return { error: sanitizeAuthError(error) }
  }

  return { success: true }
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (!password || password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }
  // Upper bound defends against a DoS attacker sending a 100MB password
  // and forcing the server to hash it. 128 chars is well above the
  // realistic max (NIST 800-63B recommends supporting at least 64).
  if (password.length > 128) {
    return { error: 'Password is too long (max 128 characters).' }
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: friendlyPasswordError(error) }
  }

  // Sign the user out so the next sign-in uses the new password. The recovery
  // session is single-use anyway; clearing it avoids leaving a stale session
  // active after the password has just been rotated.
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')

  return { success: true }
}

export async function changePassword(formData: FormData) {
  const currentPassword = (formData.get('current_password') as string) ?? ''
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (!currentPassword) {
    return { error: 'Current password is required.' }
  }
  if (!password || password.length < 8) {
    return { error: 'New password must be at least 8 characters.' }
  }
  // Upper bound defends against a DoS attacker sending a 100MB password
  // and forcing the server to hash it. 128 chars is well above the
  // realistic max (NIST 800-63B recommends supporting at least 64).
  if (password.length > 128) {
    return { error: 'New password is too long (max 128 characters).' }
  }
  if (password !== confirmPassword) {
    return { error: 'New passwords do not match.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) {
    return { error: 'Not authenticated.' }
  }

  // Supabase does not expose a dedicated "verify current password" API, so we
  // prove ownership of the existing credentials by signing in with them. This
  // refreshes the session in-place; the user stays logged in and the new
  // session is used for the password update that follows.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInError) {
    return { error: 'Current password is incorrect.' }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    return { error: friendlyPasswordError(updateError) }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function isRegistrationOpen(): Promise<{ open: boolean; error?: string }> {
  // Use the service-role client so the count is accurate regardless of
  // whether the caller is signed in. The RLS SELECT policy only exposes
  // self-or-admin rows to authenticated callers, which would let an anon
  // user see count=0 even after setup.
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  if (error) {
    return { open: false, error: safeActionError('isRegistrationOpen', error) }
  }

  // Registration is only open until the first profile exists.
  return { open: (count ?? 0) === 0 }
}
