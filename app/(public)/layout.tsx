// app/(public)/layout.tsx
// Minimal layout for unauthenticated public pages (the invoice share view).
// Deliberately has no dashboard chrome, no auth boundary, no nav.

import type { Metadata } from 'next'

// Force dynamic rendering so the proxy-injected CSP nonce can be
// applied to the framework scripts that hydrate the public view
// (e.g. the Download PDF button).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Invoice | Demo Builder Merchant',
  robots: { index: false, follow: false }, // share links should never be indexed
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full flex flex-col">{children}</div>
}
