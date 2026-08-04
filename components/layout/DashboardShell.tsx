'use client'

import { useState } from 'react'
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { MobileNav } from './MobileNav'
import { InvoiceActionsFAB } from './InvoiceActionsFAB'
import { FirstAdminPrompt } from '@/components/settings/FirstAdminPrompt'
import type { StaffPermissions } from '@/lib/auth/permissions'

interface DashboardShellProps {
  children: ReactNode
  userEmail?: string
  userRole?: string
  /**
   * Effective permission set for the current user. Admins get the
   * fully-true matrix automatically via resolveStaffPermissions.
   * Staff get whatever the admin has saved (or defaults).
   */
  permissions?: StaffPermissions
  /**
   * Show the first-admin recovery prompt. Only true for staff users when
   * the database currently has zero admins.
   */
  showAdminClaimPrompt?: boolean
  /**
   * Number of pending (unprocessed) quote requests to badge the nav item.
   * Only set for admins.
   */
  pendingQuoteCount?: number
  /**
   * Number of deliveries assigned to a driver for 24h+ without being marked
   * delivered. Badged on the Invoices nav item.
   */
  overdueDeliveryCount?: number
  companyName?: string | null
  logoUrl?: string | null
  logoUpdatedAt?: string | null
  webmailUrl?: string | null
}

export function DashboardShell({
  children,
  userEmail,
  userRole,
  permissions,
  showAdminClaimPrompt = false,
  pendingQuoteCount,
  overdueDeliveryCount,
  companyName,
  logoUrl,
  logoUpdatedAt,
  webmailUrl,
}: DashboardShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        userEmail={userEmail}
        userRole={userRole}
        permissions={permissions}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        pendingQuoteCount={pendingQuoteCount}
        overdueDeliveryCount={overdueDeliveryCount}
        companyName={companyName}
        logoUrl={logoUrl}
        logoUpdatedAt={logoUpdatedAt}
        webmailUrl={webmailUrl}
      />
      <MobileNav
        userRole={userRole}
        permissions={permissions}
        pendingQuoteCount={pendingQuoteCount}
        overdueDeliveryCount={overdueDeliveryCount}
        companyName={companyName}
        logoUrl={logoUrl}
        logoUpdatedAt={logoUpdatedAt}
        webmailUrl={webmailUrl}
      />
      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-20' : 'lg:pl-64')}>
        <main className="min-h-screen p-4 pb-28 md:pb-32 lg:pb-28 lg:p-8">
          {showAdminClaimPrompt && <FirstAdminPrompt />}
          {children}
        </main>
      </div>
      <InvoiceActionsFAB role={userRole} permissions={permissions} isAdmin={userRole === 'admin'} />
    </div>
  )
}
