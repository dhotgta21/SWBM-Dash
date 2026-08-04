/**
 * Per-staff capability flags.
 *
 * One source of truth for "can the current user do X?" across the
 * UI, server actions, and API routes. Each flag is a single boolean
 * — admin flips them in Settings, code reads them via the `can()`
 * helper below.
 *
 * Storage: JSONB on `profiles.permissions`. NULL means "use the
 * code-level defaults" (STAFF_DEFAULT_PERMISSIONS). Admins always
 * get full access regardless of this column — it's staff-only.
 *
 * Adding a new capability?
 *   1. Add the boolean to StaffPermissions.
 *   2. Set a default in STAFF_DEFAULT_PERMISSIONS.
 *   3. Use it via the matching `can*` helper below.
 *   4. Surface it in components/settings/PermissionEditor.tsx so
 *      admins can toggle it.
 */

import type { Json } from '@/lib/database.types'

export interface StaffPermissions {
  // Section visibility (sidebar / nav)
  see_dashboard: boolean
  see_clients: boolean
  see_products: boolean
  see_invoices: boolean

  // Client capabilities
  clients_add: boolean
  clients_edit: boolean
  clients_delete: boolean
  clients_see_money: boolean
  clients_send_portal_invite: boolean
  clients_revoke_portal_invite: boolean
  clients_manage_account: boolean

  // Product capabilities
  products_add: boolean
  products_edit: boolean
  products_delete: boolean
  products_see_prices: boolean

  // Invoice capabilities
  invoices_add: boolean
  invoices_edit: boolean
  invoices_delete: boolean
  invoices_see_money: boolean
  invoices_send_email: boolean
  invoices_record_payment: boolean
  invoices_change_status: boolean
  invoices_convert_quote: boolean
  invoices_manage_sharing: boolean
  invoices_delete_payment: boolean

  // Quote request capabilities
  see_quote_requests: boolean
  quote_requests_review: boolean
  quote_requests_convert: boolean

  // Settings capabilities
  settings_edit_company: boolean
  settings_manage_team: boolean
}

/**
 * Defaults applied to a staff user whose `permissions` column is
 * NULL (brand new staff, or before any admin tweak).
 *
 * INTENTIONALLY MINIMAL: staff start with view-only access to the
 * three core operator sections (invoices, clients, products) so
 * they can navigate and look up records. Every action (add, edit,
 * delete, see money, send email, record payment, change status) is
 * OFF until the admin explicitly enables it in Settings → Staff
 * Permissions.
 *
 * The admin is the source of truth for what each staff can do —
 * the code does not pre-bake opinions like "staff can delete" or
 * "staff can add products". Add the capability, save, the next
 * page load picks it up.
 */
export const STAFF_DEFAULT_PERMISSIONS: StaffPermissions = {
  // Sections — view-only access defaults. Admin can enable each one.
  see_dashboard: false,
  see_clients: true,
  see_products: true,
  see_invoices: true,

  // Clients — all actions off until admin enables.
  clients_add: false,
  clients_edit: false,
  clients_delete: false,
  clients_see_money: false,
  clients_send_portal_invite: false,
  clients_revoke_portal_invite: false,
  clients_manage_account: false,

  // Products — all actions off until admin enables.
  products_add: false,
  products_edit: false,
  products_delete: false,
  products_see_prices: false,

  // Invoices — all actions off until admin enables.
  invoices_add: false,
  invoices_edit: false,
  invoices_delete: false,
  invoices_see_money: false,
  invoices_send_email: false,
  invoices_record_payment: false,
  invoices_change_status: false,
  invoices_convert_quote: false,
  invoices_manage_sharing: false,
  invoices_delete_payment: false,

  // Quote requests — all actions off until admin enables.
  see_quote_requests: false,
  quote_requests_review: false,
  quote_requests_convert: false,

  // Settings — all actions off until admin enables.
  settings_edit_company: false,
  settings_manage_team: false,
}

/**
 * Returns the full permission set for a user. If the JSON column is
 * missing or malformed, fall back to defaults — never trust the DB
 * to be well-formed.
 *
 * For admins, this always returns ALL-true regardless of what's
 * stored (admins have full access by definition; the column is for
 * staff only).
 */
export function resolveStaffPermissions(
  role: string | null | undefined,
  raw: Json | null | undefined
): StaffPermissions {
  if (role === 'admin') {
    // Return a fully-enabled object — UI helpers check `isAdmin`
    // first and skip the permission matrix, but constructing it here
    // keeps the function total / type-safe.
    const allTrue = {} as Record<keyof StaffPermissions, boolean>
    for (const key of Object.keys(STAFF_DEFAULT_PERMISSIONS) as Array<keyof StaffPermissions>) {
      allTrue[key] = true
    }
    return allTrue
  }

  // Pickers and drivers never use the staff permission matrix. They only
  // access their own mobile shells (/picker, /driver). Returning all-false
  // keeps any accidental call to canSeeSection / canSeeMoney closed.
  if (role === 'picker' || role === 'driver' || role === 'client') {
    const allFalse = {} as Record<keyof StaffPermissions, boolean>
    for (const key of Object.keys(STAFF_DEFAULT_PERMISSIONS) as Array<keyof StaffPermissions>) {
      allFalse[key] = false
    }
    return allFalse
  }

  const base: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base
  }
  const obj = raw as Record<string, unknown>

  // Top-level booleans (sections + flat flags)
  for (const key of Object.keys(base) as Array<keyof StaffPermissions>) {
    const value = obj[key as string]
    if (typeof value === 'boolean') {
      base[key] = value
    }
  }
  return base
}

/**
 * Convenience: can this user see the X section in the sidebar?
 */
export function canSeeSection(
  perms: StaffPermissions,
  section: 'dashboard' | 'clients' | 'products' | 'invoices'
): boolean {
  switch (section) {
    case 'dashboard':
      return perms.see_dashboard
    case 'clients':
      return perms.see_clients
    case 'products':
      return perms.see_products
    case 'invoices':
      return perms.see_invoices
  }
}

/**
 * Money visibility helpers. Each surface asks for its own flag so admins
 * can grant per-client totals without granting global invoice £ values,
 * or vice versa.
 */

export function canSeeInvoiceMoney(perms: StaffPermissions): boolean {
  // £ values on the invoice list / detail / line items.
  return perms.invoices_see_money
}

export function canSeeClientMoney(perms: StaffPermissions): boolean {
  // Per-client totals + outstanding balances on /clients and
  // /clients/[id]. Independent from the invoice screen.
  return perms.clients_see_money
}

export function canManageProducts(perms: StaffPermissions): boolean {
  // Legacy: "manage" used to mean add OR edit OR delete. Keep the
  // meaning but AND the flags so the sidebar / page can still gate
  // by it.
  return perms.products_add || perms.products_edit || perms.products_delete
}

export function canDeleteInvoices(perms: StaffPermissions): boolean {
  return perms.invoices_delete
}

export function canEditLockedInvoices(_perms: StaffPermissions): boolean {
  // Soft-locked invoices (paid / partial / converted) require admin
  // override — never granted to staff via the permission matrix.
  void _perms
  return false
}
