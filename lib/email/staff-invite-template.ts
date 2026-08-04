// lib/email/staff-invite-template.ts
// Pure functions that render the staff/admin invitation email subject / HTML /
// plain text bodies. Uses the shared transactional shell so the staff invite
// matches the operator invoice + client-portal confirm emails byte-for-byte
// at the layout level (red banner header, body card, full footer).
//
// The invitee's full_name is required input from the team-management form —
// it's passed through to handle_new_user() so the operator profile is
// pre-populated the moment they sign in, and we use it here to greet them
// by name in the email body.

import {
  escapeHtml,
  renderFallbackUrl,
  renderInviteButton,
  renderTransactionalEmailHtml,
  renderTransactionalSignoff,
  type TransactionalCompany,
} from '@/lib/email/transactional-template'
import { filterChannelsByContext } from '@/lib/company'

interface SubjectInput {
  companyName: string
  inviteeName: string
}

interface RenderInput {
  /** Full name of the invitee — required, used in greeting + preheader. */
  inviteeName: string
  inviteeEmail: string
  inviterName: string | null
  role: 'staff' | 'admin' | 'picker' | 'driver'
  inviteUrl: string
  company: TransactionalCompany
  /** Absolute https URL to the company logo. Falls back to SH tile if null. */
  logoUrl?: string | null
}

export function renderStaffInviteEmailSubject(input: SubjectInput): string {
  return `${input.inviteeName}, you've been invited to join ${input.companyName}`
}

function roleLabel(role: 'staff' | 'admin' | 'picker' | 'driver'): string {
  if (role === 'admin') return 'an administrator'
  if (role === 'picker') return 'a warehouse picker'
  if (role === 'driver') return 'a delivery driver'
  return 'a team member'
}

/** Destination description for invite copy (not always the full dashboard). */
function accessLabel(role: 'staff' | 'admin' | 'picker' | 'driver'): {
  signInWhere: string
  afterAccess: string
  headerSubtitle: string
} {
  if (role === 'picker') {
    return {
      signInWhere: 'the warehouse picking app',
      afterAccess:
        "After accepting you'll use the warehouse picking app to load and complete delivery orders. You won't see prices, invoices, or settings.",
      headerSubtitle: 'Warehouse picking',
    }
  }
  if (role === 'driver') {
    return {
      signInWhere: 'the delivery driver app',
      afterAccess:
        "After accepting you'll use the delivery driver app to see your assigned jobs, navigate to each address, print the delivery note and mark deliveries as complete. You won't see prices, invoices, or settings.",
      headerSubtitle: 'Delivery driver',
    }
  }
  if (role === 'admin') {
    return {
      signInWhere: 'the operator dashboard',
      afterAccess:
        "After accepting you'll have full administrator access to the operator dashboard. If anything looks wrong, reply to this email and we'll fix it before you sign in.",
      headerSubtitle: 'Operator dashboard',
    }
  }
  return {
    signInWhere: 'the operator dashboard',
    afterAccess:
      "After accepting you'll have access to the operator dashboard with the permissions assigned to your role. If anything looks wrong, reply to this email and we'll fix it before you sign in.",
    headerSubtitle: 'Operator dashboard',
  }
}

function buildStaffInviteBodyHtml(input: RenderInput): string {
  const safeName = escapeHtml(input.inviteeName)
  const safeInviter = input.inviterName ? escapeHtml(input.inviterName) : null
  const safeCompany = escapeHtml(input.company.company_name)
  const role = roleLabel(input.role)
  const access = accessLabel(input.role)

  const who = safeInviter
    ? `<strong>${safeInviter}</strong> has invited you to join <strong>${safeCompany}</strong> as ${role}.`
    : `You've been invited to join <strong>${safeCompany}</strong> as ${role}.`

  // Preheader copy — kept short so it doesn't truncate in Gmail's
  // collapsed preview. Personalised so it reads as a real intro, not a
  // generic system message.
  const preheader = safeInviter
    ? `${safeInviter} invited ${input.inviteeName} to join ${input.company.company_name} as a ${role.replace(/^an? /, '')}. Link expires in 7 days.`
    : `${input.inviteeName}, you've been invited to join ${input.company.company_name}. Link expires in 7 days.`

  const body = `
        <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">You're invited to join the team</h1>
        <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi ${safeName},</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
          ${who}
        </p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#334155;">
          Click the button below to accept the invitation, set your password and sign in to ${escapeHtml(access.signInWhere)}. The link will expire in <strong>7 days</strong>.
        </p>

        ${renderInviteButton('Accept invitation', input.inviteUrl)}

        ${renderFallbackUrl(input.inviteUrl)}

        <div style="margin:0 0 24px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-left:3px solid #C8202C;border-radius:6px;font-size:14px;line-height:1.55;color:#334155;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">What you'll be able to do</div>
          ${escapeHtml(access.afterAccess)}
        </div>

        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
          If you weren't expecting this email, you can safely ignore it — no account will be created until you click the button above.
        </p>

        ${renderTransactionalSignoff({ company: input.company, inviterName: input.inviterName })}
      `

  return renderTransactionalEmailHtml({
    company: input.company,
    preheader,
    subject: renderStaffInviteEmailSubject({
      companyName: input.company.company_name,
      inviteeName: input.inviteeName,
    }),
    bodyHtml: body,
    headerSubtitle: access.headerSubtitle,
    logoUrl: input.logoUrl ?? null,
  })
}

export function renderStaffInviteEmailHtml(input: RenderInput): string {
  return buildStaffInviteBodyHtml(input)
}

export function renderStaffInviteEmailText(input: RenderInput): string {
  const safeInviter = input.inviterName
  const role = roleLabel(input.role)
  const opener = safeInviter
    ? `${safeInviter} has invited you to join ${input.company.company_name} as ${role}.`
    : `You've been invited to join ${input.company.company_name} as ${role}.`
  const signedBy = safeInviter
    ? `${safeInviter} on behalf of the team at ${input.company.company_name}`
    : `the team at ${input.company.company_name}`

  const lines: string[] = []
  lines.push(`Hi ${input.inviteeName},`)
  lines.push('')
  const access = accessLabel(input.role)
  lines.push(opener)
  lines.push('')
  lines.push(
    `Click the link below to accept the invitation, set your password and sign in to ${access.signInWhere}. The link will expire in 7 days.`
  )
  lines.push('')
  lines.push(input.inviteUrl)
  lines.push('')
  lines.push(access.afterAccess)
  lines.push('')
  lines.push("If the button doesn't work in your email client, paste the link above into your browser.")
  lines.push('')
  lines.push("If you weren't expecting this email, you can safely ignore it — no account will be created until you accept.")
  lines.push('')
  const emailPhones = filterChannelsByContext(input.company.phones ?? [], 'email')
  const emailEmails = filterChannelsByContext(input.company.emails ?? [], 'email')

  lines.push('Need help? Reply to this email or contact:')
  if (emailPhones.length) {
    for (const c of emailPhones) {
      lines.push(`  Phone${c.label ? ` (${c.label})` : ''}: ${c.value}`)
    }
  } else if (input.company.phone) {
    lines.push(`  Phone: ${input.company.phone}`)
  }
  if (emailEmails.length) {
    for (const c of emailEmails) {
      lines.push(`  Email${c.label ? ` (${c.label})` : ''}: ${c.value}`)
    }
  } else if (input.company.email) {
    lines.push(`  Email: ${input.company.email}`)
  }
  lines.push('')
  lines.push('Kind regards,')
  lines.push(input.company.company_name)
  lines.push(signedBy)
  lines.push('')
  lines.push('---')
  lines.push(input.company.company_name)
  const address = [
    input.company.address_line_1,
    input.company.address_line_2,
    input.company.town,
    input.company.county,
    input.company.postcode,
  ]
    .filter((p) => p && String(p).trim().length > 0)
    .join(', ')
  if (address) lines.push(address)
  if (emailPhones.length) {
    for (const c of emailPhones) {
      lines.push(`Tel: ${c.value}${c.label ? ` (${c.label})` : ''}`)
    }
  } else if (input.company.phone) {
    lines.push(`Tel: ${input.company.phone}`)
  }
  if (emailEmails.length) {
    for (const c of emailEmails) {
      lines.push(c.value)
    }
  } else if (input.company.email) {
    lines.push(input.company.email)
  }
  const regBits = [
    input.company.company_registration_number ? `Company Reg No: ${input.company.company_registration_number}` : '',
    input.company.vat_number ? `VAT Reg No: ${input.company.vat_number}` : '',
  ].filter(Boolean)
  if (regBits.length) lines.push(regBits.join(' · '))

  return lines.join('\n')
}