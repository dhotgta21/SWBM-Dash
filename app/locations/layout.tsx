// app/locations/layout.tsx
// Shared chrome for the location landing pages. Phone/email/company name
// come from company_settings via loadPublicCompanyChrome().

import { SiteHeader } from '@/components/landing/SiteHeader'
import { BlogFooter } from '@/components/blog/BlogFooter'
import { loadPublicCompanyChrome } from '@/lib/public-company'
import { filterChannelsByContext } from '@/lib/company'

export default async function LocationsLayout({ children }: { children: React.ReactNode }) {
  const chrome = await loadPublicCompanyChrome()
  const footerPhones = filterChannelsByContext(chrome.phones, 'footer').map((c) => c.value)
  const footerEmails = filterChannelsByContext(chrome.emails, 'footer').map((c) => c.value)
  return (
    <div className="flex min-h-full flex-col bg-background">
      <SiteHeader phone={chrome.phone} />
      <main className="flex-1 pt-24 lg:pt-28">{children}</main>
      <BlogFooter
        companyName={chrome.companyName}
        year={chrome.year}
        phone={chrome.phone ?? ''}
        email={chrome.email ?? ''}
        phones={footerPhones}
        emails={footerEmails}
      />
    </div>
  )
}