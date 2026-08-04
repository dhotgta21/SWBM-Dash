import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadMoneyCollectionSnapshot } from './money-collection'

const mockFrom = vi.fn()
const mockAdminClient = {
  from: mockFrom,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdminClient,
}))

vi.mock('@/lib/auth/context', () => ({
  getOperatorContext: vi.fn(),
}))

import { getOperatorContext } from '@/lib/auth/context'
import { STAFF_DEFAULT_PERMISSIONS } from '@/lib/auth/permissions'

function createChain(finalMethod: string, result: () => Promise<{ data: unknown; error: unknown }>) {
  const self: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'is', 'in', 'gte', 'order', 'limit', 'range', 'maybeSingle']
  for (const method of methods) {
    if (method === finalMethod) {
      self[method] = vi.fn(() => result())
    } else {
      self[method] = vi.fn(() => self)
    }
  }
  return self
}

function invoicesQuery(data: unknown, error: unknown = null) {
  return createChain('range', () => Promise.resolve({ data, error }))
}

function paymentsQuery(data: unknown, error: unknown = null) {
  return createChain('range', () => Promise.resolve({ data, error }))
}

function clientsQuery(data: unknown, error: unknown = null) {
  return createChain('maybeSingle', () => Promise.resolve({ data, error }))
}

describe('loadMoneyCollectionSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReset()
    vi.mocked(getOperatorContext).mockResolvedValue({
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true,
      isStaff: false,
      isPicker: false,
      isDriver: false,
      permissions: STAFF_DEFAULT_PERMISSIONS,
    })
  })

  it('returns fallback for unauthorised caller', async () => {
    vi.mocked(getOperatorContext).mockResolvedValue(null)
    const snapshot = await loadMoneyCollectionSnapshot()
    expect(snapshot.totals.outstandingTotal).toBe(0)
    expect(snapshot.dso).toBeNull()
  })

  it('uses the payments table and payment_date column', async () => {
    const today = new Date().toISOString().slice(0, 10)
    mockFrom
      .mockReturnValueOnce(invoicesQuery([]))
      .mockReturnValueOnce(paymentsQuery([{ invoice_id: 'inv-1', payment_date: today, amount: 100 }]))
      .mockReturnValueOnce(clientsQuery(null))

    await loadMoneyCollectionSnapshot()

    expect(mockFrom).toHaveBeenCalledWith('invoices')
    expect(mockFrom).toHaveBeenCalledWith('payments')
  })

  it('calculates DSO from credit sales, not collections', async () => {
    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const windowStart = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // £1,000 outstanding (issued outside the window), £9,000 credit sales
    // in the 90-day window. DSO = 1000 / (9000 / 90) = 10 days.
    mockFrom
      .mockReturnValueOnce(
        invoicesQuery([
          {
            id: 'inv-1',
            document_number: 'INV-001',
            client_id: 'client-1',
            status: 'sent',
            issue_date: '2026-01-01',
            due_date: todayIso,
            total: 1000,
            amount_paid: 0,
            balance_due: 1000,
          },
          {
            id: 'inv-2',
            document_number: 'INV-002',
            client_id: 'client-1',
            status: 'paid',
            issue_date: windowStart,
            due_date: windowStart,
            total: 9000,
            amount_paid: 9000,
            balance_due: 0,
          },
        ])
      )
      .mockReturnValueOnce(paymentsQuery([]))
      .mockReturnValueOnce(clientsQuery({ id: 'client-1', first_name: 'Test', last_name: 'Client', company_name: null }))

    const snapshot = await loadMoneyCollectionSnapshot()
    expect(snapshot.dso).toBe(10)
  })

  it('excludes paid invoices from top-debtor rollup', async () => {
    const today = new Date().toISOString().slice(0, 10)

    mockFrom
      .mockReturnValueOnce(
        invoicesQuery([
          {
            id: 'inv-1',
            document_number: 'INV-001',
            client_id: 'client-1',
            status: 'paid',
            issue_date: today,
            due_date: today,
            total: 500,
            amount_paid: 500,
            balance_due: 0,
          },
        ])
      )
      .mockReturnValueOnce(paymentsQuery([]))
      .mockReturnValueOnce(clientsQuery({ id: 'client-1', first_name: 'Test', last_name: 'Client', company_name: null }))

    const snapshot = await loadMoneyCollectionSnapshot()
    expect(snapshot.topDebtors).toHaveLength(0)
  })
})