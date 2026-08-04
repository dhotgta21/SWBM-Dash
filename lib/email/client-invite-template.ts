// lib/email/client-invite-template.ts
// Pure functions that render the client-portal "confirm your registration"
// email. Used when an operator sends a customer a portal invite, and can
// be reused for any future "please confirm your email" transactional mail
// because the body copy and CTA label are driven by the caller.
//
// Uses the shared transactional shell so the customer-facing mail matches
// the operator-facing invoice + staff-invite emails at the layout level.

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
  clientName: string
  companyName: string
}

interface RenderInput {
  clientName: string
  inviterName: string | null
  inviteUrl: string
  company: TransactionalCompany
  /** Absolute https URL to the company logo. Falls back to SH tile if null. */
  logoUrl?: string | null
  /** Override the default CTA button label. */
  ctaLabel?: string
  /** Number of days the link is valid for — shown in the body copy. */
  expiryDays?: number
}

export function renderClientInviteEmailSubject(input: SubjectInput): string {
  return `Confirm your ${input.companyName} portal account`
}

function buildClientInviteBodyHtml(input: RenderInput): string {
  const safeName = escapeHtml(input.clientName)
  const safeInviter = input.inviterName ? escapeHtml(input.inviterName) : null
  const safeCompany = escapeHtml(input.company.company_name)
  const expiryDays = input.expiryDays ?? 7
  const ctaLabel = input.ctaLabel ?? 'Confirm my account'

  const opener = safeInviter
    ? `<strong>${safeInviter}</strong> has set up a portal account for you at <strong>${safeCompany}</strong> so you can manage your invoices and account online.`
    : `A portal account has been set up for you at <strong>${safeCompany}</strong> so you can manage your invoices and account online.`

  const preheader = `Confirm your email to activate your ${input.company.company_name} client portal. The link expires in ${expiryDays} days.`

  const body = `
        <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.3;color:#111827;">Confirm your portal account</h1>
        <p style="margin:0 0 16px 0;font-size:16px;color:#111827;">Hi ${safeName},</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">
          ${opener}
        </p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#334155;">
          Click the button below to confirm your email address and set a password. The link will expire in <strong>${expiryDays} days</strong>.
        </p>

        ${renderInviteButton(ctaLabel, input.inviteUrl)}

        ${renderFallbackUrl(input.inviteUrl)}

        <!-- What you can do in the portal -->
        <div style="margin:0 0 24px;padding:18px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px">Once your account is active, you'll be able to:</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px;color:#16a34a;font-weight:700">&check;</td>
              <td style="padding:6px 0;vertical-align:top;line-height:1.5">View and download your invoices and statements</td>
            </tr>
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px;color:#16a34a;font-weight:700">&check;</td>
              <td style="padding:6px 0;vertical-align:top;line-height:1.5">See what's paid, what's outstanding and when payments are due</td>
            </tr>
            <tr>
              <td style="padding:6px 0;vertical-align:top;width:20px;color:#16a34a;font-weight:700">&check;</td>
              <td style="padding:6px 0;vertical-align:top;line-height:1.5">Update your contact details, delivery addresses and account info</td>
            </tr>
          </table>
        </div>

        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">
          If you weren't expecting this email, you can safely ignore it — no account will be activated until you click the button above.
        </p>

        ${renderTransactionalSignoff({ company: input.company, inviterName: input.inviterName })}
      `

  return renderTransactionalEmailHtml({
    company: input.company,
    preheader,
    subject: renderClientInviteEmailSubject({
      clientName: input.clientName,
      companyName: input.company.company_name,
    }),
    bodyHtml: body,
    headerSubtitle: 'Client portal',
    logoUrl: input.logoUrl ?? null,
  })
}

export function renderClientInviteEmailHtml(input: RenderInput): string {
  return buildClientInviteBodyHtml(input)
}

export function renderClientInviteEmailText(input: RenderInput): string {
  const safeInviter = input.inviterName
  const expiryDays = input.expiryDays ?? 7
  const opener = safeInviter
    ? `${safeInviter} has set up a portal account for you at ${input.company.company_name} so you can manage your invoices and account online.`
    : `A portal account has been set up for you at ${input.company.company_name} so you can manage your invoices and account online.`
  const signedBy = safeInviter
    ? `${safeInviter} on behalf of the team at ${input.company.company_name}`
    : `the team at ${input.company.company_name}`

  const lines: string[] = []
  lines.push(`Hi ${input.clientName},`)
  lines.push('')
  lines.push(opener)
  lines.push('')
  lines.push(
    `Click the link below to confirm your email address and set a password. The link will expire in ${expiryDays} days.`
  )
  lines.push('')
  lines.push(input.inviteUrl)
  lines.push('')
  lines.push("If the button doesn't work in your email client, paste the link above into your browser.")
  lines.push('')
  lines.push("Once your account is active, you'll be able to:")
  lines.push('  - View and download your invoices and statements')
  lines.push("  - See what's paid, what's outstanding and when payments are due")
  lines.push('  - Update your contact details, delivery addresses and account info')
  lines.push('')
  lines.push("If you weren't expecting this email, you can safely ignore it — no account will be activated until you confirm.")
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