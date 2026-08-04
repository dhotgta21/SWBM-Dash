'use server'

// Operator-facing actions for overdue-delivery alerts: read the open alerts
// shown on the dashboard, a count for the sidebar badge, and a dismiss/resolve
// action. Raising/resolving alerts is done by raise_undelivered_alerts() in
// the DB (pg_cron every 30 min + triggers on delivery_loads/invoices).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { safeActionError } from '@/lib/errors'

export interface DeliveryAlert {
  id: string
  invoiceId: string
  loadId: string | null
  documentNumber: string
  clientName: string
  driverName: string | null
  createdAt: string
}

function clientName(client: {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
} | null | undefined): string {
  if (!client) return 'Unknown'
  return (
    client.company_name ||
    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
    'Unknown'
  )
}

function canSeeAlerts(ctx: Awaited<ReturnType<typeof getOperatorContext>>): boolean {
  if (!ctx) return false
  return ctx.isAdmin || ctx.permissions.see_invoices === true
}

export async function getOpenDeliveryAlerts(): Promise<{
  alerts?: DeliveryAlert[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!canSeeAlerts(ctx)) return { error: 'Not authorised' }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('delivery_alerts')
    .select(
      `
      id,
      invoice_id,
      load_id,
      driver_id,
      created_at,
      invoices(document_number, clients(first_name, last_name, company_name)),
      profiles:driver_id(full_name, email)
    `
    )
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) {
    return { error: safeActionError('delivery-alerts.list', error, 'Could not load delivery alerts.') }
  }

  const alerts: DeliveryAlert[] = (data || []).map((row) => {
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
    const client = invoice
      ? Array.isArray(invoice.clients)
        ? invoice.clients[0]
        : invoice.clients
      : null
    const driver = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      loadId: row.load_id,
      documentNumber: invoice?.document_number || '',
      clientName: clientName(client),
      driverName: driver?.full_name || driver?.email || null,
      createdAt: row.created_at,
    }
  })

  return { alerts }
}

export async function getOverdueDeliveryCount(): Promise<number> {
  const ctx = await getOperatorContext()
  if (!canSeeAlerts(ctx)) return 0

  const adminClient = createAdminClient()
  const { count, error } = await adminClient
    .from('delivery_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')

  if (error) {
    console.error('delivery-alerts count failed:', error)
    return 0
  }
  return count ?? 0
}

export async function resolveDeliveryAlert(alertId: string): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx || !ctx.isAdmin) return { error: 'Not authorised' }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('delivery_alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('status', 'open')

  if (error) {
    return { error: safeActionError('delivery-alerts.resolve', error, 'Could not dismiss alert.') }
  }

  revalidatePath('/dashboard')
  revalidatePath('/invoices')
  return {}
}
