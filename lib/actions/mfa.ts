'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, type RateLimitResult } from '@/lib/rate-limit'
import { createMemoryRateLimiter } from '@/lib/rate-limit/memory'
import { getClientIp } from '@/lib/ip'
import { canUseMfa } from '@/lib/auth/roles'
import {
  AUTHENTICATOR_APP_LABELS,
  isAuthenticatorApp,
  type MfaAssuranceLevel,
  type MfaEnrollmentStart,
  type MfaFactorSummary,
  type MfaStatus,
} from '@/lib/mfa/shared'

const TOTP_ISSUER = 'Star Hawk'

const memRateLimiter = createMemoryRateLimiter({ maxBuckets: 1000 })

async function twoTierRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const mem = memRateLimiter.check(key, max, windowMs)
  if (!mem.allowed) return mem
  const supabase = await createClient()
  return rateLimit(supabase, key, max, windowMs, { failOpen: false })
}

function rateLimitMessage(retryAfter: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfter))
  return `Too many attempts. Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

function friendlyMfaError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.'
  const msg = (error.message ?? '').toLowerCase()
  const code = error.code
  if (
    code === 'mfa_verification_failed' ||
    msg.includes('invalid') ||
    msg.includes('wrong') ||
    msg.includes('incorrect')
  ) {
    return 'That code is incorrect or has expired. Try again with a fresh code from your authenticator app.'
  }
  if (code === 'mfa_factor_not_found' || msg.includes('factor not found')) {
    return 'Two-factor authentication is not set up on this account.'
  }
  if (code === 'mfa_factor_name_conflict' || msg.includes('friendly name')) {
    return 'An authenticator with that name already exists. Disable it first, then try again.'
  }
  if (code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (msg.includes('enrolled') || msg.includes('already')) {
    return 'Two-factor authentication is already enabled on this account.'
  }
  return 'Could not complete two-factor authentication. Please try again.'
}

function asAssuranceLevel(value: string | null | undefined): MfaAssuranceLevel | null {
  if (value === 'aal1' || value === 'aal2') return value
  return null
}

type MfaEligibleContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
}

/**
 * Two-factor authentication is for dashboard operators (admin + staff).
 * Clients, pickers and drivers cannot enroll or manage TOTP factors.
 */
async function requireMfaEligibleUser(): Promise<
  { ok: true; ctx: MfaEligibleContext } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('requireMfaEligibleUser: profile lookup', profileError)
    return { ok: false, error: 'Could not verify permissions.' }
  }
  if (!canUseMfa(profile?.role)) {
    return {
      ok: false,
      error: 'Two-factor authentication is only available for admin and staff accounts.',
    }
  }

  return { ok: true, ctx: { supabase, userId: user.id } }
}

/**
 * Current MFA status for the signed-in admin or staff user. Account settings.
 */
export async function getMfaStatus(): Promise<{ status?: MfaStatus; error?: string }> {
  const gate = await requireMfaEligibleUser()
  if (!gate.ok) return { error: gate.error }
  const { supabase } = gate.ctx

  const [{ data: factorsData, error: factorsError }, { data: aalData, error: aalError }] =
    await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])

  if (factorsError) {
    console.error('getMfaStatus: listFactors', factorsError)
    return { error: friendlyMfaError(factorsError) }
  }
  if (aalError) {
    console.error('getMfaStatus: getAAL', aalError)
    return { error: friendlyMfaError(aalError) }
  }

  // Include both verified and unverified TOTP factors so the UI can clean up
  // abandoned enrollments.
  const allTotp = [
    ...(factorsData?.totp ?? []),
    ...(factorsData?.all?.filter((f) => f.factor_type === 'totp' && f.status === 'unverified') ??
      []),
  ]
  // De-dupe by id (verified factors often appear in both totp and all).
  const byId = new Map<string, MfaFactorSummary>()
  for (const f of allTotp) {
    byId.set(f.id, {
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status,
      createdAt: f.created_at,
    })
  }

  const factors = Array.from(byId.values())
  const enabled = factors.some((f) => f.status === 'verified')

  return {
    status: {
      enabled,
      factors,
      currentLevel: asAssuranceLevel(aalData?.currentLevel),
      nextLevel: asAssuranceLevel(aalData?.nextLevel),
    },
  }
}

/**
 * Begin TOTP enrollment. Returns a QR code + secret for Google Authenticator
 * or Microsoft Authenticator (both use the same TOTP standard).
 */
export async function startMfaEnrollment(
  app: string
): Promise<{ enrollment?: MfaEnrollmentStart; error?: string }> {
  if (!isAuthenticatorApp(app)) {
    return { error: 'Choose Google Authenticator or Microsoft Authenticator.' }
  }

  const gate = await requireMfaEligibleUser()
  if (!gate.ok) return { error: gate.error }
  const { supabase, userId } = gate.ctx

  const headersList = await headers()
  const ip = getClientIp(headersList)
  const limit = await twoTierRateLimit(`mfa-enroll:${userId}:${ip}`, 10, 60 * 60_000)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) }

  // One verified TOTP factor is enough. Clean up any stale unverified enrollments
  // so the user can re-start cleanly.
  const { data: existing, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) {
    console.error('startMfaEnrollment: listFactors', listError)
    return { error: friendlyMfaError(listError) }
  }

  if ((existing?.totp ?? []).some((f) => f.status === 'verified')) {
    return { error: 'Two-factor authentication is already enabled. Disable it before setting up a new authenticator.' }
  }

  const unverified =
    existing?.all?.filter((f) => f.factor_type === 'totp' && f.status === 'unverified') ?? []
  for (const factor of unverified) {
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
    if (unenrollError) {
      console.error('startMfaEnrollment: cleanup unverified', unenrollError)
    }
  }

  const friendlyName = AUTHENTICATOR_APP_LABELS[app]
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
    issuer: TOTP_ISSUER,
  })

  if (error || !data) {
    console.error('startMfaEnrollment: enroll', error)
    return { error: friendlyMfaError(error) }
  }

  const totp = data.totp
  if (!totp?.qr_code || !totp.secret) {
    // Roll back the half-created factor so the user can retry.
    await supabase.auth.mfa.unenroll({ factorId: data.id })
    return { error: 'Could not generate authenticator setup details. Please try again.' }
  }

  // Supabase may return a raw SVG payload; browsers need a data URI for <img>.
  const qrCode = totp.qr_code.startsWith('data:')
    ? totp.qr_code
    : `data:image/svg+xml;utf-8,${totp.qr_code}`

  return {
    enrollment: {
      factorId: data.id,
      qrCode,
      secret: totp.secret,
      uri: totp.uri ?? '',
      app,
      appLabel: friendlyName,
    },
  }
}

/**
 * Confirm enrollment by verifying a 6-digit code from the authenticator app.
 */
export async function confirmMfaEnrollment(
  factorId: string,
  code: string
): Promise<{ success?: boolean; error?: string }> {
  const cleanedCode = (code ?? '').replace(/\s/g, '')
  if (!factorId) return { error: 'Missing authenticator setup. Please start again.' }
  if (!/^\d{6}$/.test(cleanedCode)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' }
  }

  const gate = await requireMfaEligibleUser()
  if (!gate.ok) return { error: gate.error }
  const { supabase, userId } = gate.ctx

  const headersList = await headers()
  const ip = getClientIp(headersList)
  const limit = await twoTierRateLimit(`mfa-confirm:${userId}:${ip}`, 10, 15 * 60_000)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanedCode,
  })

  if (error) {
    console.error('confirmMfaEnrollment: challengeAndVerify', error)
    return { error: friendlyMfaError(error) }
  }

  revalidatePath('/settings/account')
  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * Cancel an in-progress (unverified) enrollment.
 */
export async function cancelMfaEnrollment(
  factorId: string
): Promise<{ success?: boolean; error?: string }> {
  if (!factorId) return { error: 'Missing authenticator setup.' }

  const gate = await requireMfaEligibleUser()
  if (!gate.ok) return { error: gate.error }
  const { supabase } = gate.ctx

  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    console.error('cancelMfaEnrollment: unenroll', error)
    return { error: friendlyMfaError(error) }
  }

  revalidatePath('/settings/account')
  return { success: true }
}

/**
 * Disable 2FA after verifying a current TOTP code.
 */
export async function disableMfa(
  factorId: string,
  code: string
): Promise<{ success?: boolean; error?: string }> {
  const cleanedCode = (code ?? '').replace(/\s/g, '')
  if (!factorId) return { error: 'Missing authenticator.' }
  if (!/^\d{6}$/.test(cleanedCode)) {
    return { error: 'Enter the 6-digit code from your authenticator app to turn off 2FA.' }
  }

  const gate = await requireMfaEligibleUser()
  if (!gate.ok) return { error: gate.error }
  const { supabase, userId } = gate.ctx

  const headersList = await headers()
  const ip = getClientIp(headersList)
  const limit = await twoTierRateLimit(`mfa-disable:${userId}:${ip}`, 10, 15 * 60_000)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) }

  // Prove possession of the authenticator before removing it.
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanedCode,
  })
  if (verifyError) {
    console.error('disableMfa: challengeAndVerify', verifyError)
    return { error: friendlyMfaError(verifyError) }
  }

  const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId })
  if (unenrollError) {
    console.error('disableMfa: unenroll', unenrollError)
    return { error: friendlyMfaError(unenrollError) }
  }

  revalidatePath('/settings/account')
  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * If the current session is an admin/staff user at password-only AAL1 with a
 * verified TOTP factor, return the factor so the staff login UI can show the
 * code step after a refresh or middleware bounce.
 */
export async function getPendingMfaChallenge(): Promise<{
  factorId: string
  factorName: string
} | null> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (!canUseMfa(profile?.role)) return null

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal1' || aal?.nextLevel !== 'aal2') return null

    const { data: factors } = await supabase.auth.mfa.listFactors()
    const verified = factors?.totp?.find((f) => f.status === 'verified')
    if (!verified) return null

    return {
      factorId: verified.id,
      factorName: verified.friendly_name ?? 'Authenticator app',
    }
  } catch (err) {
    console.error('getPendingMfaChallenge', err)
    return null
  }
}

/**
 * Complete the second step of sign-in when MFA is required (AAL1 → AAL2).
 * On success redirects to the role-appropriate home.
 */
export async function verifyMfaLogin(
  formData: FormData
): Promise<{ error?: string }> {
  const factorId = (formData.get('factor_id') as string)?.trim()
  const code = ((formData.get('code') as string) ?? '').replace(/\s/g, '')
  const loginType = (formData.get('login_type') as string)?.trim().toLowerCase()

  if (!factorId) return { error: 'Missing authenticator. Please sign in again.' }
  if (!/^\d{6}$/.test(code)) {
    return { error: 'Enter the 6-digit code from your authenticator app.' }
  }
  if (loginType !== 'client' && loginType !== 'operator') {
    return { error: 'Invalid login request.' }
  }

  // Login MFA is for staff-portal operators (admin + staff). Client portal never uses 2FA.
  if (loginType !== 'operator') {
    return { error: 'Two-factor authentication is only used for staff sign-in.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expired. Please sign in again.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!canUseMfa(profile?.role)) {
    return { error: 'Two-factor authentication is only available for admin and staff accounts.' }
  }

  const headersList = await headers()
  const ip = getClientIp(headersList)
  const limit = await twoTierRateLimit(`mfa-login:${user.id}:${ip}`, 10, 15 * 60_000)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfter) }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code,
  })

  if (error) {
    console.error('verifyMfaLogin: challengeAndVerify', error)
    return { error: friendlyMfaError(error) }
  }

  revalidatePath('/', 'layout')
  // Staff land on invoices (their day-to-day); admins on analytics dashboard.
  if (profile?.role === 'staff') {
    redirect('/invoices?view=due')
  }
  redirect('/dashboard')
}
