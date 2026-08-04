'use server'

// lib/actions/adminPasswordReset.ts
//
// Admin-triggered password reset for EXISTING users (staff / admin / client).
//
// The self-service path lives at app/(auth)/reset-password + lib/actions/auth.ts
// (`resetPassword`) — any user can put their email in there and Supabase
// Auth's own email pipeline will send them a recovery link. That works, but
// the link is built from Supabase's default email template (not branded),
// and the admin has to ask the user to self-serve.
//
// This file closes that gap: an operator can click "Reset password" on the
// client detail page or a row in the team-management table and we'll email
// the user a branded recovery link from our own domain. The recipient
// clicks → Supabase bounces to `/auth/callback?next=/update-password`
// (because we set `redirectTo` on the recovery link) → the callback
// establishes a session cookie → redirects to `/update-password` where
// the user sets a new password and signs back in.
//
// Two surfaces, one flow:
//   - adminSendStaffPasswordReset(userId) — staff / admin user
//   - adminSendClientPasswordReset(clientId) — customer linked to a client row
//
// Both are admin-only. We deliberately keep this gated to admins rather
// than adding a new staff permission flag: forcing a password reset on a
// user is a privileged action (the user can't really refuse), so we want
// it in the fewest possible hands.
//
// SAFETY NOTES:
//   - generateLink({ type: 'recovery' }) creates a one-shot Supabase
//     recovery link. The `action_link` already encodes
//     `redirect_to=${APP_URL}/auth/callback?next=/update-password`, so we
//     just hand it to the user as-is. Supabase Auth handles PKCE exchange
//     on the bounce and /auth/callback writes the session cookie.
//   - We DO NOT issue a reset for the calling admin themselves — locking
//     yourself out from a button that needs your own session is silly and
//     we redirect them to the self-service page instead.
//   - Rate-limit per (caller, target-user): 5/hour. A typo'd button click
//     shouldn't spam a customer with recovery emails.
//   - Sending fails closed: any Supabase / Resend error returns a
//     safeActionError-style message and does NOT mark anything as "sent"
//     in the DB.

import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { rateLimit } from '@/lib/rate-limit'
import { isLikelyValidEmail } from '@/lib/utils'
import { loadCompany } from '@/lib/company'
import {
  renderPasswordResetEmailHtml,
  renderPasswordResetEmailSubject,
  renderPasswordResetEmailText,
} from '@/lib/email/password-reset-template'
import { buildEmailFromHeader } from '@/lib/email/from-header'
import { getResendApiKey, getResendFromAddress } from '@/lib/resend'

interface ActionSuccess<T = undefined> {
  ok: true
  data?: T
}

interface ActionError {
  ok: false
  error: string
}

type ActionResult<T = undefined> = ActionSuccess<T> | ActionError

// 5 resets per (caller, target) per hour. Plenty for an actual retry, not
// enough to mass-spam. The existing `staff-invite` action uses 10/hour;
// we go lower here because forced resets on someone else's account are a
// higher-impact abuse vector than invites.
const MAX_RESETS_PER_HOUR = 5

const uuidSchema = z.string().uuid()

function validateUuid(value: string, label: string): { ok: true } | ActionError {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) {
    return { ok: false, error: `Invalid ${label}.` }
  }
  return { ok: true }
}

async function resolveBaseUrlAsync(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return null
}

interface CompanyBranding {
  companyName: string
  emailFromName: string | null
  logoUrl: string | null
  company: Parameters<typeof renderPasswordResetEmailHtml>[0]['company']
}

async function loadCompanyBranding(baseUrl: string | null): Promise<CompanyBranding> {
  let companyName = 'Star Hawk Builders Merchant'
  let emailFromName: string | null = null
  let logoUrl: string | null = null
  let company: CompanyBranding['company'] = {
    company_name: companyName,
    address_line_1: null,
    address_line_2: null,
    town: null,
    county: null,
    postcode: null,
    phone: null,
    email: null,
    phones: [],
    emails: [],
    vat_number: null,
    company_registration_number: null,
  }

  try {
    const admin = createAdminClient()
    const [{ data }, companyInfo] = await Promise.all([
      admin
        .from('company_settings')
        .select(
          'company_name, email_from_name, address_line_1, address_line_2, town, county, postcode, phone, email, vat_number, company_registration_number'
        )
        .maybeSingle(),
      loadCompany(),
    ])

    if (data?.company_name) companyName = data.company_name
    emailFromName = data?.email_from_name ?? null

    // Brand logo is a static asset in /public — uploads have been removed.
    if (baseUrl) {
      logoUrl = `${baseUrl.replace(/\/$/, '')}/Logo.png`
    }

    company = {
      company_name: data?.company_name ?? companyName,
      address_line_1: data?.address_line_1 ?? null,
      address_line_2: data?.address_line_2 ?? null,
      town: data?.town ?? null,
      county: data?.county ?? null,
      postcode: data?.postcode ?? null,
      phone: companyInfo.phone ?? data?.phone ?? null,
      email: companyInfo.email ?? data?.email ?? null,
      phones: companyInfo.phones,
      emails: companyInfo.emails,
      vat_number: data?.vat_number ?? null,
      company_registration_number: data?.company_registration_number ?? null,
    }
  } catch {
    // Best-effort. A failed lookup never blocks the email from going out.
  }

  return { companyName, emailFromName, logoUrl, company }
}

async function sendResetEmail(opts: {
  to: string
  recipientName: string | null
  portalLabel: 'operator dashboard' | 'client portal' | 'warehouse picking app'
  resetUrl: string
  inviterName: string | null
  baseUrl: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await getResendApiKey()
  const envFrom = await getResendFromAddress()
  if (!apiKey || !envFrom) {
    return {
      ok: false,
      error: 'Email is not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS in .env.local or save them in Settings → Integrations.',
    }
  }

  const { companyName, emailFromName, logoUrl, company } = await loadCompanyBranding(opts.baseUrl)

  const subject = renderPasswordResetEmailSubject({ companyName })
  const html = renderPasswordResetEmailHtml({
    recipientName: opts.recipientName,
    portalLabel: opts.portalLabel,
    resetUrl: opts.resetUrl,
    adminInitiated: true,
    inviterName: opts.inviterName,
    company,
    logoUrl,
  })
  const text = renderPasswordResetEmailText({
    recipientName: opts.recipientName,
    portalLabel: opts.portalLabel,
    resetUrl: opts.resetUrl,
    adminInitiated: true,
    inviterName: opts.inviterName,
    company,
  })

  const resend = new Resend(apiKey)
  const friendlyFromName = emailFromName ?? companyName
  const fromResult = buildEmailFromHeader(envFrom, friendlyFromName)
  if (!fromResult.ok) {
    return { ok: false, error: fromResult.error }
  }
  const fromHeader = fromResult.fromHeader

  try {
    const { error } = await resend.emails.send({
      from: fromHeader,
      to: opts.to,
      subject,
      html,
      text,
    })
    if (error) {
      console.error('adminPasswordReset: email send failed:', error)
      return { ok: false, error: 'Could not send the password reset email. Please try again later.' }
    }
    return { ok: true }
  } catch (err) {
    console.error('adminPasswordReset: unexpected email error:', err)
    return { ok: false, error: 'Could not send the password reset email. Please try again later.' }
  }
}

function rateLimitMessage(retryAfter: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfter))
  return `Too many password resets sent recently. Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`
}

/**
 * Admin-triggered password reset for a single staff / admin user.
 *
 * Returns `{ ok: true }` on success or `{ error }` on any failure. The
 * action does NOT mutate any profile row (Supabase Auth owns passwords);
 * the only side effect is the email. The team-management page should
 * `router.refresh()` after calling this so the success alert disappears
 * if the operator re-clicks the button.
 */
export async function adminSendStaffPasswordReset(
  formData: FormData
): Promise<ActionResult<{ targetEmail: string }>> {
  // Server-side config guard. Fail-fast with the precise missing env so
  // the operator isn't guessing what to set on Vercel.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    return {
      ok: false,
      error:
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local / Vercel env, then retry.',
    }
  }
  const resendApiKey = await getResendApiKey()
  const resendFromAddress = await getResendFromAddress()
  if (!resendApiKey || !resendFromAddress) {
    return {
      ok: false,
      error:
        'Outbound email is not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS in .env.local / Vercel env, or save them in Settings → Integrations.',
    }
  }

  const targetUserId = (formData.get('userId') as string | null)?.trim() ?? ''
  if (!targetUserId) {
    return { ok: false, error: 'Missing the team member id.' }
  }
  const uuidCheck = validateUuid(targetUserId, 'team member id')
  if (!uuidCheck.ok) return uuidCheck

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Admin-only. A forced reset on someone else's account is a privileged
  // action; we want it in the fewest possible hands.
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) {
    return { ok: false, error: 'Not authorised — only administrators can reset a team member\'s password.' }
  }

  // Refuse to reset the calling admin's own password via this path — the
  // self-service `/reset-password` page is the right tool for that.
  if (targetUserId === user.id) {
    return {
      ok: false,
      error:
        'Use the "Forgot password?" link on the sign-in screen to reset your own password.',
    }
  }

  // Per-(caller, target) rate limit. The same operator who keeps clicking
  // the button on a flaky connection shouldn't be able to spam a coworker.
  const rl = await rateLimit(
    supabase,
    `pwreset-staff:${user.id}:${targetUserId}`,
    MAX_RESETS_PER_HOUR,
    60 * 60_000,
    { failOpen: false }
  )
  if (!rl.allowed) {
    return { ok: false, error: rateLimitMessage(rl.retryAfter) }
  }

  // Load the target user's email + role via the service-role client (RLS
  // would let the admin see their own row anyway, but service-role avoids
  // any "maybe they can't see themselves yet" surprise).
  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('adminPasswordReset: could not create admin client:', err)
    return {
      ok: false,
      error: 'Server configuration error. Please contact support.',
    }
  }

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', targetUserId)
    .maybeSingle()

  if (profileErr || !profile) {
    return { ok: false, error: 'Team member not found.' }
  }
  if (profile.role !== 'admin' && profile.role !== 'staff' && profile.role !== 'picker' && profile.role !== 'driver') {
    return {
      ok: false,
      error: 'This action only resets passwords for operator accounts (admin, staff, picker, driver). Use the client reset for client portal users.',
    }
  }
  if (!profile.email || !isLikelyValidEmail(profile.email)) {
    return {
      ok: false,
      error: 'This team member has no email on file; add one first.',
    }
  }

  const baseUrl = await resolveBaseUrlAsync()
  if (!baseUrl) {
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_APP_URL is not set. Set it on Vercel env (e.g. https://starhawkbm.com), then retry.',
    }
  }

  // Capture the inviter's name so the email can sign off personally.
  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  // generateLink({ type: 'recovery' }) returns an action_link that already
  // carries `redirect_to=${baseUrl}/auth/callback?next=/update-password`.
  // We hand it to the user as-is via our branded Resend template; Supabase
  // Auth handles PKCE exchange on the bounce and /auth/callback establishes
  // the session cookie before redirecting to /update-password.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${baseUrl}/auth/callback?next=/update-password` },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return {
      ok: false,
      error:
        linkErr?.message ??
        'Could not generate the recovery link. Make sure Supabase SMTP / auth email is configured.',
    }
  }

  const emailResult = await sendResetEmail({
    to: profile.email,
    recipientName: profile.full_name ?? null,
    portalLabel: profile.role === 'picker' ? 'warehouse picking app' : 'operator dashboard',
    resetUrl: linkData.properties.action_link,
    inviterName: inviterProfile?.full_name ?? null,
    baseUrl,
  })

  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error ?? 'Could not send the reset email.' }
  }

  // If we just reactivated a suspended user's password, leave the
  // is_active row alone — the admin's intent here is "let them back in",
  // and toggling is_active automatically would be scope creep.
  revalidatePath('/settings')
  return { ok: true, data: { targetEmail: profile.email } }
}

/**
 * Admin-triggered password reset for a client portal user. Looks up the
 * email from `clients.email` and falls back to `profiles.email` if a
 * profile row is already linked (so case-folding or whitespace drift
 * between the two doesn't drop the reset).
 */
export async function adminSendClientPasswordReset(
  clientIdInput: string
): Promise<ActionResult<{ targetEmail: string }>> {
  // Server-side config guard.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
    return {
      ok: false,
      error:
        'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local / Vercel env, then retry.',
    }
  }
  const resendApiKey = await getResendApiKey()
  const resendFromAddress = await getResendFromAddress()
  if (!resendApiKey || !resendFromAddress) {
    return {
      ok: false,
      error:
        'Outbound email is not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS in .env.local / Vercel env, or save them in Settings → Integrations.',
    }
  }

  const clientId = (clientIdInput ?? '').trim()
  if (!clientId) {
    return { ok: false, error: 'Missing the client id.' }
  }
  const uuidCheck = validateUuid(clientId, 'client id')
  if (!uuidCheck.ok) return uuidCheck

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) {
    return { ok: false, error: 'Not authorised — only administrators can reset a client\'s password.' }
  }

  const rl = await rateLimit(
    supabase,
    `pwreset-client:${user.id}:${clientId}`,
    MAX_RESETS_PER_HOUR,
    60 * 60_000,
    { failOpen: false }
  )
  if (!rl.allowed) {
    return { ok: false, error: rateLimitMessage(rl.retryAfter) }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('adminPasswordReset: could not create admin client:', err)
    return {
      ok: false,
      error: 'Server configuration error. Please contact support.',
    }
  }

  // Pull the client + check there's already a portal profile linked.
  // Without a profile there is no auth user to email — fall back to the
  // existing "send a portal invite" CTA on the same card.
  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('id, first_name, last_name, email')
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (clientErr || !clientRow) {
    return { ok: false, error: 'Client not found.' }
  }
  if (!clientRow.email || !isLikelyValidEmail(clientRow.email)) {
    return {
      ok: false,
      error: 'This client has no email on file. Add an email address first, or send a portal invite instead.',
    }
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, is_active')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!profile) {
    return {
      ok: false,
      error: 'This client does not have a portal account yet. Use "Send portal invite" instead of "Reset password".',
    }
  }

  const baseUrl = await resolveBaseUrlAsync()
  if (!baseUrl) {
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_APP_URL is not set. Set it on Vercel env (e.g. https://starhawkbm.com), then retry.',
    }
  }

  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email ?? clientRow.email,
    options: { redirectTo: `${baseUrl}/auth/callback?next=/update-password` },
  })

  if (linkErr || !linkData?.properties?.action_link) {
    return {
      ok: false,
      error:
        linkErr?.message ??
        'Could not generate the recovery link. Make sure Supabase SMTP / auth email is configured.',
    }
  }

  const recipientName =
    [clientRow.first_name, clientRow.last_name].filter(Boolean).join(' ').trim() || null

  const emailResult = await sendResetEmail({
    to: profile.email ?? clientRow.email,
    recipientName,
    portalLabel: 'client portal',
    resetUrl: linkData.properties.action_link,
    inviterName: inviterProfile?.full_name ?? null,
    baseUrl,
  })

  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error ?? 'Could not send the reset email.' }
  }

  revalidatePath(`/clients/${clientId}`)
  return {
    ok: true,
    data: { targetEmail: profile.email ?? clientRow.email },
  }
}
