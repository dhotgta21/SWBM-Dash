// app/blog/layout.tsx
// Shared layout for the advice / blog routes. Wraps every blog
// article (and the blog index) with the same site chrome as the
// landing page so navigation feels consistent.
//
// Why a separate layout:
//   - The marketing footer (components/landing/SiteFooter) needs a
//     DB-fed NAP and category list; the blog is server-rendered
//     from the filesystem and we don't want to duplicate that
//     lookup on every post.
//   - The blog footer (components/blog/BlogFooter) is lighter and
//     surfaces a "Top towns" list to reinforce the local-SEO graph.

import { SiteHeader } from '@/components/landing/SiteHeader'
import { BlogFooter } from '@/components/blog/BlogFooter'
import { loadPublicCompanyChrome } from '@/lib/public-company'
import { filterChannelsByContext } from '@/lib/company'

export default async function BlogLayout({ children }: { children: React.ReactNode }) {
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