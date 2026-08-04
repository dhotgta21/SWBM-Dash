// lib/actions/invites.ts
// Admin-side server actions for the client portal invite flow.
//
// Lifecycle:
//   1. Admin clicks "Send portal invite" on the client detail page
//      → sendClientInvite(clientId) inserts a client_invitations row
//        and emails the client with our custom branded link.
//   2. Client clicks the link → /invite/[token] (handled by the page,
//      not this file) validates the token, creates the auth user,
//      exchanges a magic link for a session, updates the profile to
//      role='client' + client_id=<this client>, marks the invitation
//      accepted, and redirects to /invite/set-password.
//   3. Client sets a password → /invite/set-password uses updateUser,
//      signs the recovery session out, and redirects to /login.
//   4. Admin can revoke a pending invite via revokeClientInvite.
//
// Auth note: every action here runs server-side as the authenticated
// admin. We always re-check auth, never trust a route param alone.

'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import { isLikelyValidEmail } from '@/lib/utils'
import { loadCompany } from '@/lib/company'
import { rateLimit } from '@/lib/rate-limit'
import {
  renderClientInviteEmailHtml,
  renderClientInviteEmailSubject,
  renderClientInviteEmailText,
} from '@/lib/email/client-invite-template'
import { buildEmailFromHeader } from '@/lib/email/from-header'
import { getResendApiKey, getResendFromAddress } from '@/lib/resend'

// 7-day invite lifetime. Long enough for a customer to spot the email in
// their inbox, short enough that a stale invite can't be used to claim
// ownership of a client record months later.
const INVITE_TTL_DAYS = 7

// Per-(client, hour) send cap. Defends against an admin re-clicking the
// button on a flaky connection or a compromised admin account running
// a "send everyone a fresh link" loop. 5/hr is generous — anything more
// is almost certainly abusive.
const MAX_SENDS_PER_HOUR = 5

// Per-admin global send cap so a compromised session cannot blast the
// whole client list (5/client × N clients would otherwise scale freely).
const MAX_SENDS_PER_ADMIN_PER_HOUR = 30

const UuidSchema = z.string().uuid()

/** Operator roles that must never be flipped into a client portal account. */
const OPERATOR_ROLES = new Set(['admin', 'staff', 'picker', 'driver'])

interface ActionSuccess<T = undefined> {
  ok: true
  data?: T
}

interface ActionError {
  ok: false
  error: string
}

type ActionResult<T = undefined> = ActionSuccess<T> | ActionError

// Resolve the canonical app base URL for invite links from the
// NEXT_PUBLIC_APP_URL env var. Callers must bail rather than emit a
// broken link.
//
// We deliberately don't read from the inbound request — invite emails
// are sent by server actions with no inbound user request, and
// trusting request headers opens an obvious spoofing vector.
async function resolveBaseUrlAsync(): Promise<string | null> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  return null
}

function generateInviteToken(): string {
  // 32 bytes of randomness hex-encoded → 64 chars. More than enough for
  // an unguessable, single-use invite token.
  return randomBytes(32).toString('hex')
}

async function sendInviteEmail(opts: {
  to: string
  clientName: string
  inviteUrl: string
  inviterName: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await getResendApiKey()
  const envFrom = await getResendFromAddress()
  if (!apiKey || !envFrom) {
    return { ok: false, error: 'Email is not configured. Set RESEND_API_KEY and RESEND_FROM_ADDRESS in .env.local or save them in Settings → Integrations.' }
  }

  // Resolve the company name for the email body. We deliberately use
  // `company_name` here — `email_from_name` is the friendly sender
  // shown in the From header (e.g. "Customer Service") which reads
  // oddly in the email body. Body content should always reference
  // the actual business name.
  let companyName = 'Star Hawk Builders Merchant'
  let emailFromName: string | null = null
  let logoUrl: string | null = null
  let company: Parameters<typeof renderClientInviteEmailHtml>[0]['company'] = {
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
    {
      const baseUrl = await resolveBaseUrlAsync()
      if (baseUrl) {
        logoUrl = `${baseUrl.replace(/\/$/, '')}/Logo.png`
      }
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

  const subject = renderClientInviteEmailSubject({ clientName: opts.clientName, companyName })
  const html = renderClientInviteEmailHtml({
    clientName: opts.clientName,
    inviterName: opts.inviterName,
    inviteUrl: opts.inviteUrl,
    company,
    logoUrl,
  })
  const text = renderClientInviteEmailText({
    clientName: opts.clientName,
    inviterName: opts.inviterName,
    inviteUrl: opts.inviteUrl,
    company,
  })

  const resend = new Resend(apiKey)
  // From header: prefer `email_from_name` (the friendly sender the operator
  // configured) but fall back to `companyName` so the header is never empty.
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
      console.error('sendClientInvite: email send failed:', error)
      return { ok: false, error: 'Could not send the invitation email. Please try again later.' }
    }
    return { ok: true }
  } catch (err) {
    console.error('sendClientInvite: unexpected error:', err)
    return { ok: false, error: 'Could not send the invitation email. Please try again later.' }
  }
}

/**
 * Send (or re-send) a portal invite for the given client. The client
 * must already have an email on file (no email = nothing to send to).
 *
 * If a pending invite already exists, we extend its expiry, refresh
 * `last_sent_at`, and re-send the email — no new token, no new row.
 * This keeps the audit trail clean and stops "did the second click
 * count?" confusion.
 */
export async function sendClientInvite(clientId: string): Promise<ActionResult<{ invitationId: string }>> {
  // Fail-fast on missing server config — surface the precise missing env
  // var instead of letting createAdminClient() throw a stack trace that the
  // operator can't act on.
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

  const parsedClientId = UuidSchema.safeParse(clientId)
  if (!parsedClientId.success) {
    return { ok: false, error: 'Client not found' }
  }
  clientId = parsedClientId.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Per-admin global throttle (in addition to the per-client cap below).
  const adminRl = await rateLimit(
    supabase,
    `client-invite-admin:${user.id}`,
    MAX_SENDS_PER_ADMIN_PER_HOUR,
    60 * 60_000,
    { failOpen: false }
  )
  if (!adminRl.allowed) {
    return {
      ok: false,
      error: `Too many portal invites from this account. Please try again in ${Math.ceil(adminRl.retryAfter)}s.`,
    }
  }

  // Pull the client + verify the caller can see it (owner or admin).
  // The user-facing read goes through RLS so an operator who isn't
  // the client owner (and isn't admin) can't even enumerate invite
  // targets — important since the admin button is shown on every
  // client detail page.
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, first_name, last_name, email, created_by')
    .eq('id', clientId)
    .is('deleted_at', null)
    .single()
  if (clientErr || !client) {
    return { ok: false, error: 'Client not found' }
  }
  if (!client.email || !isLikelyValidEmail(client.email)) {
    return { ok: false, error: 'Client has no email on file. Add an email address first.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  const perms = resolveStaffPermissions(profile?.role, profile?.permissions)
  const isAdminUserRow = await isAdminUser(supabase, user.id)
  if (!isAdminUserRow && !perms.clients_send_portal_invite) {
    return { ok: false, error: 'Not authorised' }
  }

  // All writes to client_invitations go through the service-role admin
  // client. The table has no INSERT/UPDATE RLS policies (deliberately —
  // we don't want a future bug to allow anyone to mint invites), so a
  // direct write via the user-facing client would silently fail. The
  // SELECTs stay on the user client so admins see only what they're
  // entitled to (RLS still narrows it).
  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('sendClientInvite: could not create admin client:', err)
    return {
      ok: false,
      error: 'Server configuration error. Please contact support.',
    }
  }

  // If this client already has a portal account, refuse a new invite —
  // accept would fail and the customer would only get a confusing email.
  // Operators should use "Reset password" instead.
  const { data: linkedPortal } = await admin
    .from('profiles')
    .select('id, email')
    .eq('client_id', clientId)
    .maybeSingle()
  if (linkedPortal) {
    return {
      ok: false,
      error:
        'This client already has a portal account. Use "Reset password" instead of sending a new invite.',
    }
  }

  // Throttle: max 5 re-sends per hour per client. Without this, a flaky
  // connection + impatient admin = 50 emails/hour landing in the
  // customer's inbox. 5/hr is enough for a legitimate retry storm.
  // Uses the shared rate-limit table — re-sends reuse a single invitation
  // row, so counting rows would never trip.
  const clientRl = await rateLimit(
    supabase,
    `client-invite-send:${clientId}`,
    MAX_SENDS_PER_HOUR,
    60 * 60_000,
    { failOpen: false }
  )
  if (!clientRl.allowed) {
    return { ok: false, error: 'Too many invites sent recently. Please wait an hour before retrying.' }
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60_000).toISOString()
  const nowIso = new Date().toISOString()
  const inviteEmail = client.email.toLowerCase()

  // Pre-resolve the auth user for the invite's email, if one already
  // exists. We do this before any write so we can hard-fail if the email
  // belongs to an operator account, without leaving a stale invitation.
  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, role, client_id')
    .eq('email', inviteEmail)
    .maybeSingle()
  if (existingProfile) {
    if (OPERATOR_ROLES.has(existingProfile.role)) {
      return {
        ok: false,
        error:
          'This email belongs to a staff, admin, picker, or driver account. Use a different email for the client portal.',
      }
    }
    // Client profiles may only be linked to one customer. Re-inviting the
    // same client is fine only when not already linked (blocked above);
    // inviting a different client with the same email would move the
    // profile and break the one-profile-per-client invariant.
    if (existingProfile.client_id && existingProfile.client_id !== clientId) {
      return {
        ok: false,
        error:
          'This email is already linked to a different client. Use a unique email for each client portal account.',
      }
    }
    // Unlinked client-role profile for this email on another path still
    // means a portal identity exists — do not re-invite.
    if (existingProfile.role === 'client' && existingProfile.client_id === clientId) {
      return {
        ok: false,
        error:
          'This client already has a portal account. Use "Reset password" instead of sending a new invite.',
      }
    }
  }

  // Look up any existing pending invite. If we find one, reuse it.
  //
  // The partial UNIQUE index idx_client_invitations_pending_unique on
  // (client_id) WHERE status='pending' (migration 024) closes the
  // race where two concurrent admin clicks both pass this lookup and
  // both insert — the second insert gets a 23505 and we recover by
  // re-fetching the winner the first click just created.
  const { data: existing } = await admin
    .from('client_invitations')
    .select('id, token, status, profile_id, email')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .maybeSingle()

  let invitationId: string
  let token: string
  let createdNew = false
  // When the client's email changed after the original invite, we must
  // update the row (and clear a stale profile_id) so accept binds to the
  // address that actually received the email.
  let emailChangedOnExisting = false

  if (existing) {
    invitationId = existing.id
    token = existing.token
    emailChangedOnExisting = existing.email.toLowerCase() !== inviteEmail
  } else {
    token = generateInviteToken()
    const { data: inserted, error: insertErr } = await admin
      .from('client_invitations')
      .insert({
        client_id: clientId,
        email: inviteEmail,
        token,
        invited_by: user.id,
        expires_at: expiresAt,
        // last_sent_at intentionally left null until the email actually
        // goes out. This prevents failed sends from counting against the
        // rate limit and from leaving a record that looks like a success.
        last_sent_at: null,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      // 23505 on the pending-unique index — another admin click won
      // the race. Re-fetch the winner and reuse its token instead of
      // erroring. This way two simultaneous "Send invite" clicks
      // produce exactly one email, not two.
      if (insertErr?.code === '23505') {
        const { data: raceWinner } = await admin
          .from('client_invitations')
          .select('id, token, email')
          .eq('client_id', clientId)
          .eq('status', 'pending')
          .maybeSingle()
        if (raceWinner) {
          invitationId = raceWinner.id
          token = raceWinner.token
          emailChangedOnExisting = raceWinner.email.toLowerCase() !== inviteEmail
        } else {
          return { ok: false, error: safeActionError('invites.send.insert', insertErr, 'Could not create the invite.') }
        }
      } else {
        return { ok: false, error: safeActionError('invites.send.insert', insertErr, 'Could not create the invite.') }
      }
    } else {
      invitationId = inserted.id
      createdNew = true
    }
  }

  // Sync invitation.email (and profile_id) *before* sending so accept always
  // binds to the address that received the email — even if a later stamp of
  // last_sent_at fails.
  if (emailChangedOnExisting || existingProfile?.id) {
    const preSend: { email: string; profile_id?: string | null } = { email: inviteEmail }
    if (emailChangedOnExisting) {
      preSend.profile_id = existingProfile?.id ?? null
    } else if (existingProfile?.id) {
      preSend.profile_id = existingProfile.id
    }
    const { error: preSyncErr } = await admin
      .from('client_invitations')
      .update(preSend)
      .eq('id', invitationId)
    if (preSyncErr) {
      console.error('Failed to pre-sync invitation email before send:', preSyncErr)
      if (createdNew) {
        await admin.from('client_invitations').delete().eq('id', invitationId)
      }
      return {
        ok: false,
        error: 'Could not update the invite for the current client email. Please try again.',
      }
    }
  }

  // Build the invite URL and send the email.
  const baseUrl = await resolveBaseUrlAsync()
  if (!baseUrl) {
    // Don't generate a broken link — clean up a freshly inserted row
    // and tell the admin to set the canonical URL.
    if (createdNew) {
      await admin.from('client_invitations').delete().eq('id', invitationId)
    }
    return {
      ok: false,
      error:
        'NEXT_PUBLIC_APP_URL is not set. Set it on Vercel env (e.g. https://starhawkbm.com), then retry.',
    }
  }
  const inviteUrl = `${baseUrl}/invite/${token}`

  // Look up the inviter's name so the email can sign off personally.
  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const clientName = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || 'there'

  const emailResult = await sendInviteEmail({
    to: inviteEmail,
    clientName,
    inviterName: inviterProfile?.full_name ?? null,
    inviteUrl,
  })

  if (!emailResult.ok) {
    // The email failed. A brand-new row was inserted with no last_sent_at,
    // so delete it to avoid leaving an apparently-valid invitation the
    // customer could click. An existing row is left without advancing
    // last_sent_at/expires (email may already have been pre-synced).
    if (createdNew) {
      await admin.from('client_invitations').delete().eq('id', invitationId)
    }
    return { ok: false, error: emailResult.error ?? 'Could not send the invite email.' }
  }

  // Email succeeded: stamp send metadata (email already synced above).
  const updateFields: {
    last_sent_at: string
    expires_at: string
    invited_by: string
    email: string
    profile_id?: string | null
  } = {
    last_sent_at: nowIso,
    expires_at: expiresAt,
    invited_by: user.id,
    email: inviteEmail,
  }
  if (existingProfile?.id) {
    updateFields.profile_id = existingProfile.id
  } else if (emailChangedOnExisting) {
    updateFields.profile_id = null
  }
  const { error: stampErr } = await admin
    .from('client_invitations')
    .update(updateFields)
    .eq('id', invitationId)
  if (stampErr) {
    // The invite was sent but we couldn't stamp it. Log for ops; the row
    // still has a valid token + correct email so the customer can accept.
    console.error('Failed to stamp invitation after successful send:', stampErr)
  }

  revalidatePath(`/clients/${clientId}`)
  return { ok: true, data: { invitationId } }
}

/**
 * Revoke a pending invite. Already-accepted invites can't be revoked
 * this way — disabling a client account is a separate flow (delete the
 * profile row / flip is_active=false).
 */
export async function revokeClientInvite(invitationId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  // Read through the user client so RLS narrows what we see. We have
  // to fetch the parent client to check the created_by authorization
  // rule; doing this with a join (`clients(id, created_by)`) keeps it
  // to a single round trip.
  const { data: invite, error: inviteErr } = await supabase
    .from('client_invitations')
    .select('id, status, client_id, clients(id, created_by)')
    .eq('id', invitationId)
    .single()
  if (inviteErr || !invite) return { ok: false, error: 'Invite not found' }

  const clientRow = Array.isArray(invite.clients) ? invite.clients[0] : invite.clients
  if (!clientRow) return { ok: false, error: 'Client not found' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  const perms = resolveStaffPermissions(profile?.role, profile?.permissions)
  const isAdminUserRow = await isAdminUser(supabase, user.id)
  if (!isAdminUserRow && !perms.clients_revoke_portal_invite) {
    return { ok: false, error: 'Not authorised' }
  }

  if (invite.status !== 'pending') {
    return { ok: false, error: `Cannot revoke an invite that is already ${invite.status}.` }
  }

  // Same RLS-bypass-via-admin pattern as send: the table deliberately
  // has no UPDATE policy, so writes go through the service-role
  // client after we've verified the caller is entitled.
  const admin = createAdminClient()
  const { error: updateErr } = await admin
    .from('client_invitations')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('id', invitationId)
  if (updateErr) {
    return { ok: false, error: safeActionError('invites.revoke', updateErr, 'Could not revoke the invite.') }
  }

  revalidatePath(`/clients/${clientRow.id}`)
  return { ok: true }
}

/**
 * Server-side helper used by /invite/[token]. Looks up an invitation
 * by token, validates it (not expired, not revoked, not already
 * accepted), creates the auth user if one doesn't exist yet, exchanges
 * a magic link for a session, and updates the profile to role='client'
 * + client_id=<this client>.
 *
 * Returns the resulting session tokens so the page can set the
 * cookies via the Supabase server client's getUser() round-trip
 * (handled by Next's middleware refresh) — the caller (page) does
 * NOT need to touch cookies itself; the exchange call has already
 * set them on the response via the cookies adapter.
 *
 * SECURITY:
 *   - Runs only after the token is verified.
 *   - All writes go through the service-role admin client.
 *   - The auth user is created with email_confirm=true so we don't
 *     also need Supabase's confirmation email; the user has already
 *     proved control of the address by clicking our invite link.
 */
export async function acceptInviteWithToken(
  token: string
): Promise<
  ActionResult<{
    invitationId: string
    clientId: string
    email: string
    redirectTo: string
  }>
> {
  if (!token || token.length < 16 || token.length > 256) {
    return { ok: false, error: 'Invalid invite token.' }
  }

  const admin = createAdminClient()

  const { data: invite, error: inviteErr } = await admin
    .from('client_invitations')
    .select('id, client_id, email, status, expires_at, profile_id')
    .eq('token', token)
    .maybeSingle()

  if (inviteErr || !invite) {
    return { ok: false, error: 'This invite could not be found.' }
  }

  if (invite.status === 'revoked') {
    return { ok: false, error: 'This invite has been revoked. Please ask your contact at Star Hawk to send a new one.' }
  }
  if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
    // Mark as expired if it hasn't been already (idempotent).
    if (invite.status !== 'expired') {
      await admin.from('client_invitations').update({ status: 'expired' }).eq('id', invite.id)
    }
    return { ok: false, error: 'This invite has expired. Please ask your contact at Star Hawk to send a new one.' }
  }
  if (invite.status === 'accepted') {
    return { ok: false, error: 'This invite has already been used. Please sign in instead.' }
  }

  // Look up the client record. The RPC stamps the profile.full_name from
  // this row inside the transaction (so the name is set atomically with
  // the role/client_id flip), but we still surface a clean error here if
  // the client has been deleted while the invite was in flight.
  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .select('id')
    .eq('id', invite.client_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (clientErr || !clientRow) {
    return { ok: false, error: 'The client record for this invite no longer exists.' }
  }

  // Pre-check: if the client is ALREADY linked to a profile, we cannot
  // link them again — the partial unique index idx_profiles_client_id_unique
  // enforces "at most one auth user per client". Surface a friendly
  // message so the admin can reset the password from the client detail
  // page rather than re-inviting.
  const { data: existingLink } = await admin
    .from('profiles')
    .select('id, email')
    .eq('client_id', invite.client_id)
    .maybeSingle()
  if (existingLink) {
    return {
      ok: false,
      error: `This client already has a portal account (${existingLink.email ?? 'existing user'}). Reset their password from the client detail page instead of re-inviting.`,
    }
  }

  // 1. Resolve the auth user — either use a profile we already linked
  //    to this invitation (sendClientInvite pre-resolves when a profile
  //    with this email already existed), create a fresh one, or recover
  //    an existing auth.users row with the same email via profiles.email
  //    (O(1) index lookup) with listUsers only as a last-resort fallback.
  let userId: string | null = null
  const { data: linkedProfile } = invite.profile_id
    ? await admin.from('profiles').select('id').eq('id', invite.profile_id).maybeSingle()
    : { data: null }

  if (linkedProfile?.id) {
    userId = linkedProfile.id
  } else {
    // Prefer an existing profiles row for this email (same id as auth.users).
    const { data: profileByEmail } = await admin
      .from('profiles')
      .select('id, role, client_id')
      .eq('email', invite.email.toLowerCase())
      .maybeSingle()

    if (profileByEmail?.id) {
      if (OPERATOR_ROLES.has(profileByEmail.role)) {
        return {
          ok: false,
          error:
            'This email belongs to a staff, admin, picker, or driver account and cannot be used for the client portal.',
        }
      }
      if (profileByEmail.client_id && profileByEmail.client_id !== invite.client_id) {
        return {
          ok: false,
          error:
            'This email is already linked to a different client. Please ask your contact at Star Hawk to check the portal account.',
        }
      }
      userId = profileByEmail.id
      await admin
        .from('client_invitations')
        .update({ profile_id: userId })
        .eq('id', invite.id)
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: invite.email,
        email_confirm: true,
        // Do not set invited_role=client here — profiles_role_client_match
        // requires client_id when role=client; accept_invitation sets both
        // atomically. Default handle_new_user role is staff until then.
      })
      if (!createErr && created?.user) {
        userId = created.user.id
        await admin
          .from('client_invitations')
          .update({ profile_id: userId })
          .eq('id', invite.id)
      } else {
        const message = createErr?.message ?? ''
        const isAlreadyRegistered =
          message.toLowerCase().includes('already') ||
          message.toLowerCase().includes('registered') ||
          createErr?.status === 422

        if (!isAlreadyRegistered) {
          return { ok: false, error: message || 'Could not create the user.' }
        }

        // Auth user exists without a profiles row (rare). Fall back to a
        // bounded listUsers scan and persist the id for the next attempt.
        const target = invite.email.toLowerCase()
        let found: { id: string } | null = null
        for (let page = 1; page <= 10; page++) {
          const { data: listData } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
          const match = listData?.users?.find((u) => u.email?.toLowerCase() === target)
          if (match) {
            found = { id: match.id }
            break
          }
          if ((listData?.users?.length ?? 0) < 1000) break
        }
        if (!found) {
          return {
            ok: false,
            error:
              'A user with this email already exists but could not be linked. Please ask your contact at Star Hawk to reset the portal account.',
          }
        }
        userId = found.id
        await admin
          .from('client_invitations')
          .update({ profile_id: userId })
          .eq('id', invite.id)
      }
    }
  }

  if (!userId) {
    return { ok: false, error: 'Could not resolve the user account for this invite.' }
  }

  // 2. Generate the magic-link OTP *before* accepting the invitation.
  //    Previously accept ran first, so a generateLink failure left the
  //    invite marked accepted with no way for the customer to finish
  //    set-password except an admin password reset. Generating first
  //    keeps the invite pending if session minting fails; the OTP is
  //    only returned after accept succeeds.
  const baseUrl = await resolveBaseUrlAsync()
  if (!baseUrl) {
    return {
      ok: false,
      error: 'No canonical app URL is configured. Set NEXT_PUBLIC_APP_URL.',
    }
  }
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: invite.email,
    options: { redirectTo: `${baseUrl}/invite/set-password` },
  })

  if (linkErr || !linkData) {
    return {
      ok: false,
      error:
        linkErr?.message ??
        'Could not generate a sign-in link. Please try the invite again in a few minutes.',
    }
  }

  let otpToken: string | null = null
  try {
    const u = new URL(linkData.properties.action_link)
    otpToken = u.searchParams.get('token')
  } catch {
    otpToken = null
  }
  if (!otpToken) {
    return { ok: false, error: 'Could not extract the sign-in token from the email link.' }
  }

  // 3. Atomic profile update + invitation status flip.
  const { error: acceptErr } = await admin.rpc('accept_invitation', { p_token: token })

  if (acceptErr) {
    const msg = acceptErr.message ?? ''
    if (
      acceptErr.code === 'P0001' &&
      /already has a portal account/i.test(msg)
    ) {
      return {
        ok: false,
        error:
          'This client already has a portal account. Reset their password from the client detail page instead of re-inviting.',
      }
    }
    if (acceptErr.code === 'P0001' && /already been used/i.test(msg)) {
      return { ok: false, error: 'This invite has already been used. Please sign in instead.' }
    }
    if (acceptErr.code === 'P0001' && /revoked/i.test(msg)) {
      return {
        ok: false,
        error: 'This invite has been revoked. Please ask your contact at Star Hawk to send a new one.',
      }
    }
    if (acceptErr.code === 'P0001' && /expired/i.test(msg)) {
      return {
        ok: false,
        error: 'This invite has expired. Please ask your contact at Star Hawk to send a new one.',
      }
    }
    if (acceptErr.code === 'P0001' && /already linked to a different client/i.test(msg)) {
      return {
        ok: false,
        error:
          'This email is already linked to a different client. Please ask your contact at Star Hawk to check the portal account.',
      }
    }
    if (
      acceptErr.code === 'P0001' &&
      /staff|admin|picker|operator/i.test(msg) &&
      /cannot be used|existing/i.test(msg)
    ) {
      return {
        ok: false,
        error:
          'This email belongs to a staff, admin, picker, or driver account and cannot be used for the client portal.',
      }
    }
    if (acceptErr.code === 'P0002') {
      return { ok: false, error: 'This invite could not be found.' }
    }
    return { ok: false, error: `Could not accept the invite: ${msg}` }
  }

  const verifyUrl = `${baseUrl}/invite/verify?token=${encodeURIComponent(otpToken)}&type=magiclink&next=${encodeURIComponent('/invite/set-password')}`

  return {
    ok: true,
    data: {
      invitationId: invite.id,
      clientId: invite.client_id,
      email: invite.email,
      redirectTo: verifyUrl,
    },
  }
}
