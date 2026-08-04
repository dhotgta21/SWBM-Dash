'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { SignOutButton } from './SignOutButton'
import { DashboardBrand } from './DashboardBrand'
import { Badge } from '@/components/ui/badge'
import { isAdmin, roleLabel } from '@/lib/auth/roles'
import { type StaffPermissions } from '@/lib/auth/permissions'
import { OPERATOR_NAVIGATION, type NavItem } from '@/lib/auth/navigation'



function isVisible(item: NavItem, perms: StaffPermissions | undefined, role: string | undefined): boolean {
  // Admins always see everything (Settings is the only exception —
  // and admins always satisfy it via the layout redirect check, but
  // we render it here too for consistency).
  if (isAdmin(role)) return true
  // No `visible` predicate → defaults to "any operator sees it".
  if (!item.visible) return true
  if (!perms) return false
  return item.visible(perms)
}

interface SidebarProps {
  userEmail?: string
  userRole?: string
  permissions?: StaffPermissions
  collapsed?: boolean
  onToggle?: () => void
  pendingQuoteCount?: number
  overdueDeliveryCount?: number
  companyName?: string | null
  logoUrl?: string | null
  logoUpdatedAt?: string | null
  webmailUrl?: string | null
}

export function Sidebar({
  userEmail,
  userRole,
  permissions,
  collapsed = false,
  onToggle,
  pendingQuoteCount,
  overdueDeliveryCount,
  companyName,
  logoUrl,
  logoUpdatedAt,
  webmailUrl,
}: SidebarProps) {
  const pathname = usePathname()
  const visibleNav = OPERATOR_NAVIGATION.filter((item) => isVisible(item, permissions, userRole))
  const adminBadge = isAdmin(userRole)

  return (
    <div
      className={cn(
        'hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-border lg:bg-card lg:z-40 transition-all duration-200',
        collapsed ? 'lg:w-20' : 'lg:w-64'
      )}
    >
      <div
        className={cn(
          'flex items-center px-4 border-b border-border bg-card',
          collapsed ? 'h-16 justify-center' : 'h-[88px] gap-2'
        )}
      >
        <Link
          href="/invoices?view=due"
          className={cn(
            'flex items-center overflow-hidden',
            collapsed ? 'justify-center w-full' : 'min-w-0 flex-1'
          )}
        >
          <DashboardBrand
            companyName={companyName}
            variant={collapsed ? 'collapsed' : 'horizontal'}
            logoUrl={logoUrl}
            logoUpdatedAt={logoUpdatedAt}
          />
        </Link>
        {!collapsed && onToggle && (
          <button
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {collapsed && onToggle && (
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="absolute top-20 -right-3 p-1 rounded-full bg-card border border-border shadow-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <nav className={cn('flex-1 py-5 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
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
              title={collapsed ? item.name : undefined}
              className={cn(
                'group flex items-center rounded-lg font-medium transition-all',
                collapsed ? 'justify-center px-3 py-3' : 'gap-3 px-3 py-2.5 text-sm',
                isActive
                  ? 'bg-primary-muted text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className={cn(
                'h-5 w-5 shrink-0 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
              )} />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.name}</span>
                  {item.name === 'Quote requests' && pendingQuoteCount ? (
                    <Badge variant="warning" className="ml-auto h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px]">
                      {pendingQuoteCount > 99 ? '99+' : pendingQuoteCount}
                    </Badge>
                  ) : null}
                  {item.name === 'Invoices' && overdueDeliveryCount ? (
                    <Badge variant="warning" className="ml-auto h-5 min-w-5 justify-center rounded-md px-1.5 text-[10px]">
                      {overdueDeliveryCount > 99 ? '99+' : overdueDeliveryCount}
                    </Badge>
                  ) : null}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      <div className={cn('border-t border-border', collapsed ? 'p-2' : 'p-3')}>
        {!collapsed ? (
          <div className="mb-3 px-3 py-2.5 rounded-lg bg-muted">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate min-w-0">{userEmail}</p>
              <span
                className={cn(
                  'inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
                  adminBadge
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-muted-foreground'
                )}
              >
                {adminBadge && <ShieldCheck className="h-3 w-3" />}
                {roleLabel(userRole)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mb-2 flex justify-center" title={roleLabel(userRole)}>
            <span
              className={cn(
                'inline-flex items-center justify-center h-7 w-7 rounded-md',
                adminBadge
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary text-muted-foreground'
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
        <SignOutButton collapsed={collapsed} />
      </div>
    </div>
  )
}
