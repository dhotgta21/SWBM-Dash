'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { safeActionError } from '@/lib/errors'
import { verifyPaymentAction } from './payment-verification'
import { normalizeSignatureName } from '@/lib/signature'
import { reauthThenSoftDeleteRpc } from '@/lib/actions/soft-delete-rpc'
import { getPaymentBlockedInvoices } from '@/lib/actions/picker'

export interface PaymentFormData {
  invoice_id: string
  amount: number
  payment_date: string
  method: 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'other' | 'ecod'
  reference?: string
  notes?: string
  /** Login password re-auth (same as sign-in). */
  confirm_password?: string
  /**
   * Optional client-provided signature. Server prefers profiles.full_name when set.
   * Kept optional for backward compatibility with older clients.
   */
  verified_name?: string
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  return isAdminUser(supabase, userId)
}

async function getClientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}

// Brute-force protection for the operator password prompt. The RPC increments
// then returns the new count, so even blocked attempts consume a slot.
async function enforcePaymentVerifyLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ip: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [userRes, ipRes] = await Promise.all([
    supabase.rpc('check_rate_limit', { p_key: `payment-verify:user:${userId}`, p_max: 5, p_window_seconds: 60 }),
    supabase.rpc('check_rate_limit', { p_key: `payment-verify:ip:${ip}`, p_max: 20, p_window_seconds: 60 }),
  ])
  if ((userRes.data ?? 0) > 5) {
    return { ok: false, error: 'Too many verification attempts. Please try again later.' }
  }
  if ((ipRes.data ?? 0) > 20) {
    return { ok: false, error: 'Too many verification attempts from this network. Please try again later.' }
  }
  return { ok: true }
}

export async function createPayment(data: PaymentFormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Recording a payment is gated by the invoices_record_payment
  // permission. Admins always pass; staff pass when the admin enabled
  // the toggle in Settings. Default off — payments are the most
  // audit-sensitive action on the invoice screen (they directly move
  // amount_paid and flip status to partial/paid).
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }
  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_record_payment) {
    return { error: 'Your account is not allowed to record payments. Ask an administrator.' }
  }

  // Operator re-verification: login password only (same as sign-in).
  if (!data.confirm_password) {
    return { error: 'Password is required to record a payment.' }
  }

  const ip = await getClientIp()
  const verifyLimit = await enforcePaymentVerifyLimit(supabase, user.id, ip)
  if (!verifyLimit.ok) return { error: verifyLimit.error }

  const verified = await verifyPaymentAction(supabase, user.id, data.confirm_password)
  if (!verified.ok) return { error: verified.error }

  // Audit stamp: prefer profile name; fall back to optional client value.
  const { data: nameProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const verifiedName = nameProfile?.full_name?.trim()
    ? normalizeSignatureName(nameProfile.full_name)
    : data.verified_name
      ? normalizeSignatureName(data.verified_name)
      : null

  const amount = roundMoney(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Payment amount must be greater than zero' }
  }

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, type, status, total, amount_paid, created_by')
    .eq('id', data.invoice_id)
    .is('deleted_at', null)
    .single()

  if (!invoice) {
    return { error: 'Invoice not found' }
  }

  if (invoice.type !== 'invoice') {
    return { error: 'Payments can only be recorded against invoices' }
  }

  // Allow recording a payment against any invoice that is already in the
  // "money can move" lifecycle: draft (e.g. customer paid a deposit before
  // the invoice was sent), sent (normal flow), or partial (top-up). The
  // `recompute_invoice_paid` trigger is the single source of truth for the
  // status flip — it auto-advances to `partial` / `paid` based on the new
  // amount_paid, so this server action doesn't need to compute the status
  // itself.
  if (!['draft', 'sent', 'partial'].includes(invoice.status)) {
    return { error: 'Payments can only be recorded against draft, sent or partially paid invoices' }
  }

  if (invoice.created_by !== user.id && !isAdminUserRow) {
    return { error: 'Not authorized' }
  }

  // Amendment guard: if the picker loaded different quantities than ordered
  // (short-shipment / out of stock), the invoice totals no longer match what
  // was sent and office staff must review and fix it before money moves.
  const { blocks } = await getPaymentBlockedInvoices([invoice.id])
  if (blocks && blocks.length > 0) {
    return {
      error:
        'This invoice was amended during picking (loaded quantities differ from what was ordered). Resolve the review on the invoice page before recording payment.',
    }
  }

  // Validate payment_date is a real date.
  if (!data.payment_date || Number.isNaN(new Date(data.payment_date).getTime())) {
    return { error: 'Payment date is not valid.' }
  }
  const allowedMethods = ['cash', 'bank_transfer', 'card', 'cheque', 'other', 'ecod'] as const
  if (!allowedMethods.includes(data.method)) {
    return { error: 'Payment method is not valid.' }
  }

  const remaining = roundMoney(invoice.total - invoice.amount_paid)
  if (amount > remaining) {
    return {
      error: `Payment would exceed invoice total. Maximum allowed: £${remaining.toFixed(2)}`,
    }
  }

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      invoice_id: data.invoice_id,
      amount,
      payment_date: data.payment_date,
      method: data.method,
      reference: data.reference?.trim() || null,
      notes: data.notes?.trim() || null,
      verified_name: verifiedName,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // The DB trigger recomputes amount_paid and the CHECK(amount_paid <= total)
    // constraint catches concurrent overpayments atomically. Surface it cleanly.
    if (error.code === '23514' || /amount_paid_sane/i.test(error.message)) {
      return { error: 'Payment would exceed invoice total.' }
    }
    return { error: safeActionError('payments.createPayment', error, 'Could not record the payment.') }
  }

  revalidatePath(`/invoices/${data.invoice_id}`)
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { payment }
}

export async function deletePayment(paymentId: string, invoiceId: string, password: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile) {
    return { error: 'Not authorised' }
  }

  const isAdminUserRow = await isAdmin(supabase, user.id)
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  if (!isAdminUserRow && !perms.invoices_delete_payment) {
    return { error: 'Your account is not allowed to delete payments. Ask an administrator.' }
  }

  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null

  const gated = await reauthThenSoftDeleteRpc(supabase, user.id, password, 'soft_delete_payment', {
    p_payment_id: paymentId,
    p_ip_address: ip === 'unknown' ? null : ip,
    p_user_agent: userAgent,
  })
  if (!gated.ok) return { error: gated.error }
  if (!gated.result.success) {
    return { error: gated.result.message || 'Could not delete the payment.' }
  }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { success: true }
}
