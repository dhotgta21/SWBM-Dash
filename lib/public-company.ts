// lib/public-company.ts
// Server-only helper that loads company_settings once and returns the
// subset of fields consumed by public-marketing chrome (SiteHeader,
// BlogFooter, contact CTAs). Falls back to safe placeholders when the
// row is empty so the page still renders.
//
// All public layouts (about, contact, delivery, glossary, services,
// sustainability, tools, locations, reviews, trade-account, case-studies,
// guides) used to hardcode phone/email/company name here. After this
// refactor they call `loadPublicCompany()` and the chrome stays in sync
// with whatever the operator has typed into Settings.

import { loadCompany, getChannelForContext, type CompanyContactChannel } from '@/lib/company'
import { getDefaultCompanyName } from '@/lib/demo/brand'

export interface PublicCompanyChrome {
  companyName: string
  phone: string | null
  email: string | null
  phones: CompanyContactChannel[]
  emails: CompanyContactChannel[]
  addressLines: string[]
  hours: string
  year: number
}

// Single source of truth — every public marketing layout calls this.
// Keep `force-dynamic` in the calling page/route so the per-request CSP
// nonce from proxy.ts is honoured (see other route files for the
// rationale).
export async function loadPublicCompanyChrome(): Promise<PublicCompanyChrome> {
  try {
    const company = await loadCompany()
    const headerPhone = getChannelForContext(company.phones, 'header')
    const headerEmail = getChannelForContext(company.emails, 'header')

    return {
      companyName: company.name,
      phone: headerPhone?.value?.trim() || company.phone?.trim() || null,
      email: headerEmail?.value?.trim() || company.email?.trim() || null,
      phones: company.phones,
      emails: company.emails,
      addressLines: company.addressLines,
      hours: company.hours,
      year: new Date().getFullYear(),
    }
  } catch {
    // DB unreachable in dev/build — fall back to the brand defaults so
    // the page still renders rather than 500s.
    return {
      companyName: getDefaultCompanyName(),
      phone: null,
      email: null,
      phones: [],
      emails: [],
      addressLines: [],
      hours: '',
      year: new Date().getFullYear(),
    }
  }
}
