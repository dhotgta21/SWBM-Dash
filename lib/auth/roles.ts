/**
 * Centralized role / capability helpers for the operator dashboard.
 *
 * One source of truth for "what can the current role see?" — every
 * page, sidebar item, and component that gates UI should import from
 * here, so a future role change (e.g. introducing a `manager` role)
 * only touches one file.
 *
 * Roles
 * -----
 *  - admin   → full access (metrics, money, settings, team)
 *  - staff   → operator-level access; cannot see revenue metrics,
 *              cannot see money per-client, cannot see settings
 *  - client  → end-customer; never reaches the operator layout
 *              (redirected to /portal by app/(dashboard)/layout.tsx)
 */

export type AppRole = 'admin' | 'staff' | 'client' | 'picker' | 'driver'

/**
 * Capability predicates. Each one answers a single, atomic
 * "can role X do Y?" question so callers don't re-implement
 * the same role check inline.
 */

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin'
}

export function isStaff(role: string | null | undefined): boolean {
  return role === 'staff'
}

/**
 * "Operator" = anyone who works inside the dashboard (not the
 * customer portal). Both admin and staff fall in this bucket;
 * use this when you only care about "inside the app" vs.
 * "outside the app".
 */
export function isOperator(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff' || role === 'picker' || role === 'driver'
}

export function isPicker(role: string | null | undefined): boolean {
  return role === 'picker'
}

export function isDriver(role: string | null | undefined): boolean {
  return role === 'driver'
}

/**
 * Money / revenue surfaces (totals, balances, sales KPIs).
 * Admins only. Staff see invoice numbers, dates, statuses —
 * but not the £ values.
 */
export function canSeeMoney(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * The full sales dashboard (KPI cards, charts, "how much we
 * make"). Admins always see it; staff see it only when granted
 * the explicit `see_dashboard` permission.
 */
export function canSeeDashboard(
  role: string | null | undefined,
  permissions?: { see_dashboard?: boolean } | null
): boolean {
  if (isAdmin(role)) return true
  return isStaff(role) && permissions?.see_dashboard === true
}

/**
 * Settings (company details, bank details, team management).
 * Admins only.
 */
export function canSeeSettings(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Login TOTP / authenticator 2FA. Available to dashboard operators who
 * work on the main app (admin + staff). Not for clients, pickers, or drivers.
 */
export function canUseMfa(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'staff'
}

/**
 * Product CRUD (add / edit / delete). Read-only listing is
 * available to staff; mutations are admin-only.
 */
export function canManageProducts(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Soft-locked invoice edits (paid/cancelled docs, etc.) — same
 * rule as the rest of the admin-only surfaces.
 */
export function canEditLockedInvoices(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Delete an invoice / quotation. Admin only — staff can create and
 * edit, but deletion stays admin because it's destructive and
 * audit-sensitive (a stray delete on a paid document would be a
 * nasty paper-trail break).
 */
export function canDeleteInvoices(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * Human-friendly label for the role, used in the sidebar chip
 * and the Team Management card. Capitalises the first letter.
 */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Member'
  if (role === 'admin') return 'Administrator'
  if (role === 'staff') return 'Staff'
  if (role === 'client') return 'Client'
  if (role === 'picker') return 'Picker'
  if (role === 'driver') return 'Driver'
  return role.charAt(0).toUpperCase() + role.slice(1)
}
