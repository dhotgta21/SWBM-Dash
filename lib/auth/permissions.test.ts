import { describe, it, expect } from 'vitest'
import {
  resolveStaffPermissions,
  canSeeSection,
  canSeeInvoiceMoney,
  canSeeClientMoney,
  canManageProducts,
  canDeleteInvoices,
  canEditLockedInvoices,
  STAFF_DEFAULT_PERMISSIONS,
  type StaffPermissions,
} from './permissions'

describe('resolveStaffPermissions', () => {
  it('returns all-true permissions for admins regardless of stored value', () => {
    const perms = resolveStaffPermissions('admin', { see_dashboard: false })
    expect(perms.see_dashboard).toBe(true)
    expect(perms.invoices_delete).toBe(true)
    expect(perms.settings_manage_team).toBe(true)
  })

  it('returns default staff permissions when raw is null', () => {
    const perms = resolveStaffPermissions('staff', null)
    expect(perms.see_dashboard).toBe(false)
    expect(perms.see_clients).toBe(true)
    expect(perms.invoices_add).toBe(false)
  })

  it('merges stored boolean overrides for staff', () => {
    const raw = { see_dashboard: true, invoices_add: true, invoices_see_money: true }
    const perms = resolveStaffPermissions('staff', raw)
    expect(perms.see_dashboard).toBe(true)
    expect(perms.invoices_add).toBe(true)
    expect(perms.invoices_see_money).toBe(true)
    // Unchanged defaults remain intact.
    expect(perms.clients_add).toBe(false)
    expect(perms.products_delete).toBe(false)
  })

  it('ignores non-boolean overrides and arrays', () => {
    const perms = resolveStaffPermissions('staff', {
      see_clients: 'yes',
      invoices_add: 1,
      see_products: [],
    } as unknown as import('@/lib/database.types').Json)
    expect(perms.see_clients).toBe(STAFF_DEFAULT_PERMISSIONS.see_clients)
    expect(perms.invoices_add).toBe(STAFF_DEFAULT_PERMISSIONS.invoices_add)
    expect(perms.see_products).toBe(STAFF_DEFAULT_PERMISSIONS.see_products)
  })
})

describe('canSeeSection', () => {
  const perms: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS, see_dashboard: true, see_products: false }

  it('returns the matching section flag', () => {
    expect(canSeeSection(perms, 'dashboard')).toBe(true)
    expect(canSeeSection(perms, 'products')).toBe(false)
    expect(canSeeSection(perms, 'clients')).toBe(true)
  })
})

describe('money helpers', () => {
  const perms: StaffPermissions = {
    ...STAFF_DEFAULT_PERMISSIONS,
    invoices_see_money: true,
    clients_see_money: false,
  }

  it('canSeeInvoiceMoney reads invoices_see_money', () => {
    expect(canSeeInvoiceMoney(perms)).toBe(true)
  })

  it('canSeeClientMoney reads clients_see_money', () => {
    expect(canSeeClientMoney(perms)).toBe(false)
  })
})

describe('product helpers', () => {
  it('canManageProducts is true when any product mutation flag is set', () => {
    const perms: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS, products_edit: true }
    expect(canManageProducts(perms)).toBe(true)
  })

  it('canManageProducts is false when no mutation flags are set', () => {
    const perms: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS }
    expect(canManageProducts(perms)).toBe(false)
  })
})

describe('invoice permission helpers', () => {
  it('canDeleteInvoices reads invoices_delete', () => {
    const perms: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS, invoices_delete: true }
    expect(canDeleteInvoices(perms)).toBe(true)
  })

  it('canEditLockedInvoices is always false for staff permissions', () => {
    const perms: StaffPermissions = { ...STAFF_DEFAULT_PERMISSIONS }
    expect(canEditLockedInvoices(perms)).toBe(false)
  })
})
