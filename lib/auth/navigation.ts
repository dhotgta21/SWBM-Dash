import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Users,
  FileText,
  Package,
  Settings,
  Quote,
  Mail,
} from 'lucide-react'
import { canSeeSection, type StaffPermissions } from '@/lib/auth/permissions'

// Each entry declares which permission gates its visibility. Items
// with no gates are visible to every signed-in operator (admin +
// staff) — they're the default "every operator sees this" set.
export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  visible?: (perms: StaffPermissions) => boolean
}

// Order matters — sidebar / mobile nav render this list top-to-bottom.
// "Analytics" is the money-and-performance hub and is intentionally
// pinned to position 1 so the operator's first click after sign-in
// lands somewhere useful. "Invoices" — the day-to-day document
// workhorse — sits second.
//
// "Campaigns" used to live here as its own sidebar entry. It now lives
// as the 3rd tab on /admin/products (Catalog | Temporary products |
// Campaigns) because campaigns only ever apply to catalog products, so
// putting them under the same nav keeps the operator in one place when
// working on pricing & promotions.
export const OPERATOR_NAVIGATION: NavItem[] = [
  {
    name: 'Analytics',
    href: '/dashboard',
    icon: BarChart3,
    visible: (p) => canSeeSection(p, 'dashboard'),
  },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Clients', href: '/clients', icon: Users, visible: (p) => canSeeSection(p, 'clients') },
  { name: 'Products', href: '/admin/products', icon: Package, visible: (p) => canSeeSection(p, 'products') },
  // Quote requests are visible to anyone with the see_quote_requests permission.
  {
    name: 'Quote requests',
    href: '/quote-requests',
    icon: Quote,
    visible: (p) => p.see_quote_requests,
  },
  // Emails — quick-access shortcut to the operator's webmail. The
  // destination is configured under Settings → Company → Quick links.
  // No OAuth / IMAP — the sidebar link opens the configured URL in a new tab
  // so the operator stays on the dashboard. Visible to admins (who configure
  // it) and staff who handle quote requests.
  {
    name: 'Emails',
    href: '/emails',
    icon: Mail,
    visible: (p) => p.see_quote_requests,
  },
  // "Recently deleted" used to live here as its own sidebar entry. It now
  // lives as the 4th tab on /invoices (admin-only) so the Invoices section
  // owns the full document lifecycle — active, archived, and trashed.
  // Settings is available to every operator so admin and staff can reach
  // Account (profile / password / 2FA) and Security (action passwords).
  // Company / Brand / Team cards inside Settings stay admin-gated.
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
]
