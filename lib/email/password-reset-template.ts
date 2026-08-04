// lib/email/password-reset-template.ts
// Pure functions that render the admin-triggered password-reset email.
// Used by lib/actions/adminPasswordReset.ts when an operator chooses to send
// a recovery link to an existing staff / admin user or client. Self-service
// resets (the `/reset-password` page) go through Supabase Auth's own email
// pipeline — this template is only for the admin-initiated path so a single
// operator action delivers the link from our own domain.
//
// Subject / HTML / text mirror the layout of the staff and client invite
// templates (red banner header, white body card, full footer) via the shared
// transactional shell, so every email the operator sends feels like it came
// from the same business.
//
// SECURITY: we render names through escapeHtml() and never interpolate the
// reset URL into the subject line or preheader (it would leak the OTP-style
// token into inbox previews on shared machines).

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
  recipientName?: string | null
}

interface RenderInput {
  /** First name or full name of the recipient — optional. Falls back to a generic greeting. */
  recipientName?: string | null
  /** Surface the user is recovering access to. */
  portalLabel: 'operator dashboard' | 'client portal' | 'warehouse picking app'
  /** Full reset URL — Supabase action_link with redirect_to=/auth/callback?next=/update-password. */
  resetUrl: string
  /** True when the reset was requested by an admin (vs the user self-serving). */
  adminInitiated: boolean
  /** Admin's name (only when adminInitiated) — used in greeting + signoff. */
  inviterName?: string | null
  company: TransactionalCompany
  /** Absolute https URL to the company logo. Falls back to SH tile if null. */
  logoUrl?: string | null
}

export function renderPasswordResetEmailSubject(input: SubjectInput): string {
  return `Reset your ${input.companyName} password`
}

function safeGreeting(recipientName?: string | null): string {
  if (recipientName && recipientName.trim()) return recipientName.trim()
  return 'there'
}

function buildPasswordResetBodyHtml(input: RenderInput): string {
  const safeName = escapeHtml(safeGreeting(input.recipientName))
  const safeInviter = input.inviterName ? escapeHtml(input.inviterName) : null
  const safeCompany = escapeHtml(input.company.company_name)
  const portal = escapeHtml(input.portalLabel)

  const opener = input.adminInitiated && safeInviter
    ? `<strong>${safeInviter}</strong> from <strong>${safeCompany}</strong> has triggered a password reset for your account.`
    : `We received a request to reset the password on your <strong>${safeCompany}</strong> ${portal}.`

  const preheader = input.adminInitiated
    ? `An administrator has initiated a password reset for your ${safeCompany} account.`
    : `Reset your ${safeCompany} ${portal} password. The link is valid for one hour.`

  const body = `
        <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">Reset your password</h1>
        <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi ${safeName},</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
          ${opener}
        </p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#334155;">
          Click the button below to set a new password for your ${portal}. The link is valid for <strong>one hour</strong> and can only be used once.
        </p>

        ${renderInviteButton('Reset password', input.resetUrl)}

        ${renderFallbackUrl(input.resetUrl)}

        <div style="margin:0 0 24px;padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-left:3px solid #C8202C;border-radius:6px;font-size:14px;line-height:1.55;color:#334155;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">If you didn't request this</div>
          ${
            input.adminInitiated
              ? `If you weren't expecting this email — for example, if you didn't ask ${safeInviter ?? 'an administrator'} to reset your password — you can safely ignore it. Your existing password will keep working until you click the button above.`
              : `If you didn't request a password reset, you can safely ignore this email. Your password has not been changed.`
          }
        </div>

        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
          For your security, never share this link with anyone. The team at ${safeCompany} will never ask for your password.
        </p>

        ${renderTransactionalSignoff({
          company: input.company,
          inviterName: input.adminInitiated ? input.inviterName ?? null : null,
        })}
      `

  return renderTransactionalEmailHtml({
    company: input.company,
    preheader,
    subject: renderPasswordResetEmailSubject({
      companyName: input.company.company_name,
      recipientName: input.recipientName,
    }),
    bodyHtml: body,
    headerSubtitle: 'Password reset',
    logoUrl: input.logoUrl ?? null,
  })
}

export function renderPasswordResetEmailHtml(input: RenderInput): string {
  return buildPasswordResetBodyHtml(input)
}

export function renderPasswordResetEmailText(input: RenderInput): string {
  const greeting = safeGreeting(input.recipientName)
  const portal = input.portalLabel
  const opener = input.adminInitiated && input.inviterName
    ? `${input.inviterName} from ${input.company.company_name} has triggered a password reset for your account.`
    : `We received a request to reset the password on your ${input.company.company_name} ${portal}.`

  const lines: string[] = []
  lines.push(`Hi ${greeting},`)
  lines.push('')
  lines.push(opener)
  lines.push('')
  lines.push(
    `Click the link below to set a new password for your ${portal}. The link is valid for one hour and can only be used once.`
  )
  lines.push('')
  lines.push(input.resetUrl)
  lines.push('')
  lines.push("If the button doesn't work in your email client, paste the link above into your browser.")
  lines.push('')
  if (input.adminInitiated) {
    lines.push(
      `If you weren't expecting this email you can safely ignore it — your password won't change until you click the link above.`
    )
  } else {
    lines.push(
      `If you didn't request this reset, you can safely ignore this email. Your password has not been changed.`
    )
  }
  lines.push('')
  lines.push(`For your security, never share this link with anyone. The team at ${input.company.company_name} will never ask for your password.`)
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
  if (input.adminInitiated && input.inviterName) {
    lines.push(`on behalf of ${input.inviterName}`)
  }
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
