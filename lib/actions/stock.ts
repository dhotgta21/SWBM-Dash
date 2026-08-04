'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { safeActionError } from '@/lib/errors'

export interface TrackedProductRow {
  id: string
  code: string
  name: string
  category: string | null
  unit: string
  stockQuantity: number
  reorderLevel: number
}

export async function getTrackedProducts(): Promise<{
  products?: TrackedProductRow[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, code, name, category, unit, stock_quantity, reorder_level')
    .eq('track_stock', true)
    .is('deleted_at', null)
    .order('name', { ascending: true })

  if (error) {
    return { error: safeActionError('stock.getTrackedProducts', error, 'Could not load tracked products.') }
  }

  return {
    products: (data || []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      unit: p.unit,
      stockQuantity: Number(p.stock_quantity),
      reorderLevel: Number(p.reorder_level),
    })),
  }
}

export async function updateProductStock(
  productId: string,
  quantity: number
): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || (!ctx.isAdmin && !ctx.permissions.products_edit)) {
    return { error: 'Not authorised' }
  }

  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: 'Stock quantity must be 0 or more.' }
  }

  // Round to the DB precision (numeric(12,3)) to avoid float drift.
  const roundedQuantity = Math.round(quantity * 1000) / 1000

  // Route through the SECURITY DEFINER RPC (called as the signed-in user, not
  // the service role) so the audit trigger tags the change as 'stock_take' and
  // attributes it to the real operator via auth.uid().
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_product_stock', {
    p_product_id: productId,
    p_quantity: roundedQuantity,
  })

  if (error) {
    return { error: safeActionError('stock.updateProductStock', error, 'Could not update stock.') }
  }

  revalidatePath('/admin/products')
  return {}
}

export interface StockTakeLogRow {
  id: string
  previousQuantity: number
  newQuantity: number
  delta: number
  source: string
  changedAt: string
  product: { id: string; code: string; name: string } | null
  changedBy: { id: string; email: string; full_name: string | null } | null
}

/**
 * Append-only history of stock quantity changes (manual takes + system/invoice
 * events), newest first. Read-only: rows are written by the DB trigger.
 */
export async function getStockTakeLogs(options?: {
  productId?: string
  limit?: number
}): Promise<{ logs?: StockTakeLogRow[]; error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const limit = Math.min(Math.max(options?.limit ?? 200, 1), 1000)

  const supabase = await createClient()
  let query = supabase
    .from('stock_take_logs')
    .select(
      `
      id,
      previous_quantity,
      new_quantity,
      source,
      changed_at,
      products(id, code, name),
      profiles:changed_by(id, email, full_name)
    `
    )
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (options?.productId) {
    query = query.eq('product_id', options.productId)
  }

  const { data, error } = await query

  if (error) {
    return { error: safeActionError('stock.getStockTakeLogs', error, 'Could not load stock history.') }
  }

  const logs: StockTakeLogRow[] = (data || []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const prev = Number(row.previous_quantity)
    const next = Number(row.new_quantity)
    return {
      id: row.id,
      previousQuantity: prev,
      newQuantity: next,
      delta: Math.round((next - prev) * 1000) / 1000,
      source: row.source,
      changedAt: row.changed_at,
      product: product ? { id: product.id, code: product.code, name: product.name } : null,
      changedBy: profile
        ? {
            id: profile.id as string,
            email: profile.email as string,
            full_name: profile.full_name as string | null,
          }
        : null,
    }
  })

  return { logs }
}

export interface StockAlertRow {
  id: string
  alertType: string
  source: string
  status: string
  quantityNeeded: number | null
  quantityOrdered: number | null
  expectedDeliveryDate: string | null
  quantityReceived: number | null
  receivedAt: string | null
  notes: string | null
  raisedAt: string
  product: { id: string; code: string; name: string } | null
  invoice: { id: string; document_number: string } | null
  raisedBy: { email: string; full_name: string | null } | null
}

export async function getStockAlerts(): Promise<{
  alerts?: StockAlertRow[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stock_audit_alerts')
    .select(
      `
      id,
      alert_type,
      source,
      status,
      quantity_needed,
      quantity_ordered,
      expected_delivery_date,
      quantity_received,
      received_at,
      notes,
      raised_at,
      products(id, code, name),
      invoices(id, document_number),
      profiles:raised_by(id, email, full_name)
    `
    )
    .in('status', ['open', 'ordered'])
    .order('raised_at', { ascending: false })

  if (error) {
    return { error: safeActionError('stock.getStockAlerts', error, 'Could not load stock alerts.') }
  }

  const result: StockAlertRow[] = (data || []).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const r = row as {
      quantity_ordered?: number | null
      expected_delivery_date?: string | null
      quantity_received?: number | null
      received_at?: string | null
    }
    return {
      id: row.id,
      alertType: row.alert_type,
      source: row.source,
      status: row.status,
      quantityNeeded: row.quantity_needed != null ? Number(row.quantity_needed) : null,
      quantityOrdered: r.quantity_ordered != null ? Number(r.quantity_ordered) : null,
      expectedDeliveryDate: r.expected_delivery_date ?? null,
      quantityReceived: r.quantity_received != null ? Number(r.quantity_received) : null,
      receivedAt: r.received_at ?? null,
      notes: row.notes,
      raisedAt: row.raised_at,
      product: product ? { id: product.id, code: product.code, name: product.name } : null,
      invoice: invoice ? { id: invoice.id, document_number: invoice.document_number } : null,
      raisedBy: profile
        ? { email: profile.email as string, full_name: profile.full_name as string | null }
        : null,
    }
  })

  return { alerts: result }
}

/**
 * Close an alert without goods-in (cancelled, no longer needed, etc.).
 */
export async function resolveStockAlert(alertId: string): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || (!ctx.isAdmin && !ctx.permissions.products_edit)) {
    return { error: 'Not authorised' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('stock_audit_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
    })
    .eq('id', alertId)
    .in('status', ['open', 'ordered'])

  if (error) {
    return { error: safeActionError('stock.resolveStockAlert', error, 'Could not resolve alert.') }
  }

  revalidatePath('/admin/products')
  return {}
}

/**
 * Mark alert as ordered with supplier. Works with or without stock qty tracking.
 * Optional quantity + expected delivery date drive the goods-in follow-up.
 */
export async function markStockAlertOrdered(
  alertId: string,
  options?: {
    quantityOrdered?: number | null
    expectedDeliveryDate?: string | null
    notes?: string | null
  }
): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || (!ctx.isAdmin && !ctx.permissions.products_edit)) {
    return { error: 'Not authorised' }
  }

  const qty =
    options?.quantityOrdered != null && Number.isFinite(options.quantityOrdered)
      ? Math.round(Number(options.quantityOrdered) * 1000) / 1000
      : null
  if (qty != null && qty < 0) {
    return { error: 'Quantity ordered must be 0 or more.' }
  }

  const expected = options?.expectedDeliveryDate?.trim() || null
  if (expected && Number.isNaN(new Date(expected).getTime())) {
    return { error: 'Expected delivery date is not valid.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('mark_stock_alert_ordered', {
    p_alert_id: alertId,
    p_operator_id: ctx.userId,
    p_quantity_ordered: qty,
    p_expected_delivery_date: expected,
    p_notes: options?.notes?.trim() || null,
  })

  if (error) {
    return {
      error: safeActionError('stock.markStockAlertOrdered', error, 'Could not mark alert as ordered.'),
    }
  }
  if (!data) {
    return { error: 'Alert not found or already closed.' }
  }

  revalidatePath('/admin/products')
  return {}
}

/**
 * Confirm supplier goods-in. When stock routing + track_stock are on,
 * product stock_quantity is increased by quantityReceived.
 */
export async function receiveStockAlertGoods(
  alertId: string,
  quantityReceived: number,
  notes?: string | null
): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || (!ctx.isAdmin && !ctx.permissions.products_edit)) {
    return { error: 'Not authorised' }
  }

  if (!Number.isFinite(quantityReceived) || quantityReceived <= 0) {
    return { error: 'Quantity received must be greater than zero.' }
  }

  const qty = Math.round(quantityReceived * 1000) / 1000
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('receive_stock_alert_goods', {
    p_alert_id: alertId,
    p_operator_id: ctx.userId,
    p_quantity_received: qty,
    p_notes: notes?.trim() || null,
  })

  if (error) {
    return {
      error: safeActionError(
        'stock.receiveStockAlertGoods',
        error,
        'Could not confirm goods received.'
      ),
    }
  }
  if (!data) {
    return { error: 'Alert not found or already closed.' }
  }

  revalidatePath('/admin/products')
  return {}
}
