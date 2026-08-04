// lib/client-dashboard.ts
// Server-side loader for the new "Client Dashboard" tab on /clients.
//
// What the dashboard shows:
//
//   • kpis — counts and £ totals across the customer base. Used to
//     populate the headline KPI strip at the top of the dashboard.
//   • aiReviewQueue — customers the AI assistant created that an
//     operator has not yet confirmed. Promoted on the dashboard so
//     the operator can clear the queue without bouncing into a list.
//   • recentClients — the five most-recently-created permanent
//     customers, with a link into the full list.
//
// Money visibility (`clients_see_money` / `invoices_see_money`) is
// honoured: when the operator cannot see money, every £ value comes
// back as zero and the dashboard shell (counts, alerts, recent list)
// still renders. This mirrors how the Invoices page gates the same
// surfaces.

import { createClient } from '@/lib/supabase/server'
import { getOperatorContext } from '@/lib/auth/context'

export interface ClientDashboardKpis {
  /** Permanent, non-deleted account customers. */
  totalClients: number
  /** Permanent customers with at least one non-cancelled invoice. */
  activeClients: number
  /** Permanent customers whose balance due is greater than zero. */
  withBalance: number
  /** Sum of balance_due across every non-cancelled invoice. */
  totalOutstanding: number
  /** Average outstanding for customers with a non-zero balance. */
  averageBalance: number | null
  /** Permanent customers created by the AI assistant and not yet
   *  reviewed by an operator. */
  aiReviewPending: number
  /** Temporary (walk-in) customers still pending promotion. */
  temporaryPending: number
}

export interface ClientDashboardAlert {
  id: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  email: string | null
  phone: string | null
  addressLine1: string | null
  postcode: string | null
  createdAt: string
}

export interface ClientDashboardRecentClient {
  id: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  email: string | null
  accountNumber: string | null
  createdAt: string
}

export interface ClientDashboardMetrics {
  kpis: ClientDashboardKpis
  aiReviewQueue: ClientDashboardAlert[]
  temporaryQueue: ClientDashboardAlert[]
  recentClients: ClientDashboardRecentClient[]
  asOfDate: string
}

const EMPTY: ClientDashboardMetrics = {
  kpis: {
    totalClients: 0,
    activeClients: 0,
    withBalance: 0,
    totalOutstanding: 0,
    averageBalance: null,
    aiReviewPending: 0,
    temporaryPending: 0,
  },
  aiReviewQueue: [],
  temporaryQueue: [],
  recentClients: [],
  asOfDate: new Date().toISOString(),
}

/**
 * Pull every count the Client Dashboard needs in three parallel
 * queries. Reads go through the request-scoped user client so RLS
 * scopes the figures to the same customers the /clients list shows
 * (admins see everything per policy); the per-operator context is
 * only used to decide whether to redact money.
 */
export async function getClientDashboardMetrics(
  options: { recentLimit?: number; alertLimit?: number } = {}
): Promise<ClientDashboardMetrics> {
  const recentLimit = options.recentLimit ?? 5
  const alertLimit = options.alertLimit ?? 5

  const operator = await getOperatorContext()
  if (!operator || (!operator.isAdmin && !operator.permissions.see_clients)) {
    console.warn('getClientDashboardMetrics: unauthorised')
    return EMPTY
  }

  const canSeeMoney = operator.isAdmin || operator.permissions.clients_see_money

  try {
    const supabase = await createClient()

    // Three parallel queries: permanent count + per-client rollups
    // for money KPIs; onboarding alerts for AI review; and the
    // most-recently-added customers. We could merge these into one
    // RPC but keeping them as discrete reads makes the intent of
    // each block obvious and matches the pattern used elsewhere in
    // the dashboard.
    const [clientRollupResult, aiReviewResult, recentResult] = await Promise.all([
      // Permanent customers + their non-cancelled invoice balances.
      // Selecting only the fields we need keeps the payload small.
      supabase
        .from('clients')
        .select(
          'id, is_temporary, ai_created, reviewed, invoices(status, balance_due, deleted_at)'
        )
        .eq('is_temporary', false)
        .is('deleted_at', null),
      // Up to N AI-created customers that need an operator's eyes.
      supabase
        .from('clients')
        .select(
          'id, first_name, last_name, company_name, email, phone, address_line_1, postcode, created_at'
        )
        .eq('is_temporary', false)
        .eq('ai_created', true)
        .eq('reviewed', false)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(alertLimit),
      // Most-recently-added permanent customers for the "Recent
      // clients" list. Excludes temps — they have their own tab.
      supabase
        .from('clients')
        .select(
          'id, first_name, last_name, company_name, email, account_number, created_at'
        )
        .eq('is_temporary', false)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(recentLimit),
    ])

    // supabase-js never throws on query failure — check each result
    // explicitly or a failed read renders all-zero KPIs with no signal.
    if (clientRollupResult.error) {
      console.warn('getClientDashboardMetrics: rollup query failed', clientRollupResult.error.message)
      return EMPTY
    }
    if (aiReviewResult.error) {
      console.warn('getClientDashboardMetrics: AI-review query failed', aiReviewResult.error.message)
    }
    if (recentResult.error) {
      console.warn('getClientDashboardMetrics: recent-clients query failed', recentResult.error.message)
    }

    // KPIs are derived in-process from the rollup query. We only
    // touch the fields we need so the loop stays cheap even with
    // thousands of customers.
    let totalClients = 0
    let activeClients = 0
    let withBalance = 0
    let totalOutstanding = 0
    let balanceSum = 0

    type RollupRow = {
      id: string
      is_temporary: boolean
      ai_created: boolean
      reviewed: boolean
      invoices: { status: string; balance_due: number; deleted_at: string | null }[] | null
    }
    const rollup = (clientRollupResult.data ?? []) as RollupRow[]

    for (const c of rollup) {
      totalClients += 1
      const realInvoices = (c.invoices ?? []).filter(
        (i) =>
          i.status !== 'cancelled' &&
          i.status !== 'draft' &&
          !i.deleted_at
      )
      if (realInvoices.length > 0) activeClients += 1
      const balance = realInvoices.reduce(
        (sum, i) => sum + Number(i.balance_due ?? 0),
        0
      )
      if (balance > 0) {
        withBalance += 1
        balanceSum += balance
        totalOutstanding += balance
      }
    }

    const averageBalance = withBalance > 0
      ? Math.round(balanceSum / withBalance)
      : null

    // Temporary count comes through the same permanent-only
    // rollup as a by-product — it would be a leftover
    // `is_temporary=true` row, but we filtered them out at the SQL
    // layer. Use a cheap separate count instead.
    const { count: tempCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', true)
      .is('deleted_at', null)

    // Count of all AI-created-unreviewed customers for the KPI
    // (we also fetched a sample for the alert list above). The
    // count reads the full set, not just the sample slice.
    const { count: aiReviewCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', false)
      .eq('ai_created', true)
      .eq('reviewed', false)
      .is('deleted_at', null)

    // Temporary alert rows — show the operator the next handful
    // of walk-in customers waiting to be completed.
    const { data: tempData } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, company_name, email, phone, address_line_1, postcode, created_at'
      )
      .eq('is_temporary', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(alertLimit)

    const toAlert = (row: {
      id: string
      first_name: string | null
      last_name: string | null
      company_name: string | null
      email: string | null
      phone: string | null
      address_line_1: string | null
      postcode: string | null
      created_at: string
    }): ClientDashboardAlert => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      companyName: row.company_name,
      email: row.email,
      phone: row.phone,
      addressLine1: row.address_line_1,
      postcode: row.postcode,
      createdAt: row.created_at,
    })

    const aiReviewQueue = (aiReviewResult.data ?? []).map(toAlert)
    const temporaryQueue = (tempData ?? []).map(toAlert)

    const recentClients: ClientDashboardRecentClient[] = (
      recentResult.data ?? []
    ).map((row: {
      id: string
      first_name: string | null
      last_name: string | null
      company_name: string | null
      email: string | null
      account_number: string | null
      created_at: string
    }) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      companyName: row.company_name,
      email: row.email,
      accountNumber: row.account_number,
      createdAt: row.created_at,
    }))

    return {
      kpis: {
        totalClients,
        activeClients,
        withBalance,
        // Redact when the operator cannot see money. We still
        // hand back the count so the dashboard shell renders.
        totalOutstanding: canSeeMoney ? totalOutstanding : 0,
        averageBalance: canSeeMoney ? averageBalance : null,
        aiReviewPending: aiReviewCount ?? 0,
        temporaryPending: tempCount ?? 0,
      },
      aiReviewQueue,
      temporaryQueue,
      recentClients,
      asOfDate: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('getClientDashboardMetrics: unexpected error', err)
    return EMPTY
  }
}
