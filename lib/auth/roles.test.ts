import { describe, it, expect } from 'vitest'
import {
  isAdmin,
  isStaff,
  isPicker,
  isOperator,
  canSeeMoney,
  canSeeDashboard,
  canSeeSettings,
  canUseMfa,
  canManageProducts,
  canEditLockedInvoices,
  canDeleteInvoices,
  roleLabel,
  type AppRole,
} from './roles'

describe('role predicates', () => {
  it.each<{ role: AppRole | null | undefined; expected: boolean }>([
    { role: 'admin', expected: true },
    { role: 'staff', expected: false },
    { role: 'picker', expected: false },
    { role: 'client', expected: false },
    { role: null, expected: false },
  ])('isAdmin($role) === $expected', ({ role, expected }) => {
    expect(isAdmin(role)).toBe(expected)
  })

  it.each<{ role: AppRole | null | undefined; expected: boolean }>([
    { role: 'admin', expected: false },
    { role: 'staff', expected: true },
    { role: 'picker', expected: false },
    { role: 'client', expected: false },
    { role: null, expected: false },
  ])('isStaff($role) === $expected', ({ role, expected }) => {
    expect(isStaff(role)).toBe(expected)
  })

  it.each<{ role: AppRole | null | undefined; expected: boolean }>([
    { role: 'admin', expected: false },
    { role: 'staff', expected: false },
    { role: 'picker', expected: true },
    { role: 'client', expected: false },
    { role: null, expected: false },
  ])('isPicker($role) === $expected', ({ role, expected }) => {
    expect(isPicker(role)).toBe(expected)
  })

  it.each<{ role: AppRole | null | undefined; expected: boolean }>([
    { role: 'admin', expected: true },
    { role: 'staff', expected: true },
    { role: 'picker', expected: true },
    { role: 'client', expected: false },
    { role: null, expected: false },
    { role: undefined, expected: false },
    { role: 'superuser' as AppRole, expected: false },
  ])('isOperator($role) === $expected', ({ role, expected }) => {
    expect(isOperator(role)).toBe(expected)
  })
})

describe('capability predicates', () => {
  it('only admins can see money', () => {
    expect(canSeeMoney('admin')).toBe(true)
    expect(canSeeMoney('staff')).toBe(false)
    expect(canSeeMoney('client')).toBe(false)
    expect(canSeeMoney(null)).toBe(false)
  })

  it('admins and staff with see_dashboard can see the dashboard', () => {
    expect(canSeeDashboard('admin')).toBe(true)
    expect(canSeeDashboard('staff')).toBe(false)
    expect(canSeeDashboard('staff', { see_dashboard: true })).toBe(true)
    expect(canSeeDashboard('staff', { see_dashboard: false })).toBe(false)
    expect(canSeeDashboard('client')).toBe(false)
  })

  it('only admins can see settings', () => {
    expect(canSeeSettings('admin')).toBe(true)
    expect(canSeeSettings('staff')).toBe(false)
  })

  it('admin and staff can use MFA; clients and yard roles cannot', () => {
    expect(canUseMfa('admin')).toBe(true)
    expect(canUseMfa('staff')).toBe(true)
    expect(canUseMfa('client')).toBe(false)
    expect(canUseMfa('picker')).toBe(false)
    expect(canUseMfa('driver')).toBe(false)
    expect(canUseMfa(null)).toBe(false)
  })

  it('only admins can manage products', () => {
    expect(canManageProducts('admin')).toBe(true)
    expect(canManageProducts('staff')).toBe(false)
  })

  it('only admins can edit locked invoices', () => {
    expect(canEditLockedInvoices('admin')).toBe(true)
    expect(canEditLockedInvoices('staff')).toBe(false)
  })

  it('only admins can delete invoices', () => {
    expect(canDeleteInvoices('admin')).toBe(true)
    expect(canDeleteInvoices('staff')).toBe(false)
  })
})

describe('roleLabel', () => {
  it('returns human-friendly labels for known roles', () => {
    expect(roleLabel('admin')).toBe('Administrator')
    expect(roleLabel('staff')).toBe('Staff')
    expect(roleLabel('picker')).toBe('Picker')
    expect(roleLabel('client')).toBe('Client')
  })

  it('falls back for unknown or missing roles', () => {
    expect(roleLabel('superuser')).toBe('Superuser')
    expect(roleLabel(null)).toBe('Member')
    expect(roleLabel(undefined)).toBe('Member')
  })
})
