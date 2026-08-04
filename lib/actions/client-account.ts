'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import { verifyClientAccountAction } from './client-account-verification'
import { normalizeSignatureName } from '@/lib/signature'
import { getPaymentBlockedInvoices } from '@/lib/actions/picker'

export interface ClientDepositData {
  client_id: string
  amount: number
  payment_date: string
  method: 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'
  reference?: string
  notes?: string
  verified_name: string
  confirm_password: string
}

export interface ClientAccountAllocation {
  invoice_id: string
  amount: number
}

export interface ApplyClientAccountData {
  client_id: string
  allocations: ClientAccountAllocation[]
  notes?: string
  verified_name: string
  confirm_password: string
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  return isAdminUser(supabase, userId)
}

async function getRequestMetadata() {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0].trim() : null)
    || h.get('x-real-ip')
    || 'unknown'
  return {
    ip,
    userAgent: h.get('user-agent') || undefined,
  }
}

async function checkRateLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  key: string,
  max: number,
  windowSeconds: number
): Promise<number> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    // Fail closed on money-moving paths: treat RPC failure as "at limit"
    // so a rate-limit outage cannot become an unlimited wallet API.
    console.error('check_rate_limit error:', error)
    return max
  }
  return data ?? 0
}

async function auditClientAccountAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  action: 'deposit' | 'apply_balance' | 'reversal' | 'failed_verification' | 'rate_limited',
  payload: {
    client_id?: string
    invoice_ids?: string[]
    amount?: number
    verified_name?: string
    ip_address?: string
    user_agent?: string
    metadata?: Record<string, unknown>
  }
) {
  try {
    await supabase.rpc('log_client_account_action', {
      p_action: action,
      p_client_id: payload.client_id ?? undefined,
      p_invoice_ids: payload.invoice_ids ?? undefined,
      p_amount: typeof payload.amount === 'number' ? payload.amount : undefined,
      p_verified_name: payload.verified_name?.trim() || undefined,
      p_ip_address: payload.ip_address ?? undefined,
      p_user_agent: payload.user_agent ?? undefined,
      p_metadata: payload.metadata ?? undefined,
    })
  } catch (err) {
    console.error('auditClientAccountAction error:', err)
  }
}

async function checkCanManageAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ ok: true; isAdmin: boolean } | { ok: false; error: string }> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return { ok: false, error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, userId)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)

  // Managing account money requires both the management permission and the
  // right to view client money (confirmation dialogs expose amounts).
  if (!isAdminUserRow && (!perms.clients_manage_account || !perms.clients_see_money)) {
    return { ok: false, error: 'Your account is not allowed to manage client accounts. Ask an administrator.' }
  }

  return { ok: true, isAdmin: isAdminUserRow }
}

async function enforceAccountActionRateLimits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ip: string
): Promise<{ ok: true } | { ok: false; error: string; reason: string }> {
  const userKey = `account-action:user:${userId}`
  const ipKey = `account-action:ip:${ip}`
  const globalKey = 'account-action:global'

  const [userCount, ipCount, globalCount] = await Promise.all([
    checkRateLimit(supabase, userKey, 10, 60),
    checkRateLimit(supabase, ipKey, 30, 60),
    checkRateLimit(supabase, globalKey, 100, 60),
  ])

  if (userCount > 10) {
    return { ok: false, error: 'Action limit reached for your account. Please try again later.', reason: 'per_user_limit' }
  }
  if (ipCount > 30) {
    return { ok: false, error: 'Action limit reached from this network. Please try again later.', reason: 'per_ip_limit' }
  }
  if (globalCount > 100) {
    return { ok: false, error: 'Service busy. Please try again later.', reason: 'global_limit' }
  }

  return { ok: true }
}

async function enforceVerificationRateLimits(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ip: string
): Promise<{ ok: true } | { ok: false; error: string; reason: string }> {
  const userKey = `account-verify:user:${userId}`
  const ipKey = `account-verify:ip:${ip}`

  const [userCount, ipCount] = await Promise.all([
    checkRateLimit(supabase, userKey, 5, 60),
    checkRateLimit(supabase, ipKey, 20, 60),
  ])

  if (userCount > 5) {
    return { ok: false, error: 'Too many verification attempts. Please try again later.', reason: 'per_user_limit' }
  }
  if (ipCount > 20) {
    return { ok: false, error: 'Too many verification attempts from this network. Please try again later.', reason: 'per_ip_limit' }
  }

  return { ok: true }
}

export async function depositToClientAccount(data: ClientDepositData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const can = await checkCanManageAccount(supabase, user.id)
  if (!can.ok) return { error: can.error }

  const { ip, userAgent } = await getRequestMetadata()

  const actionLimit = await enforceAccountActionRateLimits(supabase, user.id, ip)
  if (!actionLimit.ok) {
    await auditClientAccountAction(supabase, 'rate_limited', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { reason: actionLimit.reason, action: 'deposit' },
    })
    return { error: actionLimit.error }
  }

  const verifyLimit = await enforceVerificationRateLimits(supabase, user.id, ip)
  if (!verifyLimit.ok) {
    await auditClientAccountAction(supabase, 'rate_limited', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { reason: verifyLimit.reason, action: 'deposit' },
    })
    return { error: verifyLimit.error }
  }

  const verified = await verifyClientAccountAction(supabase, user.id, data.verified_name, data.confirm_password)
  if (!verified.ok) {
    await auditClientAccountAction(supabase, 'failed_verification', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { action: 'deposit' },
    })
    return { error: verified.error }
  }

  const amount = roundMoney(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Deposit amount must be greater than zero' }
  }

  if (!data.payment_date || Number.isNaN(new Date(data.payment_date).getTime())) {
    return { error: 'Payment date is not valid.' }
  }

  const allowedMethods = ['cash', 'bank_transfer', 'card', 'cheque', 'other', 'ecod'] as const
  if (!allowedMethods.includes(data.method)) {
    return { error: 'Payment method is not valid.' }
  }

  const { data: transactionId, error } = await supabase.rpc('deposit_to_client_account', {
    p_client_id: data.client_id,
    p_amount: amount,
    p_method: data.method,
    p_reference: data.reference?.trim() || undefined,
    p_notes: data.notes?.trim() || undefined,
    p_verified_name: data.verified_name ? normalizeSignatureName(data.verified_name) : undefined,
    p_transaction_date: data.payment_date,
  })

  if (error) {
    const msg = (error as { message?: string }).message || ''
    if (/does not exist|Could not find the function|schema cache/i.test(msg)) {
      return {
        error:
          'Client wallet is not available on this database yet (missing deposit_to_client_account). Run supabase/seed/08_fix_client_wallet.sql (or node scripts/apply-08-client-wallet.mjs).',
      }
    }
    return {
      error: safeActionError(
        'clientAccount.depositToClientAccount',
        error,
        msg ? `Could not record the deposit: ${msg}` : 'Could not record the deposit.'
      ),
    }
  }

  await auditClientAccountAction(supabase, 'deposit', {
    client_id: data.client_id,
    amount,
    verified_name: data.verified_name ? normalizeSignatureName(data.verified_name) : undefined,
    ip_address: ip,
    user_agent: userAgent,
    metadata: { method: data.method, reference: data.reference, transaction_id: transactionId },
  })

  revalidatePath(`/clients/${data.client_id}`)
  revalidatePath('/clients')
  revalidatePath('/dashboard')
  return { transactionId }
}

export async function applyClientAccountBalance(data: ApplyClientAccountData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const can = await checkCanManageAccount(supabase, user.id)
  if (!can.ok) return { error: can.error }

  const { ip, userAgent } = await getRequestMetadata()

  const actionLimit = await enforceAccountActionRateLimits(supabase, user.id, ip)
  if (!actionLimit.ok) {
    await auditClientAccountAction(supabase, 'rate_limited', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { reason: actionLimit.reason, action: 'apply_balance' },
    })
    return { error: actionLimit.error }
  }

  const verifyLimit = await enforceVerificationRateLimits(supabase, user.id, ip)
  if (!verifyLimit.ok) {
    await auditClientAccountAction(supabase, 'rate_limited', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { reason: verifyLimit.reason, action: 'apply_balance' },
    })
    return { error: verifyLimit.error }
  }

  const verified = await verifyClientAccountAction(supabase, user.id, data.verified_name, data.confirm_password)
  if (!verified.ok) {
    await auditClientAccountAction(supabase, 'failed_verification', {
      client_id: data.client_id,
      ip_address: ip,
      user_agent: userAgent,
      metadata: { action: 'apply_balance' },
    })
    return { error: verified.error }
  }

  const allocations = data.allocations
    .map((a) => ({ invoice_id: a.invoice_id, amount: roundMoney(a.amount) }))
    .filter((a) => Number.isFinite(a.amount) && a.amount > 0)

  if (allocations.length === 0) {
    return { error: 'At least one valid allocation is required.' }
  }

  // Amendment guard: none of the target invoices may have unresolved picker
  // quantity amendments (loaded qty differs from ordered qty).
  const { blocks } = await getPaymentBlockedInvoices(allocations.map((a) => a.invoice_id))
  if (blocks && blocks.length > 0) {
    return {
      error:
        'One or more invoices were amended during picking (loaded quantities differ from what was ordered). Resolve the review on the invoice page before applying account balance.',
    }
  }

  const totalApplied = allocations.reduce((sum, a) => sum + a.amount, 0)
  const verifiedName = data.verified_name ? normalizeSignatureName(data.verified_name) : undefined

  const { data: transactionIds, error } = await supabase.rpc('apply_client_account_balance', {
    p_client_id: data.client_id,
    p_invoice_ids: allocations.map((a) => a.invoice_id),
    p_amounts: allocations.map((a) => a.amount),
    p_notes: data.notes?.trim() || undefined,
    p_verified_name: verifiedName,
  })

  if (error) {
    return { error: safeActionError('clientAccount.applyClientAccountBalance', error, 'Could not apply account balance.') }
  }

  await auditClientAccountAction(supabase, 'apply_balance', {
    client_id: data.client_id,
    invoice_ids: allocations.map((a) => a.invoice_id),
    amount: totalApplied,
    verified_name: verifiedName,
    ip_address: ip,
    user_agent: userAgent,
    metadata: { transaction_ids: transactionIds, allocation_count: allocations.length },
  })

  for (const allocation of allocations) {
    revalidatePath(`/invoices/${allocation.invoice_id}`)
  }
  revalidatePath(`/clients/${data.client_id}`)
  revalidatePath('/clients')
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { transactionIds }
}

export interface ClientTransaction {
  id: string
  type: 'deposit' | 'allocation' | 'withdrawal' | 'adjustment' | 'reversal'
  amount: number
  transaction_date: string
  running_balance: number
  invoice_id: string | null
  payment_id: string | null
  method: string | null
  reference: string | null
  notes: string | null
  verified_name: string | null
  created_by_name: string | null
  created_at: string
}

export async function getClientAccountLedger(clientId: string): Promise<{
  transactions: ClientTransaction[]
  error?: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { transactions: [], error: 'Not authenticated' }
  }

  const can = await checkCanManageAccount(supabase, user.id)
  if (!can.ok) {
    return { transactions: [], error: can.error }
  }

  // Use admin client so RLS does not narrow the result; permission was already checked above.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('client_account_transactions')
    .select(
      'id, type, amount, transaction_date, running_balance, invoice_id, payment_id, method, reference, notes, verified_name, created_by, created_at'
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('getClientAccountLedger error:', error)
    return { transactions: [], error: 'Could not load account ledger.' }
  }

  const rows = (data ?? []) as {
    id: string
    type: ClientTransaction['type']
    amount: number
    transaction_date: string
    running_balance: number
    invoice_id: string | null
    payment_id: string | null
    method: string | null
    reference: string | null
    notes: string | null
    verified_name: string | null
    created_by: string
    created_at: string
  }[]

  const userIds = Array.from(new Set(rows.map((r) => r.created_by)))
  const namesById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds)
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      if (p.full_name) namesById.set(p.id, p.full_name)
    }
  }

  const transactions: ClientTransaction[] = rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    transaction_date: row.transaction_date,
    running_balance: row.running_balance,
    invoice_id: row.invoice_id,
    payment_id: row.payment_id,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    verified_name: row.verified_name,
    created_by_name: namesById.get(row.created_by) ?? null,
    created_at: row.created_at,
  }))

  return { transactions }
}
