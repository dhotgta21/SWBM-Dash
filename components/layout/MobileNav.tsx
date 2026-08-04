'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Menu, X } from 'lucide-react'
import { SignOutButton } from './SignOutButton'
import { DashboardBrand } from './DashboardBrand'
import { Badge } from '@/components/ui/badge'
import { isAdmin } from '@/lib/auth/roles'
import { type StaffPermissions } from '@/lib/auth/permissions'
import { OPERATOR_NAVIGATION, type NavItem } from '@/lib/auth/navigation'



function isVisible(item: NavItem, perms: StaffPermissions | undefined, role: string | undefined): boolean {
  if (isAdmin(role)) return true
  if (!item.visible) return true
  if (!perms) return false
  return item.visible(perms)
}

interface MobileNavProps {
  userRole?: string
  permissions?: StaffPermissions
  pendingQuoteCount?: number
  overdueDeliveryCount?: number
  companyName?: string | null
  logoUrl?: string | null
  logoUpdatedAt?: string | null
  webmailUrl?: string | null
}

export function MobileNav({ userRole, permissions, pendingQuoteCount, overdueDeliveryCount, companyName, logoUrl, logoUpdatedAt, webmailUrl }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const visibleNav = OPERATOR_NAVIGATION.filter((item) => isVisible(item, permissions, userRole))

  return (
    <div className="lg:hidden">
      <div className="flex items-center justify-between h-16 px-4 bg-card border-b border-border">
        <Link href="/invoices?view=due" className="flex items-center min-w-0">
          <DashboardBrand companyName={companyName} variant="mobile" logoUrl={logoUrl} logoUpdatedAt={logoUpdatedAt} />
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg text-muted-foreground hover:bg-secondary"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="absolute top-16 left-0 right-0 bg-card border-b border-border shadow-lg z-50">
          <nav className="px-4 py-4 space-y-1">
            {visibleNav.map((item) => {
              const Icon = item.icon
              const isExternalEmail = item.name === 'Emails' && !!webmailUrl
              const href = isExternalEmail ? webmailUrl! : item.href
              const isActive = !isExternalEmail && (pathname === item.href || pathname.startsWith(`${item.href}/`))
              return (
                <Link
                  key={item.name}
                  href={href}
                  target={isExternalEmail ? '_blank' : undefined}
                  rel={isExternalEmail ? 'noopener noreferrer' : undefined}
                  onClick={() => !isExternalEmail && setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-muted text-primary'
                      : 'text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1">{item.name}</span>
                  {item.name === 'Quote requests' && pendingQuoteCount ? (
                    <Badge variant="warning" className="h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px]">
                      {pendingQuoteCount > 99 ? '99+' : pendingQuoteCount}
                    </Badge>
                  ) : null}
                  {item.name === 'Invoices' && overdueDeliveryCount ? (
                    <Badge variant="warning" className="h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px]">
                      {overdueDeliveryCount > 99 ? '99+' : overdueDeliveryCount}
                    </Badge>
                  ) : null}
                </Link>
              )
            })}
            <SignOutButton className="pt-2 border-t border-border" />
          </nav>
        </div>
      )}
    </div>
  )
}
