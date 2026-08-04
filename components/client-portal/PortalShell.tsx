'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { ProfileMenu } from './ProfileMenu'

interface PortalShellProps {
  children: ReactNode
  companyName: string
  userEmail: string
  userFullName: string | null
}

/**
 * The chrome of the client portal.
 *
 * Top header (sticky):
 *   [company logo + name]                              [profile ▾]
 *
 * That's it — no sidebar, no nav section, no top-right tab links.
 * The user described the layout they want and it's deliberately
 * minimal: "we do not want a side ba in thee ... we simply want a
 * pofile fom which they can view the details on file and log out".
 *
 * The ProfileMenu is the only navigation surface — clicking it opens
 * a small dropdown with Profile (→ /portal/profile) and Sign out.
 */
export function PortalShell({ children, companyName, userEmail, userFullName }: PortalShellProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/portal"
            aria-label={`${companyName}: go to portal home`}
            className="min-w-0"
          >
            <BrandLogo variant="horizontal" />
          </Link>
          <ProfileMenu userEmail={userEmail} userFullName={userFullName} />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          {companyName}
        </div>
      </footer>
    </div>
  )
}
