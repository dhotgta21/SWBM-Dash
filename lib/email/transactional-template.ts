// lib/email/transactional-template.ts
// Shared "transactional" email shell used by the staff invite, client portal
// confirm, and any future password-reset / verification mail we add. The look
// mirrors lib/email/invoice-template.ts (red banner header with logo block,
// white body card, full footer with company details) so every email the
// operator sends feels like it came from the same business.
//
// All styles are inline — no Tailwind, no external CSS — so the email
// renders consistently in Gmail, Outlook, Apple Mail and on mobile. The
// caller's responsibility is to:
//   1. Build the inner bodyHtml (paragraphs, CTA, fallback URL, etc.).
//   2. Pass a `preheader` for the inbox preview snippet.
//   3. Optionally pass `logoUrl` if they have a hosted image.

import {
  type CompanyContactChannel,
  filterChannelsByContext,
  telHref,
  mailtoHref,
} from '@/lib/company'

export interface TransactionalCompany {
  company_name: string
  address_line_1?: string | null
  address_line_2?: string | null
  town?: string | null
  county?: string | null
  postcode?: string | null
  /** @deprecated Use `phones` with context filters. Kept for backwards compatibility. */
  phone?: string | null
  /** @deprecated Use `emails` with context filters. Kept for backwards compatibility. */
  email?: string | null
  phones?: CompanyContactChannel[]
  emails?: CompanyContactChannel[]
  vat_number?: string | null
  company_registration_number?: string | null
}

export interface TransactionalOptions {
  company: TransactionalCompany
  preheader: string
  subject: string
  bodyHtml: string
  /**
   * Short tagline shown under the brand name in the red header banner.
   * E.g. "Client portal", "Operator dashboard". Leave empty to omit.
   */
  headerSubtitle?: string | null
  /** Optional absolute https URL to a hosted brand logo. */
  logoUrl?: string | null
}

// Brand colours — kept in sync with lib/email/invoice-template.ts so the
// invoice and transactional mail read as one family.
export const BRAND_RED = '#C8202C'
export const TEXT_COLOR = '#111827'
export const MUTED_COLOR = '#6b7280'
export const BORDER_COLOR = '#e5e7eb'
export const SOFT_BG = '#f9fafb'
export const BODY_BG = '#f4f4f5'

// Tiny inline HTML escapers. Same contract as invoice-template.ts — covers
// the four characters that matter for HTML body / attribute contexts.
export function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function emailVisiblePhones(company: TransactionalCompany): CompanyContactChannel[] {
  return company.phones ? filterChannelsByContext(company.phones, 'email') : []
}

function emailVisibleEmails(company: TransactionalCompany): CompanyContactChannel[] {
  return company.emails ? filterChannelsByContext(company.emails, 'email') : []
}

function companyAddressLine(company: TransactionalCompany): string {
  return [company.address_line_1, company.address_line_2, company.town, company.county, company.postcode]
    .filter((p) => p && String(p).trim().length > 0)
    .map((p) => String(p).trim())
    .join(', ')
}

/**
 * Render the full transactional email HTML. The caller passes the inner body
 * markup; this function wraps it in the brand header, body card and footer.
 *
 * Pass plain bodyHtml — the shell does NOT HTML-escape it, because the
 * caller is rendering other safe templates (or trusted strings). If you're
 * splicing untrusted text, escape it with `escapeHtml` first.
 */
export function renderTransactionalEmailHtml(opts: TransactionalOptions): string {
  const { company, preheader, subject, bodyHtml, headerSubtitle, logoUrl } = opts
  const address = companyAddressLine(company) || 'United Kingdom'
  const safeSubtitle = headerSubtitle ? escapeHtml(headerSubtitle) : null

  const visiblePhones = emailVisiblePhones(company)
  const visibleEmails = emailVisibleEmails(company)

  const phoneLines = visiblePhones.length
    ? visiblePhones
        .map(
          (c) =>
            `<div>Tel: <a href="${escapeHtml(telHref(c.value))}" style="color:${MUTED_COLOR};text-decoration:none">${escapeHtml(c.value)}</a>${c.label ? ` <span style="color:#9ca3af;font-size:11px">(${escapeHtml(c.label)})</span>` : ''}</div>`
        )
        .join('')
    : company.phone
      ? `<div>Tel: ${escapeHtml(company.phone)}</div>`
      : ''

  const emailLines = visibleEmails.length
    ? visibleEmails
        .map(
          (c) =>
            `<div><a href="${escapeHtml(mailtoHref(c.value))}" style="color:${MUTED_COLOR};text-decoration:none">${escapeHtml(c.value)}</a>${c.label ? ` <span style="color:#9ca3af;font-size:11px">(${escapeHtml(c.label)})</span>` : ''}</div>`
        )
        .join('')
    : company.email
      ? `<div>${escapeHtml(company.email)}</div>`
      : ''

  const regLine = [
    company.company_registration_number ? `Company Reg No: ${escapeHtml(company.company_registration_number)}` : '',
    company.vat_number ? `VAT Reg No: ${escapeHtml(company.vat_number)}` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ')

  // Logo block — prefer the hosted logo (custom upload OR the public
  // /Logo.png asset) and place it on a white tile so the dark/red hawk
  // emblem reads correctly on the red banner. Falls back to a "SH" tile
  // when no logo is available so the header never looks empty even if
  // images get stripped by the email client.
  const logoBlock = logoUrl
    ? `<div style="width:56px;height:56px;background:#ffffff;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:6px">
        <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.company_name)} logo" style="display:block;max-width:100%;max-height:100%;width:auto;height:auto;-ms-interpolation-mode:bicubic" />
      </div>`
    : `<div style="width:56px;height:56px;background:#ffffff;border-radius:6px;text-align:center;line-height:56px;color:${BRAND_RED};font-weight:700;font-size:16px">SH</div>`

  // Footer logo (optional) — bigger, only shown when we have a hosted
  // image. Inline-block inside a centred parent so it never stretches.
  const footerLogoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.company_name)} logo" width="150" height="103" style="display:block;margin:0 auto 14px;width:150px;max-width:100%;height:auto;-ms-interpolation-mode:bicubic" />`
    : ''

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BODY_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${TEXT_COLOR}">
    <!-- Preheader (hidden inbox preview text) -->
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${BODY_BG}" aria-hidden="true">
      ${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>

    <div style="max-width:600px;margin:0 auto;padding:24px 16px">

      <!-- Brand header -->
      <div style="background:${BRAND_RED};padding:24px;border-radius:8px 8px 0 0">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:middle;width:64px">
              ${logoBlock}
            </td>
            <td style="vertical-align:middle;padding-left:16px">
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px">${escapeHtml(company.company_name)}</div>
              ${
                safeSubtitle
                  ? `<div style="color:rgba(255,255,255,0.85);font-size:12px;font-weight:500;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px">${safeSubtitle}</div>`
                  : ''
              }
            </td>
          </tr>
        </table>
      </div>

      <!-- Body card -->
      <div style="background:#ffffff;padding:32px 28px;border:1px solid ${BORDER_COLOR};border-top:none;border-radius:0 0 8px 8px">
        ${bodyHtml}
      </div>

      <!-- Footer -->
      <div style="text-align:center;font-size:12px;color:${MUTED_COLOR};padding:20px 16px;line-height:1.6">
        ${footerLogoBlock}
        <div><strong>${escapeHtml(company.company_name)}</strong></div>
        <div>${escapeHtml(address)}</div>
        ${phoneLines}
        ${emailLines}
        ${regLine ? `<div style="margin-top:8px">${regLine}</div>` : ''}
        <div style="margin-top:10px;color:#9ca3af">
          You are receiving this email because you have (or are about to have) an account with ${escapeHtml(company.company_name)}.
        </div>
      </div>

    </div>
  </body>
</html>`
}

// -----------------------------------------------------------------------------
// Invite-specific helpers. These render the bits every invite email needs:
// a big centred CTA button + a fallback URL block for clients that strip
// anchor styling. Putting them here keeps both invite templates focused on
// their copy.
// -----------------------------------------------------------------------------

/**
 * Render a centred red CTA button. `url` is HTML-escaped; `label` is too.
 * Outlook-friendly (uses a table-cell + VML-style padding, not flexbox).
 */
export function renderInviteButton(label: string, url: string): string {
  const safeLabel = escapeHtml(label)
  const safeUrl = escapeHtml(url).replace(/"/g, '&quot;')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:8px auto 24px auto;border-collapse:separate">
  <tr>
    <td align="center" bgcolor="${BRAND_RED}" style="background:${BRAND_RED};border-radius:8px;">
      <a href="${safeUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 32px;background:${BRAND_RED};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;letter-spacing:0.01em">${safeLabel}</a>
    </td>
  </tr>
</table>`
}

/**
 * Render the monospace fallback URL block. Shown under the CTA button so
 * readers on Outlook / dark-mode clients that strip buttons still see
 * where to go.
 */
export function renderFallbackUrl(
  url: string,
  label = "If the button doesn't work, paste this link into your browser:"
): string {
  const safeLabel = escapeHtml(label)
  const safeUrl = escapeHtml(url)
  return `<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${MUTED_COLOR};text-align:left">${safeLabel}</p>
<p style="margin:0 0 24px;padding:12px 14px;background:${SOFT_BG};border:1px solid ${BORDER_COLOR};border-radius:6px;word-break:break-all;font-size:12px;line-height:1.5;color:#475569;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;text-align:left">${safeUrl}</p>`
}

/**
 * Render the standard "what you can do next" sign-off + help block used at
 * the bottom of every transactional email. Keeps the close friendly without
 * repeating boilerplate in every template.
 */
export function renderTransactionalSignoff(input: {
  company: TransactionalCompany
  inviterName?: string | null
}): string {
  const { company, inviterName } = input
  const safeCompany = escapeHtml(company.company_name)
  const signedBy = inviterName
    ? `${escapeHtml(inviterName)} on behalf of the team at ${safeCompany}`
    : `the team at ${safeCompany}`

  const contactBits: string[] = []
  for (const c of emailVisiblePhones(company)) {
    contactBits.push(
      `<a href="${escapeHtml(telHref(c.value))}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</a>`
    )
  }
  for (const c of emailVisibleEmails(company)) {
    contactBits.push(
      `<a href="${escapeHtml(mailtoHref(c.value))}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(c.value)}${c.label ? ` (${escapeHtml(c.label)})` : ''}</a>`
    )
  }
  if (contactBits.length === 0) {
    if (company.phone) {
      contactBits.push(
        `<a href="tel:${escapeHtml(company.phone)}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(company.phone)}</a>`
      )
    }
    if (company.email) {
      contactBits.push(
        `<a href="mailto:${escapeHtml(company.email)}" style="color:${BRAND_RED};text-decoration:none;font-weight:500">${escapeHtml(company.email)}</a>`
      )
    }
  }
  const contactLine = contactBits.join(' &nbsp;·&nbsp; ')

  return `
        <!-- Help / contact -->
        <div style="margin:32px 0 0;padding-top:24px;border-top:1px solid ${BORDER_COLOR}">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600">Need help?</p>
          <p style="margin:0;font-size:14px;line-height:1.6">
            If you have any questions, reply to this email${
              contactLine ? ` or get in touch on ${contactLine}` : ''
            } and we'll be happy to help.
          </p>
        </div>

        <p style="margin:24px 0 0;font-size:14px;line-height:1.6">
          Kind regards,<br />
          <strong>${safeCompany}</strong>
        </p>

        <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${BORDER_COLOR};font-size:12px;color:${MUTED_COLOR};line-height:1.5">
          Sent by ${signedBy}. This is a transactional message — please do not reply directly.
        </p>`
}