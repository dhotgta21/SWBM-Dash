// lib/company.ts
// Shared loader for company_settings (single row, id = 1). Used by public
// pages that need the trading name, address, phone, email, opening hours
// and yard details so they stay in sync with the dashboard.

import { createAdminClient } from '@/lib/supabase/admin'
import { getDefaultCompanyName } from '@/lib/demo/brand'

// Shape of the company_settings columns we read on every render. Keep
// this in sync with the migration that added them.
export interface OpeningHourEntry {
  /** Lowercase day name: monday, tuesday, … sunday. */
  day: string
  /** 24h "HH:MM" open time. Empty when closed. */
  open: string
  /** 24h "HH:MM" close time. Empty when closed. */
  close: string
  /** Closed flag. When true the entry still renders in JSON-LD as closed. */
  closed: boolean
}

export interface YardSection {
  /** Display name, e.g. "Bricks & tiles". */
  name: string
  /** Lucide icon name (e.g. "ToyBrick", "Trees"). Rendered by the YardSection component. */
  icon: string
  /** One-line description shown on the section card. */
  blurb: string
}

export type ContactContext =
  | 'header'
  | 'homepage'
  | 'contactPage'
  | 'footer'
  | 'invoice'
  | 'email'
  | 'auth'

export interface CompanyContactChannel {
  id: string
  value: string
  label: string | null
  isPrimary: boolean
  contexts: Record<ContactContext, boolean>
  sortOrder: number
}

export interface CompanyInfo {
  name: string
  addressLines: string[]
  address: {
    streetAddress: string
    addressLocality: string
    addressRegion: string
    postalCode: string
  }
  /** @deprecated Use `phones` array with context filters instead. Kept for backwards compatibility. */
  phone: string | null
  /** @deprecated Use `emails` array with context filters instead. Kept for backwards compatibility. */
  email: string | null
  phones: CompanyContactChannel[]
  emails: CompanyContactChannel[]
  /** Human-readable opening hours, e.g. "Mon–Fri 7am–5pm · Sat 8am–12pm". */
  hours: string
  /** Structured opening hours used by LocalBusiness JSON-LD. */
  openingHours: OpeningHourEntry[]
  /** Year the business was founded (e.g. 2017). Null when unset. */
  foundedYear: number | null
  /** Number of delivery lorries in the fleet. Null when unset. */
  fleetSize: number | null
  /** Free-text yard description used on the About page. */
  yardDescription: string | null
  /** Curated list of yard section cards rendered on the About page. */
  yardSections: YardSection[]
}

// Sensible defaults used when the DB row is missing or fields are unset.
const FALLBACK_OPENING_HOURS: OpeningHourEntry[] = [
  { day: 'monday', open: '07:00', close: '17:00', closed: false },
  { day: 'tuesday', open: '07:00', close: '17:00', closed: false },
  { day: 'wednesday', open: '07:00', close: '17:00', closed: false },
  { day: 'thursday', open: '07:00', close: '17:00', closed: false },
  { day: 'friday', open: '07:00', close: '17:00', closed: false },
  { day: 'saturday', open: '08:00', close: '12:00', closed: false },
  { day: 'sunday', open: '', close: '', closed: true },
]

const FALLBACK_OPENING_HOURS_TEXT =
  'Mon–Fri 7:00am – 5:00pm · Sat 8:00am – 12:00pm'

const FALLBACK_FOUNDED_YEAR = 2017

function toContextFlags(row: Record<string, unknown>): Record<ContactContext, boolean> {
  return {
    header: Boolean(row.show_header),
    homepage: Boolean(row.show_homepage),
    contactPage: Boolean(row.show_contact_page),
    footer: Boolean(row.show_footer),
    invoice: Boolean(row.show_invoice),
    email: Boolean(row.show_email),
    auth: Boolean(row.show_auth),
  }
}

export function mapChannel(row: Record<string, unknown>): CompanyContactChannel {
  return {
    id: String(row.id ?? ''),
    value: String(row.value ?? '').trim(),
    label: row.label ? String(row.label).trim() : null,
    isPrimary: Boolean(row.is_primary),
    contexts: toContextFlags(row),
    sortOrder: Number(row.sort_order ?? 0),
  }
}

/** Return channels filtered to a given surface, sorted by sort_order then primary. */
export function filterChannelsByContext(
  channels: CompanyContactChannel[],
  context: ContactContext,
): CompanyContactChannel[] {
  return channels
    .filter((c) => c.contexts[context])
    .sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1
      if (!a.isPrimary && b.isPrimary) return 1
      return a.sortOrder - b.sortOrder
    })
}

/** First channel for a surface, or the primary, or any non-empty value. */
export function getChannelForContext(
  channels: CompanyContactChannel[],
  context: ContactContext,
): CompanyContactChannel | undefined {
  const visible = filterChannelsByContext(channels, context)
  if (visible.length > 0) return visible[0]
  const primary = channels.find((c) => c.isPrimary)
  if (primary) return primary
  return channels.find((c) => c.value.length > 0)
}

/** Backwards-compatible single value: primary first, then first visible, then first. */
export function getPrimaryChannelValue(channels: CompanyContactChannel[]): string | null {
  const primary = channels.find((c) => c.isPrimary && c.value.length > 0)
  if (primary) return primary.value
  const first = channels.find((c) => c.value.length > 0)
  return first?.value ?? null
}

/** Strip spaces from a phone number for `tel:` links. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\s+/g, '')
  return `tel:${digits}`
}

/** Build a `mailto:` href with optional subject. */
export function mailtoHref(email: string, subject?: string): string {
  if (!subject) return `mailto:${email}`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

export async function loadCompany(): Promise<CompanyInfo> {
  let settingsRow: Record<string, unknown> | null = null
  let phonesRows: Record<string, unknown>[] = []
  let emailsRows: Record<string, unknown>[] = []

  try {
    const admin = createAdminClient()
    const [settingsResult, phonesResult, emailsResult] = await Promise.all([
      admin
        .from('company_settings')
        .select(
          'company_name, address_line_1, address_line_2, town, county, postcode, phone, email, opening_hours_text, opening_hours, founded_year, fleet_size, yard_description, yard_sections',
        )
        .eq('id', 1)
        .maybeSingle(),
      admin.from('company_phones').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
      admin.from('company_emails').select('*').eq('settings_id', 1).order('sort_order', { ascending: true }),
    ])

    settingsRow = settingsResult.data ?? null
    phonesRows = Array.isArray(phonesResult.data) ? phonesResult.data : []
    emailsRows = Array.isArray(emailsResult.data) ? emailsResult.data : []
  } catch (err) {
    // Dev/build environments may lack admin credentials. Fall back to
    // safe defaults so public pages still render.
    console.warn('[company] Could not load company_settings, using fallback company info:', err)
  }

  const fallback = getDefaultCompanyName()
  const company = (settingsRow ?? null) as {
    company_name?: string | null
    address_line_1?: string | null
    address_line_2?: string | null
    town?: string | null
    county?: string | null
    postcode?: string | null
    phone?: string | null
    email?: string | null
    opening_hours_text?: string | null
    opening_hours?: OpeningHourEntry[] | null
    founded_year?: number | null
    fleet_size?: number | null
    yard_description?: string | null
    yard_sections?: YardSection[] | null
  } | null

  const name = company?.company_name?.trim() || fallback

  const addressLines: string[] = []
  if (company?.address_line_1) addressLines.push(company.address_line_1)
  if (company?.address_line_2) addressLines.push(company.address_line_2)
  const cityLine = [company?.town, company?.county].filter(Boolean).join(', ')
  if (cityLine) addressLines.push(cityLine)
  if (company?.postcode) addressLines.push(company.postcode)
  if (addressLines.length === 0) addressLines.push('Address on file. Contact us for details.')

  const streetAddress = [company?.address_line_1, company?.address_line_2]
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .join(', ')

  const phones = phonesRows.map(mapChannel)
  const emails = emailsRows.map(mapChannel)

  // If the child tables are empty (fresh install or pre-migration), surface
  // the legacy single columns as a primary channel so nothing disappears.
  if (phones.length === 0 && company?.phone?.trim()) {
    phones.push({
      id: 'legacy-phone',
      value: company.phone.trim(),
      label: 'Main',
      isPrimary: true,
      contexts: {
        header: true,
        homepage: true,
        contactPage: true,
        footer: true,
        invoice: true,
        email: true,
        auth: true,
      },
      sortOrder: 0,
    })
  }
  if (emails.length === 0 && company?.email?.trim()) {
    emails.push({
      id: 'legacy-email',
      value: company.email.trim().toLowerCase(),
      label: 'Main',
      isPrimary: true,
      contexts: {
        header: true,
        homepage: true,
        contactPage: true,
        footer: true,
        invoice: true,
        email: true,
        auth: true,
      },
      sortOrder: 0,
    })
  }

  return {
    name,
    addressLines,
    address: {
      streetAddress: streetAddress || 'Address on file',
      addressLocality: company?.town?.trim() || 'Slough',
      addressRegion: company?.county?.trim() || 'Berkshire',
      postalCode: company?.postcode?.trim() || '',
    },
    phone: getPrimaryChannelValue(phones) ?? company?.phone?.trim() ?? null,
    email: getPrimaryChannelValue(emails) ?? company?.email?.trim()?.toLowerCase() ?? null,
    phones,
    emails,
    hours: company?.opening_hours_text?.trim() || FALLBACK_OPENING_HOURS_TEXT,
    openingHours: Array.isArray(company?.opening_hours) && company!.opening_hours!.length > 0
      ? company!.opening_hours!
      : FALLBACK_OPENING_HOURS,
    foundedYear: company?.founded_year ?? FALLBACK_FOUNDED_YEAR,
    fleetSize: company?.fleet_size ?? null,
    yardDescription: company?.yard_description?.trim() || null,
    yardSections: Array.isArray(company?.yard_sections) ? company!.yard_sections! : [],
  }
}
