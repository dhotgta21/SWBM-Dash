'use server'

// Admin-only server action to invite a new staff or admin user.
// Generates a Supabase Auth invite link and sends a branded invitation email
// via Resend. The invited role is stashed in the user's metadata so the
// handle_new_user() trigger can assign the correct role when the invitee
// accepts.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { rateLimit } from '@/lib/rate-limit'
import { loadCompany } from '@/lib/company'
import {
  renderStaffInviteEmailHtml,
  renderStaffInviteEmailSubject,
  renderStaffInviteEmailText,
} from '@/lib/email/staff-invite-template'
import { buildEmailFromHeader } from '@/lib/email/from-header'
import { getResendApiKey, getResendFromAddress } from '@/lib/resend'
import { shouldBypassOutboundEmail } from '@/lib/demo/mode'

const InviteSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter the team member\'s name (at least 2 characters).')
    .max(120, 'Name is too long (max 120 characters).'),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['staff', 'admin', 'picker', 'driver']),
})

async function resolveBaseUrlAsync(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return null
}

/**
 * Invite a new staff or admin user by email. Generates a Supabase Auth invite
 * link and sends a branded email via Resend. Upon accepting, the requested
 * role is assigned by the handle_new_user() trigger.
 *
 * Returns `{ ok: true, demoInviteUrl? }` on success, or `{ error: string }` on failure.
 * In demo mode email is skipped and `demoInviteUrl` is returned for the operator to copy.
 */
export async function inviteStaffUser(formData: FormData) {
  try {
    // Fail-fast on missing server config — "Something went wrong" tells
    // the operator nothing; explicit messages tell them exactly which
    // Vercel env var to check.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY) {
      return {
        error:
          'Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local / Vercel env, then retry.',
      }
    }
    const demoNoEmail = shouldBypassOutboundEmail()
    let resendApiKey: string | null = null
    let resendFromAddress: string | null = null
    if (!demoNoEmail) {
      resendApiKey = await getResendApiKey()
      resendFromAddress = await getResendFromAddress()
      if (!resendApiKey || !resendFromAddress) {
        return {
          error:
            'Outbound email is not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS in .env.local / Vercel env, or save them in Settings → Integrations, then retry.',
        }
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: 'Not authenticated' }
    }

    // Per-user rate limit: 10 invites per hour per caller.
    const rl = await rateLimit(supabase, `staff-invite:${user.id}`, 10, 60 * 60_000, { failOpen: false })
    if (!rl.allowed) {
      return { error: `Too many invites. Please try again in ${Math.ceil(rl.retryAfter)}s.` }
    }

    const isAdminUserRow = await isAdminUser(supabase, user.id)
    if (!isAdminUserRow) {
      return { error: 'Not authorised' }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const parsed = InviteSchema.safeParse({
      fullName: formData.get('fullName'),
      email: formData.get('email'),
      role: formData.get('role'),
    })
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      return {
        error:
          firstIssue?.message ??
          'Please enter the team member\'s name, a valid email and a role.',
      }
    }

    const { fullName, email, role } = parsed.data

    // Resolve the canonical base URL so the invite link points back to the
    // operator login page.
    const baseUrl = await resolveBaseUrlAsync()
    if (!baseUrl) {
      return {
        error:
          'NEXT_PUBLIC_APP_URL is not set. Set it on Vercel env (e.g. https://starhawkbm.com), then retry.',
      }
    }

    let admin
    try {
      admin = createAdminClient()
    } catch (err) {
      // createAdminClient() throws when SUPABASE_SERVICE_ROLE_KEY is
      // missing or malformed. The early check above catches the most
      // common case; this surfaces the actual error for anything else
      // (e.g. a typo in the URL env) so the operator isn't left
      // guessing.
      console.error('sendStaffInvite: could not create admin client:', err)
      return {
        error: 'Server configuration error. Please contact support.',
      }
    }

    // Refuse to invite an email that already has an account. Without this,
    // generateLink either 422s or — when the project is hitting Supabase's
    // built-in email rate limit — fails with an opaque `{}`. Either way the
    // operator gets stuck; point them at the Reset password action instead.
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle()
    if (existingProfile) {
      if (existingProfile.role === 'client') {
        return {
          error:
            'That email is already used by a client portal account. Use a different work email for team access.',
        }
      }
      return {
        error:
          'That email is already registered. Use "Reset password" from the team table if they need a new password.',
      }
    }

    // Load branding + inviter details for the email body. We pull the full
    // company record so the footer has a real address / phone / email /
    // reg numbers — operators notice when an email says "you can call us"
    // but the number is missing.
    let companyName = 'Demo Builder Merchant'
    let emailFromName: string | null = null
    let logoUrl: string | null = null
    let company: Parameters<typeof renderStaffInviteEmailHtml>[0]['company'] = {
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
      // company_settings lookup is best-effort — never block on it
    }

    const inviterName = profile?.full_name?.trim() || user.email || null

    // Generate the Supabase invite token. We pass `redirectTo` only as a
    // hint — we'll actually redirect through our own /invite/verify flow
    // so the user lands on /invite/set-password (with the password +
    // confirm form) before they ever see the admin login screen.
    //
    // `full_name` in `data` is picked up by the handle_new_user() trigger
    // and used to pre-fill profiles.full_name, so the operator table
    // shows the right name from the moment the invitee signs in (no
    // "no name set yet" gap).
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${baseUrl}/invite/set-password`,
        data: { invited_role: role, full_name: fullName },
      },
    })

    if (linkError) {
      const message = linkError.message ?? ''
      const status = (linkError as { status?: number }).status
      const lower = message.toLowerCase()
      // 422 from Supabase usually means the user already exists. (We also
      // pre-check above; this is a safety net.)
      if (status === 422 || /already|exists|registered/.test(lower)) {
        return {
          error:
            'That email is already registered. Use "Reset password" from the team table if they need a new password.',
        }
      }
      // Database CHECK / trigger failures when inviting pickers before
      // migration 109/124 (role constraint missing 'picker').
      if (
        /23514|check constraint|profiles_role|role.*picker|violates check/i.test(lower) ||
        (role === 'picker' && /database error|unexpected|failed/i.test(lower))
      ) {
        console.error('staff-invite.generateLink role constraint failure:', linkError)
        return {
          error:
            'Could not create a picker account because the database role constraint is out of date. Apply migration 124_invite_hardening.sql (or 109_fix_picker_role_constraint.sql) on Supabase, then retry.',
        }
      }
      // Supabase's built-in email rate limit gates invite/magiclink/recovery
      // link generation. When exhausted it comes back as 429, a rate-limit
      // message, or an opaque `{}`. Give the operator the real reason — and
      // the fix — instead of "{}".
      if (
        status === 429 ||
        /rate limit|rate_limit|too many/.test(lower) ||
        message === '{}' ||
        !message
      ) {
        // Empty / opaque errors on picker invites are often the role CHECK.
        if (role === 'picker') {
          console.error('staff-invite.generateLink opaque failure for picker:', linkError)
          return {
            error:
              'Could not create the picker invite. If this keeps happening, apply migration 124_invite_hardening.sql on Supabase (picker role constraint), wait a few minutes if you sent many invites, then retry.',
          }
        }
        return {
          error:
            'Too many invites have been sent in a short time, so the email service is temporarily blocking new invites. Wait about an hour and try again. To remove this limit for good, configure a custom SMTP server in Supabase → Authentication → Settings → SMTP (you can point it at your Resend account).',
        }
      }
      console.error('staff-invite.generateLink failed:', linkError)
      return { error: `Could not send the invite: ${message}` }
    }

    // Supabase returns an action_link like
    //   https://<project>.supabase.co/auth/v1/verify?token=<otp>&type=invite&redirect_to=...
    // We don't want to send the invitee to Supabase's hosted auth page —
    // we want them to land on our own set-password form. Extract the OTP
    // and build a verify URL that points at /invite/verify. The verify
    // page then exchanges the token for a session cookie and bounces to
    // /invite/set-password.
    const actionLink = linkData.properties.action_link
    if (!actionLink) {
      console.error('staff-invite.generateLink returned no action_link:', linkData)
      return { error: 'Could not create the invite link. Please try again.' }
    }

    let otpToken: string | null = null
    try {
      const u = new URL(actionLink)
      otpToken = u.searchParams.get('token')
    } catch {
      otpToken = null
    }
    if (!otpToken) {
      console.error('staff-invite could not extract OTP token from action_link:', actionLink)
      return { error: 'Could not create the invite link. Please try again.' }
    }

    const inviteUrl = `${baseUrl}/invite/verify?token=${encodeURIComponent(
      otpToken
    )}&type=invite&next=${encodeURIComponent('/invite/set-password')}`

    // Demo mode: account + invite link exist; operator copies the link
    // instead of sending email through Resend.
    if (demoNoEmail) {
      revalidatePath('/settings')
      revalidatePath('/settings/team')
      return { ok: true, demoInviteUrl: inviteUrl }
    }

    // Send the branded invitation email via Resend.
    const resend = new Resend(resendApiKey!)
    const friendlyFromName = emailFromName ?? companyName
    const fromResult = buildEmailFromHeader(resendFromAddress!, friendlyFromName)
    if (!fromResult.ok) {
      return { error: fromResult.error }
    }
    const fromHeader = fromResult.fromHeader

    const { error: sendError } = await resend.emails.send({
      from: fromHeader,
      to: email,
      subject: renderStaffInviteEmailSubject({ companyName, inviteeName: fullName }),
      html: renderStaffInviteEmailHtml({
        inviteeName: fullName,
        inviteeEmail: email,
        inviterName,
        role,
        inviteUrl,
        company,
        logoUrl,
      }),
      text: renderStaffInviteEmailText({
        inviteeName: fullName,
        inviteeEmail: email,
        inviterName,
        role,
        inviteUrl,
        company,
      }),
    })

    if (sendError) {
      // Try to clean up the pending auth user so the admin doesn't end up
      // with an orphaned account that never received an email.
      const createdUserId = linkData.user?.id
      if (createdUserId) {
        await admin.auth.admin.deleteUser(createdUserId).catch((err: unknown) => {
          console.error('staff-invite failed to delete orphaned user:', err)
        })
      }
      console.error('staff-invite email send failed:', sendError)
      return { error: `Could not send the invite: ${sendError.message ?? 'unknown error'}` }
    }

    revalidatePath('/settings')
    return { ok: true }
  } catch (err) {
    console.error('staff-invite unexpected error:', err)
    console.error('sendStaffInvite: unexpected error:', err)
    return {
      error: 'Could not send the invite. Please try again later.',
    }
  }
}
