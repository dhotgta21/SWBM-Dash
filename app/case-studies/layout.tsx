// app/case-studies/layout.tsx
// Shared layout for the case-study routes. Wraps every case-study
// page (and the case-study index) with the same site chrome as the
// landing page so navigation feels consistent. Phone/email/company
// name come from company_settings via loadPublicCompanyChrome().

import { SiteHeader } from '@/components/landing/SiteHeader'
import { BlogFooter } from '@/components/blog/BlogFooter'
import { loadPublicCompanyChrome } from '@/lib/public-company'
import { filterChannelsByContext } from '@/lib/company'

export default async function CaseStudiesLayout({ children }: { children: React.ReactNode }) {
  const chrome = await loadPublicCompanyChrome()
  const footerPhones = filterChannelsByContext(chrome.phones, 'footer').map((c) => c.value)
  const footerEmails = filterChannelsByContext(chrome.emails, 'footer').map((c) => c.value)
  return (
    <div className="flex min-h-full flex-col bg-background">
      <SiteHeader phone={chrome.phone} />
      {/* No top padding: BlogHero is full-bleed and the floating SiteHeader
          overlays it (fixed positioning), so the hero image can extend up
          under the nav and reach the very top of the viewport. */}
      <main className="flex-1">{children}</main>
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