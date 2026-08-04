'use server'

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { requireCompanyEditPermission } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'
import type { Json } from '@/lib/database.types'

type SupabaseError = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

function debugLog(message: string, ...args: unknown[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log(message, ...args)
  }
}

function formatDbError(context: string, error: SupabaseError | null | undefined): string {
  if (!error) return 'unknown database error'
  const parts = [context, error.code, error.message, error.details, error.hint].filter(Boolean)
  return parts.join(' | ')
}

function getString(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

function normalizeText(value: string | null): string | null {
  const trimmed = (value || '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function sanitizePrefix(value: string | null): string {
  const cleaned = (value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned || 'DOC'
}

function isValidUkPhone(value: string | null): boolean {
  if (!value) return true
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('44')) {
    return /^44\d{9,10}$/.test(digits)
  }
  return /^0\d{9,10}$/.test(digits)
}

function isValidUkVat(value: string | null): boolean {
  if (!value) return true
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  return /^(GB)?\d{9}$/.test(cleaned)
}

function isValidUkCompanyNumber(value: string | null): boolean {
  if (!value) return true
  const cleaned = value.replace(/\s/g, '').toUpperCase()
  return /^([A-Z]{2}\d{6}|\d{8})$/.test(cleaned)
}

function isColumnMissingError(error: SupabaseError | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist/i.test(error.message || '') ||
    /could not find the '(\w+)' column/i.test(error.message || '')
  )
}

interface ChannelInput {
  id?: string
  value: string
  label: string | null
  is_primary: boolean
  show_header: boolean
  show_homepage: boolean
  show_contact_page: boolean
  show_footer: boolean
  show_invoice: boolean
  show_email: boolean
  show_auth: boolean
  sort_order: number
}

function parseIndexedChannels(formData: FormData, prefix: 'phones' | 'emails'): ChannelInput[] {
  const byIndex = new Map<number, Partial<ChannelInput>>()

  for (const [key] of formData.entries()) {
    const match = key.match(new RegExp(`^${prefix}\\[(\\d+)\\]\\[(\\w+)\\]$`))
    if (!match) continue

    const index = Number(match[1])
    const field = match[2]
    const rawValue = getString(formData, key)

    if (!byIndex.has(index)) byIndex.set(index, {})
    const row = byIndex.get(index)!

    switch (field) {
      case 'id':
        row.id = rawValue || undefined
        break
      case 'value':
        row.value = rawValue
        break
      case 'label':
        row.label = rawValue || null
        break
      case 'is_primary':
        row.is_primary = rawValue === 'true'
        break
      case 'sort_order':
        row.sort_order = Number.parseInt(rawValue || '0', 10)
        break
      case 'show_header':
      case 'show_homepage':
      case 'show_contact_page':
      case 'show_footer':
      case 'show_invoice':
      case 'show_email':
      case 'show_auth':
        row[field] = rawValue === 'true'
        break
    }
  }

  const rows: ChannelInput[] = []
  for (const [index, partial] of byIndex) {
    if (partial.value === undefined || partial.value.trim() === '') continue
    rows.push({
      id: partial.id,
      value: partial.value.trim(),
      label: partial.label ?? null,
      is_primary: partial.is_primary ?? false,
      show_header: partial.show_header ?? false,
      show_homepage: partial.show_homepage ?? false,
      show_contact_page: partial.show_contact_page ?? false,
      show_footer: partial.show_footer ?? false,
      show_invoice: partial.show_invoice ?? false,
      show_email: partial.show_email ?? false,
      show_auth: partial.show_auth ?? false,
      sort_order: partial.sort_order ?? index,
    })
  }

  return rows.sort((a, b) => a.sort_order - b.sort_order)
}

function validateChannels(
  phones: ChannelInput[],
  emails: ChannelInput[],
): { ok: true } | { ok: false; error: string } {
  if (phones.length > 4) return { ok: false, error: 'You can add up to 4 phone numbers.' }
  if (emails.length > 4) return { ok: false, error: 'You can add up to 4 email addresses.' }

  const primaryPhones = phones.filter((p) => p.is_primary)
  const primaryEmails = emails.filter((e) => e.is_primary)

  if (phones.length > 0 && primaryPhones.length === 0) {
    return { ok: false, error: 'Please mark one phone number as primary.' }
  }
  if (emails.length > 0 && primaryEmails.length === 0) {
    return { ok: false, error: 'Please mark one email address as primary.' }
  }
  if (primaryPhones.length > 1) {
    return { ok: false, error: 'Only one phone number can be primary.' }
  }
  if (primaryEmails.length > 1) {
    return { ok: false, error: 'Only one email address can be primary.' }
  }

  for (let i = 0; i < phones.length; i++) {
    if (!isValidUkPhone(phones[i].value)) {
      return { ok: false, error: `Phone #${i + 1} must be a valid UK phone number (e.g. 07496 185 969).` }
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (let i = 0; i < emails.length; i++) {
    if (!emailRegex.test(emails[i].value)) {
      return { ok: false, error: `Email #${i + 1} is not a valid email address.` }
    }
  }

  return { ok: true }
}

export async function updateCompanySettings(formData: FormData) {
  let requestId = 'unknown'
  try {
    requestId = randomUUID()
    const formKeys = Array.from(formData.keys())
    debugLog(`[settings] updateCompanySettings started`, { requestId, formKeys })
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        error:
          'Server is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to Vercel env, then retry.',
      }
    }

    const supabase = await createClient()
    debugLog(`[settings] client created`, { requestId })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    debugLog(`[settings] user resolved`, { requestId })

    if (!user) {
      return { error: 'Not authenticated' }
    }

    const canEditCompany = await requireCompanyEditPermission(supabase, user.id)
    debugLog(`[settings] permissions resolved`, { requestId })

    if (!canEditCompany) {
      return { error: 'Not authorized' }
    }

    const companyName = getString(formData, 'company_name').trim()
    if (!companyName) {
      return { error: 'Company name is required' }
    }

    const phones = parseIndexedChannels(formData, 'phones')
    const emails = parseIndexedChannels(formData, 'emails')

    const channelValidation = validateChannels(phones, emails)
    if (!channelValidation.ok) {
      return { error: channelValidation.error }
    }

    // The settings row is a singleton — always id 1; never trust the form's
    // id field (a tampered form must not be able to write a second row).
    const settingsId = 1

    const primaryPhone = phones.find((p) => p.is_primary)?.value ?? phones[0]?.value ?? null
    const primaryEmail = emails.find((e) => e.is_primary)?.value ?? emails[0]?.value ?? null

    const settingsData: Record<string, unknown> = {
      id: settingsId,
      company_name: companyName,
      address_line_1: normalizeText(getString(formData, 'address_line_1')),
      address_line_2: normalizeText(getString(formData, 'address_line_2')),
      town: normalizeText(getString(formData, 'town')),
      county: normalizeText(getString(formData, 'county')),
      postcode: normalizeText(getString(formData, 'postcode'))?.toUpperCase() ?? null,
      // Keep legacy columns synced with the primary channel.
      phone: primaryPhone,
      email: primaryEmail?.toLowerCase() ?? null,
      vat_number: normalizeText(getString(formData, 'vat_number')),
      company_registration_number: normalizeText(getString(formData, 'company_registration_number')),
      invoice_prefix: sanitizePrefix(getString(formData, 'invoice_prefix')),
      quotation_prefix: sanitizePrefix(getString(formData, 'quotation_prefix')),
      email_from_name: normalizeText(getString(formData, 'email_from_name')),
      email_reply_to: normalizeText(getString(formData, 'email_reply_to'))?.toLowerCase() ?? null,
      webmail_url: normalizeText(getString(formData, 'webmail_url')),
      enable_stock_routing: getString(formData, 'enable_stock_routing') === 'true',
      updated_by: user.id,
    }

    // Default VAT rate for new invoices/quotes (0–100%). Optional field so
    // older forms without the input still save successfully.
    if (formData.has('default_vat_rate')) {
      const rawVat = getString(formData, 'default_vat_rate').trim()
      const parsedVat = rawVat === '' ? 20 : Number(rawVat)
      if (!Number.isFinite(parsedVat) || parsedVat < 0 || parsedVat > 100) {
        return { error: 'Default VAT rate must be a number between 0 and 100.' }
      }
      // Store to 2 decimal places (matches numeric(5,2)).
      settingsData.default_vat_rate = Math.round(parsedVat * 100) / 100
    }

    // Auto-delivery threshold in whole hours (0 disables the sweep). Optional
    // field so older forms without the input still save successfully.
    if (formData.has('auto_deliver_after_hours')) {
      const rawHours = getString(formData, 'auto_deliver_after_hours').trim()
      const parsedHours = rawHours === '' ? 24 : Number(rawHours)
      if (!Number.isInteger(parsedHours) || parsedHours < 0 || parsedHours > 720) {
        return { error: 'Auto-deliver hours must be a whole number between 0 and 720.' }
      }
      settingsData.auto_deliver_after_hours = parsedHours
    }

    // Max loads per order (default 5). Caps how many loads one order can be
    // split into; enforced for both the picker app and office load tools.
    if (formData.has('max_loads_per_order')) {
      const rawMax = getString(formData, 'max_loads_per_order').trim()
      const parsedMax = rawMax === '' ? 5 : Number(rawMax)
      if (!Number.isInteger(parsedMax) || parsedMax < 1 || parsedMax > 50) {
        return { error: 'Max loads per order must be a whole number between 1 and 50.' }
      }
      settingsData.max_loads_per_order = parsedMax
    }

    // Social links are edited in a disabled fieldset for non-editors. Only
    // touch seo_same_as when the form actually sends it.
    if (formData.has('seo_same_as')) {
      settingsData.seo_same_as = normalizeText(getString(formData, 'seo_same_as'))
    }

    // About-page narrative fields are now edited on the "About page" tab
    // via updateAboutPageBasics. Only touch them here when the form actually
    // sends them, so the General tab never wipes them out.
    if (formData.has('founded_year')) {
      const raw = normalizeText(getString(formData, 'founded_year'))
      const n = raw ? Number.parseInt(raw, 10) : NaN
      settingsData.founded_year = Number.isFinite(n) ? n : null
    }
    if (formData.has('fleet_size')) {
      const raw = normalizeText(getString(formData, 'fleet_size'))
      const n = raw ? Number.parseInt(raw, 10) : NaN
      settingsData.fleet_size = Number.isFinite(n) ? n : null
    }
    if (formData.has('yard_description')) {
      settingsData.yard_description = normalizeText(getString(formData, 'yard_description'))
    }
    if (formData.has('opening_hours_text')) {
      settingsData.opening_hours_text = normalizeText(getString(formData, 'opening_hours_text'))
    }

    if (settingsData.email_reply_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settingsData.email_reply_to as string)) {
      return { error: 'Email reply-to is not a valid email address.' }
    }
    if (settingsData.webmail_url) {
      const webmailUrl = settingsData.webmail_url as string
      const isHttps = /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(webmailUrl)
      // http://localhost is allowed for local development only.
      const isLocalDev = /^http:\/\/localhost([:/][^\s]*)?$/i.test(webmailUrl)
      if (!isHttps && !isLocalDev) {
        return {
          error: 'Webmail URL must start with https:// (e.g. https://outlook.office365.com or https://mail.google.com).',
        }
      }
    }
    const bankData = {
      id: 1,
      bank_name: normalizeText(getString(formData, 'bank_name')),
      bank_account_name: normalizeText(getString(formData, 'bank_account_name')),
      sort_code: normalizeText(getString(formData, 'sort_code')),
      account_number: normalizeText(getString(formData, 'account_number')),
      updated_by: user.id,
    }

    if (bankData.sort_code && !/^\d{2}-?\d{2}-?\d{2}$/.test(bankData.sort_code)) {
      return { error: 'Sort code must be 6 digits (e.g. 12-34-56).' }
    }
    if (bankData.account_number && !/^\d{8}$/.test(bankData.account_number)) {
      return { error: 'Account number must be 8 digits.' }
    }

    if (settingsData.vat_number && !isValidUkVat(settingsData.vat_number as string)) {
      return { error: 'VAT number must be a valid UK VAT number (9 digits, optional GB prefix).' }
    }
    if (settingsData.company_registration_number && !isValidUkCompanyNumber(settingsData.company_registration_number as string)) {
      return { error: 'Company registration number must be a valid UK company number (8 digits or 2 letters + 6 digits).' }
    }

    debugLog(`[settings] saving settings`, { requestId, settingsId })

    let { error: settingsError } = await supabase
      .from('company_settings')
      .upsert(settingsData, { onConflict: 'id' })

    // If a SEO column from migration 042/044 hasn't been applied yet, retry
    // the upsert without the missing field so the rest of the settings save
    // still works. Each missing column triggers one retry with that field
    // stripped — guards against partial migrations across environments.
    if (settingsError && isColumnMissingError(settingsError)) {
      const missingMatch =
        (settingsError.message || '').match(/column [^.]+\.(\w+)/i) ||
        (settingsError.message || '').match(/could not find the '(\w+)' column/i)
      const missingColumn = missingMatch?.[1]
      if (missingColumn && missingColumn in settingsData) {
        console.warn(
          `[settings] ${missingColumn} column missing, retrying without it`,
          { requestId, settingsError },
        )
        delete settingsData[missingColumn as keyof typeof settingsData]
        const retry = await supabase.from('company_settings').upsert(settingsData, { onConflict: 'id' })
        settingsError = retry.error
      }
    }

    if (settingsError) {
      console.error(`[settings] company_settings upsert failed`, { requestId, settingsError })
      const safe = safeActionError('settings.updateCompanySettings', settingsError, 'Could not save company settings.')
      return {
        error: `${safe} (${formatDbError('company_settings', settingsError)})`,
      }
    }

    debugLog(`[settings] settings saved`, { requestId })

    // Replace phone/email channels atomically via a SECURITY DEFINER RPC.
    // The previous delete-then-insert pattern left a window where a failure
    // between the two calls could wipe all contact channels; this function
    // runs the whole replacement in a single transaction.
    const { error: channelsError } = await supabase.rpc('replace_company_contact_channels', {
      p_settings_id: settingsId,
      p_phones: phones.map((p) => ({ ...p, value: p.value })) as unknown as Json,
      p_emails: emails.map((e) => ({ ...e, value: e.value.toLowerCase() })) as unknown as Json,
    })

    if (channelsError) {
      console.error(`[settings] company contact channels replacement failed`, { requestId, channelsError })
      const safe = safeActionError('settings.updateCompanySettings.channels', channelsError, 'Could not save phone numbers or email addresses.')
      return { error: `${safe} (${formatDbError('company_phones', channelsError)})` }
    }

    const { error: bankError } = await supabase
      .from('company_bank_details')
      .upsert(bankData, { onConflict: 'id' })

    if (bankError) {
      console.error(`[settings] company_bank_details upsert failed`, { requestId, bankError })
      const safe = safeActionError('settings.updateCompanySettings.bank', bankError, 'Could not save bank details.')
      return {
        error: `${safe} (${formatDbError('company_bank_details', bankError)})`,
      }
    }

    debugLog(`[settings] bank details saved`, { requestId })

    debugLog(`[settings] updateCompanySettings completed`, { requestId })
    return { success: true }
  } catch (err) {
    console.error(`[settings] updateCompanySettings unexpected error`, { requestId, err })
    console.error('saveCompanySettings error:', err)
    const detail = err instanceof Error ? err.message : ''
    const requestHint = requestId && requestId !== 'unknown' ? ` (request ${requestId})` : ''
    if (process.env.NODE_ENV === 'development') {
      return {
        error: `Something went wrong while saving settings.${requestHint} ${detail}`.trim(),
      }
    }
    return {
      error: `Something went wrong while saving settings.${requestHint} Please try again.`,
    }
  }
}

export async function updateUserDetails(formData: FormData) {
  let requestId = 'unknown'
  try {
    requestId = randomUUID()
    const formKeys = Array.from(formData.keys())
    debugLog(`[settings] updateUserDetails started`, { requestId, formKeys })
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return {
        error:
          'Server is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Add them to Vercel env, then retry.',
      }
    }

    const supabase = await createClient()
    debugLog(`[settings] client created`, { requestId })

    const {
      data: { user },
    } = await supabase.auth.getUser()
    debugLog(`[settings] user resolved`, { requestId })

    if (!user) {
      return { error: 'Not authenticated' }
    }

    const newEmail = getString(formData, 'user_email').trim().toLowerCase()
    const emailChanged = newEmail && newEmail !== user.email?.toLowerCase()

    if (emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return { error: 'Email is not a valid email address.' }
    }

    // Auth is the source of truth for email addresses. Update it first, then
    // mirror the change into the profiles cache. Supabase will send a
    // confirmation link when "Confirm email changes" is enabled; the profile
    // row is updated immediately so the UI reflects the requested address.
    if (emailChanged) {
      const { error: authEmailError } = await supabase.auth.updateUser({ email: newEmail })
      if (authEmailError) {
        console.error(`[settings] auth email update failed`, { requestId, authEmailError })
        const safe = safeActionError('settings.updateUserDetails.email', authEmailError, 'Could not update email address.')
        return { error: safe }
      }
      debugLog(`[settings] auth email update requested`, { requestId, newEmail })
    }

    const profileUpdate: Record<string, string | null> = {
      full_name: normalizeText(getString(formData, 'full_name')),
      phone: normalizeText(getString(formData, 'phone_user')),
      employee_number: normalizeText(getString(formData, 'employee_number')),
      date_of_birth: normalizeText(getString(formData, 'date_of_birth')),
      id_security_number: normalizeText(getString(formData, 'id_security_number')),
      job_title: normalizeText(getString(formData, 'job_title')),
      department: normalizeText(getString(formData, 'department')),
    }

    if (emailChanged) {
      profileUpdate.email = newEmail
    }

    if (profileUpdate.phone && !isValidUkPhone(profileUpdate.phone as string)) {
      return { error: 'Phone must be a valid UK phone number (e.g. 07496 185 969).' }
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id)

    if (profileError) {
      console.error(`[settings] profiles update failed`, { requestId, profileError })
      const safe = safeActionError('settings.updateUserDetails.profile', profileError, 'Could not save user profile.')
      return {
        error: safe,
      }
    }

    debugLog(`[settings] profile saved`, { requestId })
    debugLog(`[settings] updateUserDetails completed`, { requestId })
    return { success: true }
  } catch (err) {
    console.error(`[settings] updateUserDetails unexpected error`, { requestId, err })
    console.error('saveUserDetails error:', err)
    return {
      error: 'Something went wrong while saving user details. Please try again.',
    }
  }
}
