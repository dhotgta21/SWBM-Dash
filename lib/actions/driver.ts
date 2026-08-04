'use server'

// Server actions for the phone-friendly driver area (/driver). Mirrors the
// picker actions but scoped to loads assigned to the signed-in driver.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeActionError } from '@/lib/errors'

export interface DriverQueueJob {
  loadId: string
  loadNumber: number
  invoiceId: string
  documentNumber: string
  orderNumber: string | null
  clientName: string
  deliveryAddress: string
  assignedAt: string | null
  itemCount: number
}

export interface DriverLoadItem {
  id: string
  productName: string
  productCode: string | null
  unit: string | null
  quantity: number
}

export interface DriverLoadDetail {
  loadId: string
  loadNumber: number
  loadStatus: string
  invoiceId: string
  documentNumber: string
  orderNumber: string | null
  clientName: string
  clientPhone: string | null
  deliveryAddress: string
  pickingStatus: string
  assignedAt: string | null
  items: DriverLoadItem[]
}

/**
 * Require the current user to be an active driver. Returns the user id.
 */
async function requireDriver(): Promise<{ userId: string; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { userId: '', error: 'Not authenticated' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active === false || profile.role !== 'driver') {
    return { userId: '', error: 'Not authorised' }
  }

  return { userId: user.id }
}

function formatAddress(invoice: {
  delivery_address_line_1?: string | null
  delivery_address_line_2?: string | null
  delivery_town?: string | null
  delivery_county?: string | null
  delivery_postcode?: string | null
}): string {
  return [
    invoice.delivery_address_line_1,
    invoice.delivery_address_line_2,
    invoice.delivery_town,
    invoice.delivery_county,
    invoice.delivery_postcode,
  ]
    .filter(Boolean)
    .join(', ')
}

function getClientName(client: {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
}): string {
  return (
    client.company_name ||
    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
    'Unknown'
  )
}

/**
 * Active jobs = printed loads assigned to me that still need delivering.
 * They leave the queue once marked delivered (load -> completed).
 */
export async function getDriverQueue(): Promise<{
  jobs?: DriverQueueJob[]
  error?: string
}> {
  const { userId, error } = await requireDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: loads, error: loadsError } = await adminClient
    .from('delivery_loads')
    .select(
      `
      id,
      load_number,
      assigned_at,
      invoice_id,
      delivery_load_items(id, status),
      invoices(
        id,
        document_number,
        order_number,
        picking_status,
        deleted_at,
        delivery_address_line_1,
        delivery_address_line_2,
        delivery_town,
        delivery_county,
        delivery_postcode,
        clients(first_name, last_name, company_name)
      )
    `
    )
    .eq('assigned_driver_id', userId)
    .eq('status', 'printed')
    .order('assigned_at', { ascending: true })

  if (loadsError) {
    return { error: safeActionError('driver.getDriverQueue', loadsError, 'Could not load jobs.') }
  }

  const jobs: DriverQueueJob[] = (loads || [])
    .filter((load) => {
      const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
      if (!invoice || invoice.deleted_at) return false
      // Hide anything already delivered (shouldn't happen for printed loads,
      // but be defensive).
      return invoice.picking_status !== 'delivered'
    })
    .map((load) => {
      const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
      const client = invoice
        ? Array.isArray(invoice.clients)
          ? invoice.clients[0]
          : invoice.clients
        : null
      return {
        loadId: load.id,
        loadNumber: load.load_number,
        invoiceId: load.invoice_id,
        documentNumber: invoice?.document_number || '',
        orderNumber: invoice?.order_number || null,
        clientName: getClientName(client || {}),
        deliveryAddress: formatAddress((invoice || {}) as unknown as Record<string, string>),
        assignedAt: load.assigned_at,
        // Only 'loaded' rows are physically on the vehicle — out_of_stock /
        // order rows must not inflate the badge (matches the printed
        // delivery note and stock reconciliation).
        itemCount: Array.isArray(load.delivery_load_items)
          ? load.delivery_load_items.filter((li) => li.status === 'loaded').length
          : 0,
      }
    })

  return { jobs }
}

/**
 * Full job detail for the driver screen. Refuses loads not assigned to me.
 */
export async function getDriverLoad(loadId: string): Promise<{
  job?: DriverLoadDetail
  error?: string
}> {
  const { userId, error } = await requireDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: load, error: loadError } = await adminClient
    .from('delivery_loads')
    .select(
      `
      id,
      load_number,
      status,
      assigned_at,
      assigned_driver_id,
      invoice_id,
      invoices(
        id,
        document_number,
        order_number,
        picking_status,
        deleted_at,
        delivery_address_line_1,
        delivery_address_line_2,
        delivery_town,
        delivery_county,
        delivery_postcode,
        clients(first_name, last_name, company_name, phone)
      ),
      delivery_load_items(
        id,
        quantity,
        status,
        invoice_items(product_name, product_code, unit)
      )
    `
    )
    .eq('id', loadId)
    // Only real delivery jobs: 'open' loads are picker working state, and
    // anything else should never reach the driver screen.
    .in('status', ['printed', 'completed'])
    .single()

  if (loadError || !load) {
    return { error: 'Job not found.' }
  }
  if (load.assigned_driver_id !== userId) {
    return { error: 'This job is not assigned to you.' }
  }

  const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
  // A soft-deleted order must not be deliverable: the mark-delivered RPC
  // would fail inside stock reconciliation and strand the load.
  if (!invoice || invoice.deleted_at) {
    return { error: 'This order has been removed.' }
  }
  const client = invoice
    ? Array.isArray(invoice.clients)
      ? invoice.clients[0]
      : invoice.clients
    : null

  const rawItems = Array.isArray(load.delivery_load_items) ? load.delivery_load_items : []
  // Only 'loaded' rows went on the vehicle — out_of_stock / order rows are
  // excluded from the printed delivery note and stock settle, so they must
  // not appear on the driver's deliverables list either.
  const items: DriverLoadItem[] = rawItems
    .filter((li) => li.status === 'loaded')
    .map((li) => {
    const ii = Array.isArray(li.invoice_items) ? li.invoice_items[0] : li.invoice_items
    return {
      id: li.id,
      productName: ii?.product_name || 'Unknown',
      productCode: ii?.product_code || null,
      unit: ii?.unit || null,
      quantity: Number(li.quantity),
    }
  })

  return {
    job: {
      loadId: load.id,
      loadNumber: load.load_number,
      loadStatus: load.status,
      invoiceId: load.invoice_id,
      documentNumber: invoice?.document_number || '',
      orderNumber: invoice?.order_number || null,
      clientName: getClientName(client || {}),
      clientPhone: client?.phone || null,
      deliveryAddress: formatAddress((invoice || {}) as unknown as Record<string, string>),
      pickingStatus: invoice?.picking_status || '',
      assignedAt: load.assigned_at,
      items,
    },
  }
}

/**
 * Mark an assigned load as delivered. Completes the load; when every load for
 * the invoice is complete the invoice becomes 'delivered' and stock settles.
 */
export async function markLoadDelivered(loadId: string): Promise<{
  delivered?: boolean
  invoiceId?: string
  error?: string
}> {
  const { userId, error } = await requireDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data, error: rpcError } = await adminClient.rpc('driver_mark_delivered', {
    p_load_id: loadId,
    p_driver_id: userId,
  })

  if (rpcError) {
    return { error: safeActionError('driver.markLoadDelivered', rpcError, 'Could not mark as delivered.') }
  }

  const result = (data || {}) as { invoice_id?: string; delivered?: boolean }
  const invoiceId = result.invoice_id

  revalidatePath('/driver')
  revalidatePath(`/driver/${loadId}`)
  if (invoiceId) {
    revalidatePath('/invoices')
    revalidatePath(`/invoices/${invoiceId}`)
    revalidatePath('/admin/products')
  }

  return { delivered: !!result.delivered, invoiceId }
}

/**
 * Recently completed loads for the driver History tab.
 */
export async function getDriverHistory(): Promise<{
  jobs?: DriverQueueJob[]
  error?: string
}> {
  const { userId, error } = await requireDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: loads, error: loadsError } = await adminClient
    .from('delivery_loads')
    .select(
      `
      id,
      load_number,
      assigned_at,
      completed_at,
      invoice_id,
      delivery_load_items(id, status),
      invoices(
        id,
        document_number,
        order_number,
        deleted_at,
        delivery_address_line_1,
        delivery_address_line_2,
        delivery_town,
        delivery_county,
        delivery_postcode,
        clients(first_name, last_name, company_name)
      )
    `
    )
    .eq('assigned_driver_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(30)

  if (loadsError) {
    return { error: safeActionError('driver.getDriverHistory', loadsError, 'Could not load history.') }
  }

  const jobs: DriverQueueJob[] = (loads || [])
    .filter((load) => {
      const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
      // Completed loads of soft-deleted orders have no value in history.
      return invoice && !invoice.deleted_at
    })
    .map((load) => {
      const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
      const client = invoice
        ? Array.isArray(invoice.clients)
          ? invoice.clients[0]
          : invoice.clients
        : null
      return {
        loadId: load.id,
        loadNumber: load.load_number,
        invoiceId: load.invoice_id,
        documentNumber: invoice?.document_number || '',
        orderNumber: invoice?.order_number || null,
        clientName: getClientName(client || {}),
        deliveryAddress: formatAddress((invoice || {}) as unknown as Record<string, string>),
        assignedAt: load.assigned_at,
        itemCount: Array.isArray(load.delivery_load_items)
          ? load.delivery_load_items.filter((li) => li.status === 'loaded').length
          : 0,
      }
    })

  return { jobs }
}
