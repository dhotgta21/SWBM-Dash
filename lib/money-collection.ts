// lib/money-collection.ts
// Server-side loader for the "Money collection" hero on the Analytics
// page (and the Clients → Dashboard tab). Pulls everything the hero
// needs in a single round trip so the page renders without a waterfall
// of queries.
//
// What we surface:
//
//   • totals — outstanding, overdue, due-this-week, due-today,
//     collected-today, collected-this-month, live invoice + client
//     counts. The headline numbers powering the hero.
//   • dso — Days Sales Outstanding. AR ÷ average daily credit sales.
//     The classic "how long does money take to come in" metric.
//   • topDebtors — customers ranked by total outstanding amount,
//     with their own DSO and last-payment-date for triage context.
//     Consumed by the Clients → Dashboard tab's Top debtors widget.

import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'

const MS_PER_DAY = 1000 * 60 * 60 * 24

export interface CollectionTotals {
  outstandingTotal: number
  overdueTotal: number
  overdueCount: number
  dueTodayTotal: number
  dueTodayCount: number
  dueThisWeekTotal: number
  dueThisWeekCount: number
  collectedToday: number
  collectedThisMonth: number
  invoiceCount: number
  clientCount: number
}

export interface TopDebtor {
  clientId: string
  clientName: string
  companyName: string | null
  outstanding: number
  overdueAmount: number
  overdueCount: number
  /** Average days this client takes to settle an invoice (NULL if
   *  they have no paid history yet). */
  avgDaysToPay: number | null
  /** Date of the most recent payment received from this client, or
   *  null if they've never paid. */
  lastPaymentAt: string | null
}

export interface MoneyCollectionSnapshot {
  totals: CollectionTotals
  dso: number | null
  topDebtors: TopDebtor[]
  /** When the snapshot was generated (ISO). Lets the UI render a
   *  "as of" hint without re-fetching. */
  asOf: string
}

function makeFallback(): MoneyCollectionSnapshot {
  return {
    totals: {
      outstandingTotal: 0,
      overdueTotal: 0,
      overdueCount: 0,
      dueTodayTotal: 0,
      dueTodayCount: 0,
      dueThisWeekTotal: 0,
      dueThisWeekCount: 0,
      collectedToday: 0,
      collectedThisMonth: 0,
      invoiceCount: 0,
      clientCount: 0,
    },
    dso: null,
    topDebtors: [],
    // Computed per call — a module-level constant would freeze "as of"
    // at server-process start for the lifetime of the process.
    asOf: new Date().toISOString(),
  }
}

interface InvoiceRow {
  id: string
  document_number: string
  client_id: string
  status: string
  issue_date: string
  due_date: string | null
  total: number
  amount_paid: number
  balance_due: number
}

interface PaymentRow {
  invoice_id: string
  payment_date: string
  amount: number
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/** Parse a YYYY-MM-DD date-only string as LOCAL midnight. `new Date(s)`
 *  on a date-only string parses as UTC midnight, which compares wrong
 *  against the local-midnight anchors used below. */
function parseDateOnlyLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export async function loadMoneyCollectionSnapshot(
  options: { topDebtorLimit?: number } = {}
): Promise<MoneyCollectionSnapshot> {
  const topDebtorLimit = options.topDebtorLimit ?? 5

  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.invoices_see_money)) {
    console.warn('loadMoneyCollectionSnapshot: unauthorised')
    return makeFallback()
  }

  try {
    // Reads broad financial aggregates; use the service-role client so
    // the numbers are not narrowed by per-operator RLS.
    const admin = createAdminClient()
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * MS_PER_DAY)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const dsoWindowStart = new Date(now.getTime() - 90 * MS_PER_DAY)

    // Pull every real invoice (sent / partial / paid / overdue).
    // Drafts, cancelled invoices and soft-deleted (bin) invoices are
    // intentionally excluded - they don't represent money we're
    // trying to collect. Quotations are also excluded.
    // Paginated explicitly: without a .limit() PostgREST silently caps at
    // 1000 rows, which would understate every headline figure at scale.
    const PAGE_SIZE = 1000
    const MAX_PAGES = 50

    // Partial demo schemas may lack soft-delete columns (migration 093).
    const isMissingDeletedAt = (message: string | undefined) => {
      const msg = (message ?? '').toLowerCase()
      return msg.includes('deleted_at') && msg.includes('does not exist')
    }
    let filterInvoiceDeletedAt = true
    let filterPaymentDeletedAt = true

    const invoices: InvoiceRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE
      let query = admin
        .from('invoices')
        .select(
          'id, document_number, client_id, status, issue_date, due_date, total, amount_paid, balance_due'
        )
        .eq('type', 'invoice')
        .in('status', ['sent', 'partial', 'paid', 'overdue'])
      if (filterInvoiceDeletedAt) {
        query = query.is('deleted_at', null)
      }
      // A stable unique order is REQUIRED for offset pagination —
      // without it Postgres may return a row on two pages or skip it.
      const { data, error } = await query
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error && filterInvoiceDeletedAt && isMissingDeletedAt(error.message)) {
        console.warn(
          'loadMoneyCollectionSnapshot: invoices.deleted_at missing; retrying without soft-delete filter'
        )
        filterInvoiceDeletedAt = false
        page -= 1
        continue
      }
      if (error) {
        console.warn('loadMoneyCollectionSnapshot: invoice query failed', error.message)
        return makeFallback()
      }
      const rows = (data ?? []) as InvoiceRow[]
      invoices.push(...rows)
      if (rows.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) {
        console.warn('loadMoneyCollectionSnapshot: invoice result truncated at safety cap')
      }
    }

    const invoiceMap = new Map(invoices.map((i) => [i.id, i]))

    // Pull recent payments for collected totals + per-client "avg days
    // to pay". We only need a 90-day window to keep the row count
    // manageable. Exclude soft-deleted payments when the column exists.
    const payments: PaymentRow[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE
      let query = admin
        .from('payments')
        .select('invoice_id, payment_date, amount')
        .gte('payment_date', dsoWindowStart.toISOString())
      if (filterPaymentDeletedAt) {
        query = query.is('deleted_at', null)
      }
      // Stable unique order required for offset pagination (see above).
      const { data, error } = await query
        .order('id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error && filterPaymentDeletedAt && isMissingDeletedAt(error.message)) {
        console.warn(
          'loadMoneyCollectionSnapshot: payments.deleted_at missing; retrying without soft-delete filter'
        )
        filterPaymentDeletedAt = false
        page -= 1
        continue
      }
      if (error) {
        // Same policy as the invoices query: a failed page means the
        // collected/avg-days figures would be silently understated, so
        // fall back rather than render wrong numbers.
        console.warn('loadMoneyCollectionSnapshot: payments query failed', error.message)
        return makeFallback()
      }
      const rows = (data ?? []) as PaymentRow[]
      payments.push(...rows)
      if (rows.length < PAGE_SIZE) break
      if (page === MAX_PAGES - 1) {
        console.warn('loadMoneyCollectionSnapshot: payments result truncated at safety cap')
      }
    }

    // ---------- Totals + per-client rollup (top debtors) ----------
    const totals: CollectionTotals = {
      outstandingTotal: 0,
      overdueTotal: 0,
      overdueCount: 0,
      dueTodayTotal: 0,
      dueTodayCount: 0,
      dueThisWeekTotal: 0,
      dueThisWeekCount: 0,
      collectedToday: 0,
      collectedThisMonth: 0,
      // "Live" invoices only — unpaid and still carrying a balance.
      // Paid / fully-settled invoices are not live collections work.
      invoiceCount: invoices.filter(
        (inv) => inv.status !== 'paid' && Number(inv.balance_due ?? 0) > 0
      ).length,
      clientCount: 0,
    }

    const perClient = new Map<
      string,
      { outstanding: number; overdue: number; overdueCount: number; paidDurations: number[]; lastPaymentAt: string | null }
    >()

    const todayIso = startOfToday.toISOString().slice(0, 10)

    for (const inv of invoices) {
      const balance = Number(inv.balance_due ?? 0)
      // Paid invoices have zero balance and don't contribute to the
      // outstanding totals, but they are still counted in
      // invoiceCount and feed the DSO sales basis.
      if (inv.status === 'paid') continue
      if (!Number.isFinite(balance) || balance <= 0) continue

      const due = inv.due_date ? parseDateOnlyLocal(inv.due_date) : null
      const daysOverdue = due ? daysBetween(due, now) : null
      const isOverdue = daysOverdue != null && daysOverdue > 0
      const isDueToday = inv.due_date === todayIso
      const isDueThisWeek = due && due >= now && due <= weekFromNow

      totals.outstandingTotal += balance
      if (isOverdue) {
        totals.overdueTotal += balance
        totals.overdueCount += 1
      }
      if (isDueToday) {
        totals.dueTodayTotal += balance
        totals.dueTodayCount += 1
      }
      if (isDueThisWeek) {
        totals.dueThisWeekTotal += balance
        totals.dueThisWeekCount += 1
      }

      // Per-client rollup for the TopDebtors widget. Keyed by
      // client_id so customers with multiple unpaid invoices are
      // represented once with their total exposure.
      const bucket =
        perClient.get(inv.client_id) ??
        {
          outstanding: 0,
          overdue: 0,
          overdueCount: 0,
          paidDurations: [],
          lastPaymentAt: null,
        }
      bucket.outstanding += balance
      if (isOverdue) {
        bucket.overdue += balance
        bucket.overdueCount += 1
      }
      perClient.set(inv.client_id, bucket)
    }

    // ---------- Payments → collected today / this month ----------
    for (const pay of payments) {
      const paidAt = parseDateOnlyLocal(pay.payment_date)
      if (Number.isNaN(paidAt.getTime())) continue
      const amount = Number(pay.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) continue

      // Only count payments against live invoices.
      if (!invoiceMap.has(pay.invoice_id)) continue

      if (paidAt >= startOfToday) {
        totals.collectedToday += amount
      }
      if (paidAt >= startOfMonth) {
        totals.collectedThisMonth += amount
      }
    }

    // ---------- DSO: total AR ÷ average daily credit sales over the window ----------
    const windowDays = Math.max(1, daysBetween(dsoWindowStart, now))
    const creditSalesInWindow = invoices
      .filter((inv) => inv.issue_date >= dsoWindowStart.toISOString().slice(0, 10))
      .reduce((sum, inv) => sum + Number(inv.total ?? 0), 0)
    const avgDailyCreditSales = creditSalesInWindow / windowDays
    const dso =
      avgDailyCreditSales > 0
        ? Math.round(totals.outstandingTotal / avgDailyCreditSales)
        : null

    // Mark last payment per client + capture paid-duration samples
    // for the per-client DTO calc.
    for (const pay of payments) {
      const inv = invoiceMap.get(pay.invoice_id)
      if (!inv) continue
      const paidAt = pay.payment_date
      const bucket =
        perClient.get(inv.client_id) ??
        {
          outstanding: 0,
          overdue: 0,
          overdueCount: 0,
          paidDurations: [],
          lastPaymentAt: null,
        }
      if (!bucket.lastPaymentAt || paidAt > bucket.lastPaymentAt) {
        bucket.lastPaymentAt = paidAt
      }
      // Days from invoice issue to payment.
      const issuedAt = parseDateOnlyLocal(inv.issue_date)
      const paidDate = parseDateOnlyLocal(paidAt)
      const dur = daysBetween(issuedAt, paidDate)
      if (dur >= 0 && dur <= 365) {
        bucket.paidDurations.push(dur)
      }
      perClient.set(inv.client_id, bucket)
    }

    // ---------- Client lookup for top-debtor display names ----------
    // Partial demo schemas may lack clients.deleted_at (migration 093).
    // Filtering on a missing column returns no rows → every debtor shows
    // as "Unknown client" even though invoices loaded fine via service role.
    const clientIds = Array.from(perClient.keys())
    let clientLookup = new Map<string, { first_name: string | null; last_name: string | null; company_name: string | null }>()
    if (clientIds.length > 0) {
      let filterClientDeletedAt = true
      for (let attempt = 0; attempt < 2; attempt++) {
        let clientQuery = admin
          .from('clients')
          .select('id, first_name, last_name, company_name')
          .in('id', clientIds)
        if (filterClientDeletedAt) {
          clientQuery = clientQuery.is('deleted_at', null)
        }
        const { data: clientData, error: clientError } = await clientQuery
        if (
          clientError &&
          filterClientDeletedAt &&
          isMissingDeletedAt(clientError.message)
        ) {
          console.warn(
            'loadMoneyCollectionSnapshot: clients.deleted_at missing; retrying name lookup without soft-delete filter'
          )
          filterClientDeletedAt = false
          continue
        }
        if (clientError) {
          console.warn(
            'loadMoneyCollectionSnapshot: client name lookup failed',
            clientError.message
          )
          break
        }
        clientLookup = new Map(
          (clientData ?? []).map(
            (c: {
              id: string
              first_name: string | null
              last_name: string | null
              company_name: string | null
            }) => [c.id, c]
          )
        )
        break
      }
    }

    const topDebtors: TopDebtor[] = Array.from(perClient.entries())
      .map(([clientId, b]) => {
        const c = clientLookup.get(clientId)
        const fullName =
          [c?.first_name, c?.last_name].filter(Boolean).join(' ') ||
          c?.company_name ||
          'Unknown client'
        const avgDaysToPay =
          b.paidDurations.length > 0
            ? Math.round(
                b.paidDurations.reduce((s, d) => s + d, 0) / b.paidDurations.length
              )
            : null
        return {
          clientId,
          clientName: fullName,
          companyName: c?.company_name ?? null,
          outstanding: b.outstanding,
          overdueAmount: b.overdue,
          overdueCount: b.overdueCount,
          avgDaysToPay,
          lastPaymentAt: b.lastPaymentAt,
        }
      })
      .filter((d) => d.outstanding > 0)
      // Ranked by total outstanding; overdue amount breaks ties.
      .sort((a, b) => b.outstanding - a.outstanding || b.overdueAmount - a.overdueAmount)
      .slice(0, topDebtorLimit)

    // Only clients that still owe money — the payments loop above may
    // have created per-client buckets for fully-paid customers.
    totals.clientCount = Array.from(perClient.values()).filter(
      (b) => b.outstanding > 0
    ).length

    return {
      totals,
      dso,
      topDebtors,
      asOf: now.toISOString(),
    }
  } catch (err) {
    console.warn('loadMoneyCollectionSnapshot: unexpected error', err)
    return makeFallback()
  }
}