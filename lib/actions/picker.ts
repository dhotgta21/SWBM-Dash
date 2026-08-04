'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { safeActionError } from '@/lib/errors'

export interface PickerQueueInvoice {
  id: string
  documentNumber: string
  orderNumber: string | null
  clientName: string
  deliveryAddress: string
  itemCount: number
  pickingStatus: string
}

export interface PickerInvoiceItem {
  id: string
  productId: string | null
  productName: string
  productCode: string | null
  unit: string | null
  quantity: number
  imageUrl: string | null
  trackStock: boolean
  stockQuantity: number | null
  reorderLevel: number | null
  remainingQuantity: number
}

export interface PickerInvoiceDetail {
  id: string
  documentNumber: string
  orderNumber: string | null
  clientName: string
  clientPhone: string | null
  deliveryAddress: string
  pickingStatus: string
  updatedAt: string
  hasStockTrackedItems: boolean
  items: PickerInvoiceItem[]
  /** The picker's own in-progress (open) load, if any — used to rehydrate
   *  the picking screen so a half-finished session is resumable. */
  openLoad: {
    id: string
    loadNumber: number
    items: {
      invoiceItemId: string
      quantity: number
      status: string
    }[]
  } | null
  existingLoads: {
    id: string
    loadNumber: number
    status: string
    items: {
      invoiceItemId: string
      quantity: number
      status: string
    }[]
  }[]
}

export interface LoadItemInput {
  invoiceItemId: string
  /** Quantity actually loaded for this line (0 = nothing loaded). */
  loadedQuantity: number
  /** Whether the remaining (unloaded) quantity is out of stock. */
  outOfStockRemainder: boolean
}

/**
 * Require the current user to be an active picker. Returns the user id.
 */
async function requirePicker(): Promise<{ userId: string; error?: string }> {
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

  if (!profile || profile.is_active === false || profile.role !== 'picker') {
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
  const parts = [
    invoice.delivery_address_line_1,
    invoice.delivery_address_line_2,
    invoice.delivery_town,
    invoice.delivery_county,
    invoice.delivery_postcode,
  ].filter(Boolean)
  return parts.join(', ')
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

function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Sum of quantities that have been accounted for on loads, regardless of
 * whether they were loaded, marked out of stock, or placed on order. This is
 * what drives the picker's "remaining" figure so a line disappears once it
 * has been handled in any way.
 */
async function getAccountedQuantitySoFar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceItemId: string,
  statuses: ('open' | 'printed' | 'completed')[] = ['open', 'printed', 'completed']
): Promise<number> {
  const { data } = await supabase
    .from('delivery_load_items')
    .select('quantity, delivery_loads!inner(status)')
    .eq('invoice_item_id', invoiceItemId)
    .in('delivery_loads.status', statuses)

  if (!data) return 0
  return data.reduce((sum, row) => sum + Number(row.quantity), 0)
}

/**
 * List of invoices the picker needs to work on.
 */
export async function getPickerQueue(): Promise<{
  invoices?: PickerQueueInvoice[]
  error?: string
}> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: invoices, error: invoicesError } = await adminClient
    .from('invoices')
    .select(
      'id, document_number, order_number, picking_status, delivery_address_line_1, delivery_address_line_2, delivery_town, delivery_county, delivery_postcode, clients(first_name, last_name, company_name), invoice_items(id, quantity)'
    )
    .eq('type', 'invoice')
    .in('status', ['sent', 'partial'])
    .not('picking_status', 'in', '(completed,delivered)')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (invoicesError) {
    return { error: safeActionError('picker.getPickerQueue', invoicesError, 'Could not load queue.') }
  }

  // An order only belongs in the queue while it still has items to load.
  // Quantities already on printed/completed loads are accounted for, so a
  // fully loaded order (picking_status 'loaded', or any stale state) drops
  // out of the queue even before it is formally marked completed.
  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const accountedByItem = new Map<string, number>()
  if (invoiceIds.length > 0) {
    const { data: loadRows, error: loadRowsError } = await adminClient
      .from('delivery_load_items')
      .select('invoice_item_id, quantity, delivery_loads!inner(invoice_id, status)')
      .in('delivery_loads.invoice_id', invoiceIds)
      .in('delivery_loads.status', ['printed', 'completed'])

    if (loadRowsError) {
      return { error: safeActionError('picker.getPickerQueue', loadRowsError, 'Could not load queue.') }
    }
    for (const row of loadRows || []) {
      accountedByItem.set(
        row.invoice_item_id,
        (accountedByItem.get(row.invoice_item_id) || 0) + Number(row.quantity)
      )
    }
  }

  const result: PickerQueueInvoice[] = (invoices || [])
    .filter((invoice) => {
      const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []
      return items.some(
        (item) => Number(item.quantity) - (accountedByItem.get(item.id) || 0) > 0
      )
    })
    .map((invoice) => {
      const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
      const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []
      // Badge = lines that still have quantity to pick, not the total line
      // count (most may already be on printed loads).
      const remainingItemCount = items.filter(
        (item) => Number(item.quantity) - (accountedByItem.get(item.id) || 0) > 0
      ).length
      return {
        id: invoice.id,
        documentNumber: invoice.document_number,
        orderNumber: invoice.order_number,
        clientName: getClientName(client || {}),
        deliveryAddress: formatAddress(invoice as unknown as Record<string, string>),
        itemCount: remainingItemCount,
        pickingStatus: invoice.picking_status,
      }
    })

  return { invoices: result }
}

/**
 * Full invoice detail for the picking screen.
 */
export async function getInvoiceForPicking(invoiceId: string): Promise<{
  invoice?: PickerInvoiceDetail
  error?: string
}> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: invoice, error: invoiceError } = await adminClient
    .from('invoices')
    .select(
      `
      id,
      document_number,
      order_number,
      picking_status,
      updated_at,
      delivery_address_line_1,
      delivery_address_line_2,
      delivery_town,
      delivery_county,
      delivery_postcode,
      clients(first_name, last_name, company_name, phone),
      invoice_items(
        id,
        product_id,
        product_name,
        product_code,
        unit,
        quantity,
        products(id, image_url, track_stock, stock_quantity, reorder_level)
      )
    `
    )
    .eq('id', invoiceId)
    .eq('type', 'invoice')
    .is('deleted_at', null)
    // Mirror the queue's scope: pickers may only open orders that are
    // actually pickable — not drafts, paid invoices, or delivered orders
    // (previously any invoice UUID returned full client/item detail).
    .in('status', ['sent', 'partial'])
    .not('picking_status', 'in', '(completed,delivered)')
    .single()

  if (invoiceError || !invoice) {
    return { error: 'Invoice not found.' }
  }

  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients

  const items: PickerInvoiceItem[] = await Promise.all(
    (Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []).map(async (item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products
      // Only committed (printed/completed) loads consume the remaining qty.
      // Open loads are ephemeral working state that save_pick_state rewrites,
      // so counting them would show "0 remaining" after any interrupted save.
      const accountedSoFar = await getAccountedQuantitySoFar(adminClient, item.id, [
        'printed',
        'completed',
      ])
      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        productCode: item.product_code,
        unit: item.unit,
        quantity: Number(item.quantity),
        imageUrl: product?.image_url || null,
        trackStock: product?.track_stock || false,
        stockQuantity: product?.stock_quantity != null ? Number(product.stock_quantity) : null,
        reorderLevel: product?.reorder_level != null ? Number(product.reorder_level) : null,
        remainingQuantity: Math.max(0, roundQty(Number(item.quantity) - accountedSoFar)),
      }
    })
  )

  const { data: loads } = await adminClient
    .from('delivery_loads')
    .select(
      'id, load_number, status, picked_by, delivery_load_items(invoice_item_id, quantity, status)'
    )
    .eq('invoice_id', invoiceId)
    .order('load_number', { ascending: true })

  const existingLoads = (loads || []).map((load) => ({
    id: load.id,
    loadNumber: load.load_number,
    status: load.status,
    items: (Array.isArray(load.delivery_load_items) ? load.delivery_load_items : []).map((li) => ({
      invoiceItemId: li.invoice_item_id,
      quantity: Number(li.quantity),
      status: li.status,
    })),
  }))

  const openLoadRow = (loads || []).find(
    (load) => load.status === 'open' && load.picked_by === userId
  )
  const openLoad = openLoadRow
    ? {
        id: openLoadRow.id,
        loadNumber: openLoadRow.load_number,
        items: (
          Array.isArray(openLoadRow.delivery_load_items)
            ? openLoadRow.delivery_load_items
            : []
        ).map((li) => ({
          invoiceItemId: li.invoice_item_id,
          quantity: Number(li.quantity),
          status: li.status,
        })),
      }
    : null

  return {
    invoice: {
      id: invoice.id,
      documentNumber: invoice.document_number,
      orderNumber: invoice.order_number,
      clientName: getClientName(client || {}),
      clientPhone: client?.phone || null,
      deliveryAddress: formatAddress(invoice as unknown as Record<string, string>),
      pickingStatus: invoice.picking_status,
      updatedAt: invoice.updated_at,
      hasStockTrackedItems: items.some((item) => item.trackStock),
      items,
      openLoad,
      existingLoads,
    },
  }
}

/**
 * Save the current pick state to an open load. Does not print yet.
 */
export async function savePickState(
  invoiceId: string,
  items: LoadItemInput[],
  _invoiceUpdatedAt: string
): Promise<{ loadId?: string; error?: string }> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  // Verify the invoice is still available for picking. We do not compare
  // updated_at here because any unrelated invoice change (payment, note edit)
  // would falsely trigger a conflict. The row lock inside the RPC plus the
  // remaining-quantity checks below are the real guards.
  const { data: invoice } = await adminClient
    .from('invoices')
    .select('id, picking_status, status, type')
    .eq('id', invoiceId)
    .eq('type', 'invoice')
    .in('status', ['sent', 'partial'])
    .not('picking_status', 'in', '(completed,delivered)')
    .is('deleted_at', null)
    .single()

  if (!invoice) {
    return { error: 'Invoice not available for picking.' }
  }

  // Validate quantities against committed (printed/completed) loads only,
  // because the open load is about to be rewritten. Each line can contribute
  // up to two rows to the load: a `loaded` row with the loaded quantity and
  // an `out_of_stock` row for the missing remainder.
  const rpcItems: {
    invoiceItemId: string
    quantity: number
    status: string
    alertType: string | null
  }[] = []
  const oosLines: { invoiceItemId: string; productId: string | null; missing: number }[] = []

  for (const item of items) {
    const { data: line } = await adminClient
      .from('invoice_items')
      .select('quantity, product_id')
      .eq('id', item.invoiceItemId)
      .eq('invoice_id', invoiceId)
      .single()
    if (!line) {
      return { error: 'One or more items do not belong to this invoice.' }
    }

    const accountedSoFar = await getAccountedQuantitySoFar(adminClient, item.invoiceItemId, [
      'printed',
      'completed',
    ])
    const remaining = Math.max(0, roundQty(Number(line.quantity) - accountedSoFar))
    const loaded = roundQty(Number(item.loadedQuantity) || 0)

    if (loaded < 0 || loaded > remaining) {
      return { error: 'Invalid quantity for one or more items.' }
    }

    const missing = roundQty(remaining - loaded)

    if (loaded > 0) {
      rpcItems.push({
        invoiceItemId: item.invoiceItemId,
        quantity: loaded,
        status: 'loaded',
        alertType: null,
      })
    }

    if (item.outOfStockRemainder && missing > 0) {
      rpcItems.push({
        invoiceItemId: item.invoiceItemId,
        quantity: missing,
        status: 'out_of_stock',
        alertType: 'out_of_stock',
      })
      oosLines.push({
        invoiceItemId: item.invoiceItemId,
        productId: line.product_id,
        missing,
      })
    }
  }

  // Determine the next invoice picking status.
  const hasPrintedLoad = await adminClient
    .from('delivery_loads')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .in('status', ['printed', 'completed'])

  const nextPickingStatus =
    hasPrintedLoad.count && hasPrintedLoad.count > 0 ? 'partially_loaded' : 'in_progress'

  const pickingStartedAt =
    invoice.picking_status === 'not_started' ? new Date().toISOString() : null

  const { data: loadId, error: rpcError } = await adminClient.rpc('save_pick_state', {
    p_invoice_id: invoiceId,
    p_picker_id: userId,
    p_items: rpcItems,
    p_next_picking_status: nextPickingStatus,
    p_picking_started_at: pickingStartedAt,
  })

  if (rpcError || !loadId) {
    return { error: safeActionError('picker.savePickState', rpcError, 'Could not save load.') }
  }

  // Manage stock alerts for out-of-stock remainder lines. We avoid upsert
  // with an onConflict clause because the unique index may not exist, so we
  // update any existing open alert or insert a new one. Alerts in 'ordered'
  // state are matched too — otherwise a re-raise inserts a second OPEN alert
  // and the review queue double-counts the line.
  for (const line of oosLines) {
    const { data: existingAlert } = await adminClient
      .from('stock_audit_alerts')
      .select('id, status')
      .eq('invoice_item_id', line.invoiceItemId)
      .eq('alert_type', 'out_of_stock')
      .eq('source', 'picker')
      .in('status', ['open', 'ordered'])
      .maybeSingle()

    if (existingAlert) {
      // Keep the existing status (an 'ordered' alert stays ordered); just
      // refresh the quantity.
      const { error: alertUpdateError } = await adminClient
        .from('stock_audit_alerts')
        .update({
          quantity_needed: line.missing,
          raised_by: userId,
          raised_at: new Date().toISOString(),
        })
        .eq('id', existingAlert.id)

      if (alertUpdateError) {
        console.error('picker.savePickState alert update failed:', alertUpdateError)
      }
    } else {
      const { error: alertInsertError } = await adminClient.from('stock_audit_alerts').insert({
        product_id: line.productId,
        invoice_item_id: line.invoiceItemId,
        invoice_id: invoiceId,
        alert_type: 'out_of_stock',
        source: 'picker',
        quantity_needed: line.missing,
        raised_by: userId,
        status: 'open',
      })

      if (alertInsertError) {
        console.error('picker.savePickState alert insert failed:', alertInsertError)
      }
    }
  }

  revalidatePath('/picker')
  revalidatePath(`/picker/${invoiceId}`)
  return { loadId }
}


/**
 * Confirm a load and mark it ready to print. Goes through the SECURITY
 * DEFINER confirm_load RPC (migration 132) so this does not depend on
 * table grants and the whole step is atomic.
 */
export async function confirmLoad(
  invoiceId: string,
  loadId: string,
  isSplit: boolean
): Promise<{ load?: { id: string; loadNumber: number }; error?: string }> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: loadNumber, error: rpcError } = await adminClient.rpc('confirm_load', {
    p_invoice_id: invoiceId,
    p_load_id: loadId,
    p_picker_id: userId,
    p_is_split: isSplit,
  })

  if (rpcError || loadNumber == null) {
    const msg = rpcError?.message || ''
    if (msg.startsWith('LOAD_MISSING')) {
      return { error: 'Could not find that load. Please refresh and try again.' }
    }
    if (msg.startsWith('LOAD_WRONG_INVOICE')) {
      return { error: 'That load belongs to a different order.' }
    }
    if (msg.startsWith('LOAD_NOT_OPEN')) {
      const status = (msg.split(':')[1] || 'processed').replace('_', ' ')
      return { error: `That load is already ${status}.` }
    }
    if (msg.startsWith('LOAD_WRONG_PICKER')) {
      return { error: 'That load is being handled by another picker.' }
    }
    if (msg.startsWith('LOAD_NO_ITEMS')) {
      return { error: 'A load must contain at least one item.' }
    }
    if (msg.startsWith('LOAD_LIMIT_REACHED')) {
      const max = msg.split(':')[1] || '5'
      return {
        error: `This order already has the maximum of ${max} loads. Merge or delete a load first, or raise the limit in Settings → Company → Deliveries.`,
      }
    }
    if (msg.startsWith('LOAD_OVER_ALLOCATED')) {
      return {
        error:
          'Another load for this order was confirmed just now and there is not enough remaining quantity. Refresh and adjust the quantities before confirming.',
      }
    }
    return { error: safeActionError('picker.confirmLoad', rpcError, 'Could not confirm load.') }
  }

  // Confirming a load may have fully loaded lines that were previously
  // flagged out-of-stock (e.g. the picker moved the line back and loaded it
  // on this load). Resolve any now-stale picker alerts so the invoice does
  // not stay stuck in "Review required" — which blocks payment.
  await resolveStaleOosAlerts(adminClient, invoiceId, userId)

  revalidatePath('/picker')
  revalidatePath(`/picker/${invoiceId}`)
  revalidatePath('/picker/loads')
  return { load: { id: loadId, loadNumber: Number(loadNumber) } }
}

/**
 * Mark an order as completed after all loads are printed.
 *
 * Goes through the mark_order_completed SECURITY DEFINER RPC so it does not
 * depend on direct table GRANTs for service_role (the previous direct
 * writes failed with 42501 on public.invoices).
 */
export async function markOrderCompleted(invoiceId: string): Promise<{ error?: string }> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { error: rpcError } = await adminClient.rpc('mark_order_completed', {
    p_invoice_id: invoiceId,
    p_picker_id: userId,
  })

  if (rpcError) {
    const message = rpcError.message || ''
    if (message.includes('ORDER_NOT_COMPLETABLE')) {
      return { error: 'Order cannot be marked as completed.' }
    }
    if (message.includes('ITEMS_REMAINING')) {
      return { error: 'Some items have not been loaded yet.' }
    }
    return { error: safeActionError('picker.markOrderCompleted', rpcError, 'Could not complete order.') }
  }

  // Same stale-alert cleanup as confirmLoad: completing the order means all
  // remaining quantities are on printed loads, so any out-of-stock alert
  // whose line is no longer marked out_of_stock must not keep blocking
  // payment on the invoice.
  await resolveStaleOosAlerts(adminClient, invoiceId, userId)

  revalidatePath('/picker')
  revalidatePath('/picker/loads')
  revalidatePath('/driver')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/admin/products')
  return {}
}

/**
 * Reprint a previously printed/completed load.
 */
export async function reprintLoad(loadId: string): Promise<{
  load?: { id: string; loadNumber: number; invoiceId: string }
  error?: string
}> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: load } = await adminClient
    .from('delivery_loads')
    .select('id, invoice_id, load_number, status, picked_by')
    .eq('id', loadId)
    .in('status', ['printed', 'completed'])
    .single()

  if (!load || load.picked_by !== userId) {
    return { error: 'Load not found.' }
  }

  return { load: { id: load.id, loadNumber: load.load_number, invoiceId: load.invoice_id } }
}

/**
 * List today's loads for the current picker.
 */
export async function getTodayLoads(): Promise<{
  loads?: {
    id: string
    invoiceId: string
    documentNumber: string
    loadNumber: number
    status: string
    printedAt: string | null
    itemCount: number
  }[]
  error?: string
}> {
  const { userId, error } = await requirePicker()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  // Local-midnight boundary kept as an instant (ms): comparing parsed Date
  // instants avoids string-comparing DB timestamptz values ('+00:00',
  // microsecond precision) against a 'Z' ISO string, which mis-files
  // near-midnight loads.
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const { data: loads, error: loadsError } = await adminClient
    .from('delivery_loads')
    .select(
      'id, invoice_id, load_number, status, printed_at, created_at, invoices(document_number), delivery_load_items(id)'
    )
    .eq('picked_by', userId)
    .in('status', ['open', 'printed', 'completed'])
    .order('created_at', { ascending: false })

  if (loadsError) {
    return { error: safeActionError('picker.getTodayLoads', loadsError, 'Could not load loads.') }
  }

  // Open loads are always shown (resumable in-progress work); printed /
  // completed loads only for today, keyed on when they were printed.
  const startOfDayMs = startOfDay.getTime()
  const result = (loads || [])
    .filter((load) => {
      if (load.status === 'open') return true
      return new Date(load.printed_at || load.created_at).getTime() >= startOfDayMs
    })
    .map((load) => {
    const invoice = Array.isArray(load.invoices) ? load.invoices[0] : load.invoices
    const items = Array.isArray(load.delivery_load_items) ? load.delivery_load_items : []
    return {
      id: load.id,
      invoiceId: load.invoice_id,
      documentNumber: invoice?.document_number || '',
      loadNumber: load.load_number,
      status: load.status,
      printedAt: load.printed_at,
      itemCount: items.length,
    }
  })

  return { loads: result }
}

export interface InvoiceLoadDetail {
  id: string
  loadNumber: number
  status: string
  printedAt: string | null
  completedAt: string | null
  pickedBy: string | null
  assignedDriverId: string | null
  assignedDriverName: string | null
  items: {
    id: string
    invoiceItemId: string
    quantity: number
    status: string
    productName: string
    productCode: string | null
  }[]
}

/**
 * Load the picking/delivery history for an invoice. Available to admin/staff.
 */
export async function getInvoiceLoads(invoiceId: string): Promise<{
  loads?: InvoiceLoadDetail[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()

  const { data: loads, error: loadsError } = await adminClient
    .from('delivery_loads')
    .select(
      `
      id,
      load_number,
      status,
      printed_at,
      completed_at,
      picked_by,
      assigned_driver_id,
      delivery_load_items(
        id,
        invoice_item_id,
        quantity,
        status,
        invoice_items(product_name, product_code)
      )
    `
    )
    .eq('invoice_id', invoiceId)
    .order('load_number', { ascending: true })

  if (loadsError) {
    return { error: safeActionError('picker.getInvoiceLoads', loadsError, 'Could not load delivery history.') }
  }

  // Resolve driver display names in one query (profiles is not a FK embed here).
  const driverIds = [
    ...new Set(
      (loads || [])
        .map((load) => load.assigned_driver_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  const driverNameById = new Map<string, string>()
  if (driverIds.length > 0) {
    const { data: drivers } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .in('id', driverIds)
    for (const d of drivers || []) {
      driverNameById.set(d.id, d.full_name || d.email || 'Driver')
    }
  }

  const result: InvoiceLoadDetail[] = (loads || []).map((load) => {
    const items = Array.isArray(load.delivery_load_items) ? load.delivery_load_items : []
    const assignedDriverId = load.assigned_driver_id || null
    return {
      id: load.id,
      loadNumber: load.load_number,
      status: load.status,
      printedAt: load.printed_at,
      completedAt: load.completed_at,
      pickedBy: load.picked_by,
      assignedDriverId,
      assignedDriverName: assignedDriverId ? driverNameById.get(assignedDriverId) || 'Driver' : null,
      items: items.map((li) => {
        const invoiceItem = Array.isArray(li.invoice_items) ? li.invoice_items[0] : li.invoice_items
        return {
          id: li.id,
          invoiceItemId: li.invoice_item_id,
          quantity: Number(li.quantity),
          status: li.status,
          productName: invoiceItem?.product_name || 'Unknown',
          productCode: invoiceItem?.product_code || null,
        }
      }),
    }
  })

  return { loads: result }
}

/**
 * Admin/staff override: mark an invoice as delivered.
 *
 * Goes through the mark_invoice_delivered_admin SECURITY DEFINER RPC (migration
 * 154) so the invoice UPDATE does not depend on a direct service_role GRANT
 * on public.invoices. Same pattern as mark_order_completed (134) and
 * driver_mark_delivered (140/147). The RPC atomically:
 *   1. completes printed loads
 *   2. abandons open draft loads
 *   3. stamps the invoice picking_status='delivered'
 *   4. reconciles stock from the loads (only when loads exist)
 * All-or-nothing — if anything inside fails, the whole completion rolls back
 * so the invoice is never left in a half-state.
 *
 * Self-heals a prior failed attempt: the load ops become no-ops, the
 * invoice UPDATE runs, the stock reconcile runs.
 */
export async function markInvoiceDelivered(invoiceId: string): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!ctx.isAdmin && !ctx.permissions.invoices_change_status) {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()

  const { error: rpcError } = await adminClient.rpc('mark_invoice_delivered_admin', {
    p_invoice_id: invoiceId,
  })

  if (rpcError) {
    const message = (rpcError.message || '').toString()
    // The RPC raises P0002 / P0001 for the user-facing cases; map them to
    // the same friendly messages the previous direct-write action used so
    // the UI doesn't change.
    if (rpcError.code === 'P0002' || /not found/i.test(message)) {
      return { error: 'Invoice not found or not available.' }
    }
    if (rpcError.code === 'P0001' && /already marked as delivered/i.test(message)) {
      return { error: 'Order is already marked as delivered.' }
    }
    return { error: safeActionError('picker.markInvoiceDelivered', rpcError, 'Could not mark delivered.') }
  }

  // The RPC has now settled stock from the loads. Any out-of-stock alerts
  // that were raised by abandoned draft loads are stale — close any that no
  // longer have an OOS row on a committed load. Runs after the RPC because
  // the RPC handles stock first, so this check is against the final state.
  await resolveStaleOosAlerts(adminClient, invoiceId, ctx.userId)

  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/admin/products')
  revalidatePath('/picker')
  revalidatePath('/picker/loads')
  revalidatePath('/driver')
  return {}
}

/* =============================================================================
 * Office load management — create / edit / delete printed loads from the
 * dashboard invoice Loads tab, as an alternative to the picker flow. Gated to
 * admin or invoices_edit (mirrors canEditDoc on the invoice page). Uses direct
 * service-role writes, which migration 131 grants for the load tables.
 * ========================================================================== */

export interface InvoiceOrderLine {
  invoiceItemId: string
  productName: string
  productCode: string | null
  unit: string | null
  ordered: number
  accounted: number
  remaining: number
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>

async function requireOfficeLoadManager(): Promise<{ userId?: string; error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!ctx.isAdmin && !ctx.permissions.invoices_edit) {
    return { error: 'Not authorised' }
  }
  return { userId: ctx.userId }
}

async function getManageableInvoice(adminClient: AdminClient, invoiceId: string) {
  const { data } = await adminClient
    .from('invoices')
    .select('id, picking_status')
    .eq('id', invoiceId)
    .eq('type', 'invoice')
    .in('status', ['sent', 'partial'])
    .neq('picking_status', 'delivered')
    .is('deleted_at', null)
    .maybeSingle()
  return data
}

/** Accounted qty on printed/completed loads, optionally ignoring one load. */
async function getCommittedAccounted(
  adminClient: AdminClient,
  invoiceItemId: string,
  excludeLoadId?: string
): Promise<number> {
  const { data } = await adminClient
    .from('delivery_load_items')
    .select('quantity, delivery_loads!inner(id, status)')
    .eq('invoice_item_id', invoiceItemId)
    .in('delivery_loads.status', ['printed', 'completed'])

  if (!data) return 0
  return data.reduce((sum, row) => {
    const load = Array.isArray(row.delivery_loads) ? row.delivery_loads[0] : row.delivery_loads
    if (excludeLoadId && load?.id === excludeLoadId) return sum
    return sum + Number(row.quantity)
  }, 0)
}

interface ValidatedOfficeLoad {
  rows: { invoiceItemId: string; quantity: number; status: string }[]
  oosLines: { invoiceItemId: string; productId: string | null; missing: number }[]
}

/** Mirror of savePickState's per-line validation (picker.ts savePickState). */
async function validateOfficeLoadItems(
  adminClient: AdminClient,
  invoiceId: string,
  items: LoadItemInput[],
  excludeLoadId?: string
): Promise<{ validated?: ValidatedOfficeLoad; error?: string }> {
  const rows: ValidatedOfficeLoad['rows'] = []
  const oosLines: ValidatedOfficeLoad['oosLines'] = []

  for (const item of items) {
    const { data: line } = await adminClient
      .from('invoice_items')
      .select('quantity, product_id')
      .eq('id', item.invoiceItemId)
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null)
      .single()
    if (!line) {
      return { error: 'One or more items do not belong to this invoice.' }
    }

    const accountedSoFar = await getCommittedAccounted(adminClient, item.invoiceItemId, excludeLoadId)
    const remaining = Math.max(0, roundQty(Number(line.quantity) - accountedSoFar))
    const loaded = roundQty(Number(item.loadedQuantity) || 0)

    if (loaded < 0 || loaded > remaining) {
      return { error: 'Invalid quantity for one or more items.' }
    }

    const missing = roundQty(remaining - loaded)

    if (loaded > 0) {
      rows.push({ invoiceItemId: item.invoiceItemId, quantity: loaded, status: 'loaded' })
    }
    if (item.outOfStockRemainder && missing > 0) {
      rows.push({ invoiceItemId: item.invoiceItemId, quantity: missing, status: 'out_of_stock' })
      oosLines.push({ invoiceItemId: item.invoiceItemId, productId: line.product_id, missing })
    }
  }

  if (rows.length === 0) {
    return { error: 'Add at least one item to the load.' }
  }

  return { validated: { rows, oosLines } }
}

/** Update-or-insert picker OOS alerts (same pattern as savePickState). */
async function upsertOosAlerts(
  adminClient: AdminClient,
  invoiceId: string,
  userId: string,
  oosLines: ValidatedOfficeLoad['oosLines']
) {
  for (const line of oosLines) {
    // Match alerts in 'ordered' state too — otherwise a re-raise inserts a
    // second OPEN alert for the same line and the review queue (which shows
    // both open and ordered) double-counts it.
    const { data: existingAlert } = await adminClient
      .from('stock_audit_alerts')
      .select('id, status')
      .eq('invoice_item_id', line.invoiceItemId)
      .eq('alert_type', 'out_of_stock')
      .eq('source', 'picker')
      .in('status', ['open', 'ordered'])
      .maybeSingle()

    if (existingAlert) {
      // Keep the existing status (an 'ordered' alert stays ordered — the
      // purchase is already in flight); just refresh the quantity.
      await adminClient
        .from('stock_audit_alerts')
        .update({
          quantity_needed: line.missing,
          raised_by: userId,
          raised_at: new Date().toISOString(),
        })
        .eq('id', existingAlert.id)
    } else {
      await adminClient.from('stock_audit_alerts').insert({
        product_id: line.productId,
        invoice_item_id: line.invoiceItemId,
        invoice_id: invoiceId,
        alert_type: 'out_of_stock',
        source: 'picker',
        quantity_needed: line.missing,
        raised_by: userId,
        status: 'open',
      })
    }
  }
}

/**
 * After an office edit/delete, resolve review alerts whose line no longer has
 * an out-of-stock row on any printed/completed load, so the review queue and
 * the payment block stay truthful.
 */
async function resolveStaleOosAlerts(adminClient: AdminClient, invoiceId: string, userId: string) {
  const { data: alerts } = await adminClient
    .from('stock_audit_alerts')
    .select('id, invoice_item_id')
    .eq('invoice_id', invoiceId)
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])

  for (const alert of alerts || []) {
    if (!alert.invoice_item_id) continue
    const { count } = await adminClient
      .from('delivery_load_items')
      .select('delivery_loads!inner(status)', { count: 'exact', head: true })
      .eq('invoice_item_id', alert.invoice_item_id)
      .eq('status', 'out_of_stock')
      .in('delivery_loads.status', ['printed', 'completed'])

    if ((count ?? 0) === 0) {
      await adminClient
        .from('stock_audit_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: userId,
        })
        .eq('id', alert.id)
    }
  }
}

/**
 * Recompute picking_status from what the printed/completed loads cover.
 * May downgrade 'completed' when editing frees up items (the save_pick_state
 * RPC refuses 'completed' invoices, so the order must become pickable again);
 * never touches 'delivered'.
 */
async function recomputeInvoicePickingStatus(adminClient: AdminClient, invoiceId: string) {
  const { data: invoice } = await adminClient
    .from('invoices')
    .select('id, picking_status')
    .eq('id', invoiceId)
    .single()
  if (!invoice || invoice.picking_status === 'delivered') return

  const { data: items } = await adminClient
    .from('invoice_items')
    .select('id, quantity')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)

  let totalRemaining = 0
  let totalAccounted = 0
  for (const item of items || []) {
    const accounted = await getCommittedAccounted(adminClient, item.id)
    totalAccounted += accounted
    totalRemaining += Math.max(0, roundQty(Number(item.quantity) - accounted))
  }

  const { count: loadCount } = await adminClient
    .from('delivery_loads')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)

  let next: string
  if ((items || []).length > 0 && totalRemaining === 0) {
    next = 'loaded'
  } else if (totalAccounted > 0) {
    next = 'partially_loaded'
  } else {
    next = (loadCount ?? 0) > 0 ? 'in_progress' : 'not_started'
  }

  const now = new Date().toISOString()
  const updates: Record<string, string> = { picking_status: next }
  if (next === 'loaded' && invoice.picking_status !== 'loaded') {
    updates.picking_loaded_at = now
  }
  if (invoice.picking_status === 'not_started' && next !== 'not_started') {
    updates.picking_started_at = now
  }

  await adminClient.from('invoices').update(updates).eq('id', invoiceId)
}

function revalidateOfficeLoadPaths(invoiceId: string) {
  revalidatePath('/invoices')
  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/picker')
  revalidatePath('/picker/loads')
  revalidatePath('/driver')
}

/** Per-order load cap from company settings; 0 (or missing) = unlimited. */
async function getMaxLoadsPerOrder(adminClient: AdminClient): Promise<number> {
  const { data } = await adminClient
    .from('company_settings')
    .select('max_loads_per_order')
    .eq('id', 1)
    .maybeSingle()
  const max = Number(data?.max_loads_per_order ?? 5)
  return Number.isFinite(max) && max > 0 ? max : 0
}

/** Error message when the invoice already has the maximum number of loads. */
async function checkLoadCapacity(adminClient: AdminClient, invoiceId: string): Promise<string | null> {
  const max = await getMaxLoadsPerOrder(adminClient)
  if (max <= 0) return null
  // Only committed loads count toward the cap — abandoned open drafts
  // (another picker's unfinished session) must not block real work.
  const { count } = await adminClient
    .from('delivery_loads')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .in('status', ['printed', 'completed'])
  if ((count ?? 0) >= max) {
    return `This order already has the maximum of ${max} loads. Move items between the existing loads instead, or raise the limit in Settings → Company → Deliveries.`
  }
  return null
}

/**
 * Order lines with remaining quantities for the office load editor.
 * Also returns how many *new* loads can still be created (per-order cap).
 */
export async function getInvoiceOrderLines(
  invoiceId: string,
  excludeLoadId?: string
): Promise<{ lines?: InvoiceOrderLine[]; maxNewLoads?: number; error?: string }> {
  const { userId, error } = await requireOfficeLoadManager()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const invoice = await getManageableInvoice(adminClient, invoiceId)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  const { data: items, error: itemsError } = await adminClient
    .from('invoice_items')
    .select('id, product_name, product_code, unit, quantity')
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  if (itemsError) {
    return { error: safeActionError('picker.getInvoiceOrderLines', itemsError, 'Could not load order lines.') }
  }

  const { data: loadRows, error: loadRowsError } = await adminClient
    .from('delivery_load_items')
    .select('invoice_item_id, quantity, delivery_loads!inner(id, status)')
    .in('delivery_loads.invoice_id', [invoiceId])
    .in('delivery_loads.status', ['printed', 'completed'])

  if (loadRowsError) {
    return { error: safeActionError('picker.getInvoiceOrderLines', loadRowsError, 'Could not load order lines.') }
  }

  const accountedByItem = new Map<string, number>()
  for (const row of loadRows || []) {
    const load = Array.isArray(row.delivery_loads) ? row.delivery_loads[0] : row.delivery_loads
    if (excludeLoadId && load?.id === excludeLoadId) continue
    accountedByItem.set(
      row.invoice_item_id,
      (accountedByItem.get(row.invoice_item_id) || 0) + Number(row.quantity)
    )
  }

  const lines: InvoiceOrderLine[] = (items || []).map((item) => {
    const ordered = roundQty(Number(item.quantity))
    const accounted = roundQty(accountedByItem.get(item.id) || 0)
    return {
      invoiceItemId: item.id,
      productName: item.product_name,
      productCode: item.product_code,
      unit: item.unit,
      ordered,
      accounted,
      remaining: Math.max(0, roundQty(ordered - accounted)),
    }
  })

  // How many more printed loads this order can still take (0 = unlimited).
  const max = await getMaxLoadsPerOrder(adminClient)
  let maxNewLoads = 20 // soft UI cap when unlimited
  if (max > 0) {
    const { count } = await adminClient
      .from('delivery_loads')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)
      .in('status', ['printed', 'completed'])
    maxNewLoads = Math.max(0, max - (count ?? 0))
  }

  return { lines, maxNewLoads }
}

/**
 * Insert one printed load + its items. Caller must have already validated
 * items and checked capacity. Rolls back the load row if item insert fails.
 */
async function insertPrintedLoad(
  adminClient: AdminClient,
  invoiceId: string,
  userId: string,
  validated: ValidatedOfficeLoad
): Promise<{ loadId?: string; loadNumber?: number; error?: string }> {
  // MAX(load_number)+1 races with concurrent creates (UNIQUE (invoice_id,
  // load_number)). Retry once on a unique violation with a fresh max.
  const now = new Date().toISOString()
  let load: { id: string } | null = null
  let loadNumber = 0
  let lastError: { message?: string; code?: string } | null = null
  for (let attempt = 0; attempt < 2 && !load; attempt++) {
    const { data: maxRow } = await adminClient
      .from('delivery_loads')
      .select('load_number')
      .eq('invoice_id', invoiceId)
      .order('load_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    loadNumber = (maxRow?.load_number ?? 0) + 1

    const { data: inserted, error: loadError } = await adminClient
      .from('delivery_loads')
      .insert({
        invoice_id: invoiceId,
        load_number: loadNumber,
        status: 'printed',
        printed_at: now,
        picked_by: userId,
      })
      .select('id')
      .single()

    if (!loadError && inserted) {
      load = inserted
      break
    }
    lastError = loadError
    if (loadError?.code !== '23505') break
  }

  if (!load) {
    return { error: safeActionError('picker.insertPrintedLoad', lastError, 'Could not create load.') }
  }

  const { error: itemsError } = await adminClient.from('delivery_load_items').insert(
    validated.rows.map((row) => ({
      load_id: load.id,
      invoice_item_id: row.invoiceItemId,
      quantity: row.quantity,
      status: row.status,
    }))
  )

  if (itemsError) {
    // Roll back the load row so a failed insert never leaves an empty load.
    await adminClient.from('delivery_loads').delete().eq('id', load.id)
    if ((itemsError.message || '').includes('LOAD_OVER_ALLOCATED')) {
      return {
        error:
          'Another load for this order changed at the same time and there is not enough remaining quantity. Refresh and try again.',
      }
    }
    return { error: safeActionError('picker.insertPrintedLoad', itemsError, 'Could not create load.') }
  }

  await upsertOosAlerts(adminClient, invoiceId, userId, validated.oosLines)
  return { loadId: load.id, loadNumber }
}

/**
 * Office creates a printed load for an invoice (same result as a picker
 * printing a load: visible to drivers, covered by the auto-deliver sweep).
 */
export async function createOfficeLoad(
  invoiceId: string,
  items: LoadItemInput[]
): Promise<{ loadId?: string; loadNumber?: number; error?: string }> {
  const { userId, error } = await requireOfficeLoadManager()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const invoice = await getManageableInvoice(adminClient, invoiceId)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  const { validated, error: validationError } = await validateOfficeLoadItems(adminClient, invoiceId, items)
  if (validationError || !validated) return { error: validationError || 'Invalid load.' }

  const capacityError = await checkLoadCapacity(adminClient, invoiceId)
  if (capacityError) return { error: capacityError }

  const result = await insertPrintedLoad(adminClient, invoiceId, userId, validated)
  if (result.error) return { error: result.error }

  await recomputeInvoicePickingStatus(adminClient, invoiceId)
  revalidateOfficeLoadPaths(invoiceId)
  return { loadId: result.loadId, loadNumber: result.loadNumber }
}

/**
 * Office creates several printed loads in one go — e.g. plan Load 1 and Load 2
 * and assign each line's quantity to the right vehicle. Each entry in `loads`
 * is one load's items (same shape as createOfficeLoad). Empty entries are
 * skipped. On failure after a partial create, already-created loads are rolled
 * back so the order is left unchanged.
 */
export async function createOfficeLoads(
  invoiceId: string,
  loads: LoadItemInput[][]
): Promise<{ loadNumbers?: number[]; error?: string }> {
  const auth = await requireOfficeLoadManager()
  if (auth.error || !auth.userId) return { error: auth.error || 'Not authorised' }
  const userId = auth.userId

  const adminClient = createAdminClient()

  const invoice = await getManageableInvoice(adminClient, invoiceId)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  // Drop empty plans; each remaining plan must have at least one real item.
  const planned = loads
    .map((items) =>
      items.filter((item) => (Number(item.loadedQuantity) || 0) > 0 || item.outOfStockRemainder)
    )
    .filter((items) => items.length > 0)

  if (planned.length === 0) {
    return { error: 'Add at least one item to a load.' }
  }

  // Combined capacity check for N new loads (checkLoadCapacity is for +1).
  const max = await getMaxLoadsPerOrder(adminClient)
  if (max > 0) {
    const { count } = await adminClient
      .from('delivery_loads')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)
      .in('status', ['printed', 'completed'])
    if ((count ?? 0) + planned.length > max) {
      return {
        error: `This order can only have ${max} loads in total. You already have ${count ?? 0}; remove a load or raise the limit in Settings → Company → Deliveries.`,
      }
    }
  }

  // Pre-validate combined quantities so we fail before writing anything.
  // Per-line totals must not exceed remaining, and OOS may only be claimed once.
  const lineTotals = new Map<string, { loaded: number; oos: boolean }>()
  for (const items of planned) {
    for (const item of items) {
      const current = lineTotals.get(item.invoiceItemId) || { loaded: 0, oos: false }
      current.loaded = roundQty(current.loaded + (Number(item.loadedQuantity) || 0))
      if (item.outOfStockRemainder) {
        if (current.oos) {
          return { error: 'Out of stock can only be marked once per order line.' }
        }
        current.oos = true
      }
      lineTotals.set(item.invoiceItemId, current)
    }
  }

  for (const [invoiceItemId, total] of lineTotals) {
    const { data: line } = await adminClient
      .from('invoice_items')
      .select('quantity')
      .eq('id', invoiceItemId)
      .eq('invoice_id', invoiceId)
      .is('deleted_at', null)
      .single()
    if (!line) {
      return { error: 'One or more items do not belong to this invoice.' }
    }
    const remaining = Math.max(
      0,
      roundQty(Number(line.quantity) - (await getCommittedAccounted(adminClient, invoiceItemId)))
    )
    if (total.loaded < 0 || total.loaded > remaining) {
      return { error: 'Invalid quantity for one or more items.' }
    }
  }

  const createdIds: string[] = []
  const loadNumbers: number[] = []

  async function rollbackBatch() {
    if (createdIds.length === 0) return
    await adminClient.from('delivery_loads').delete().in('id', createdIds)
    // insertPrintedLoad may have raised OOS alerts for rolled-back loads —
    // clear any that no longer have a matching out_of_stock row so we don't
    // leave a false "Review required" / payment block.
    await resolveStaleOosAlerts(adminClient, invoiceId, userId)
  }

  for (const items of planned) {
    // Sequential validate sees remaining reduced by earlier inserts in this batch.
    const { validated, error: validationError } = await validateOfficeLoadItems(
      adminClient,
      invoiceId,
      items
    )
    if (validationError || !validated) {
      await rollbackBatch()
      return { error: validationError || 'Invalid load.' }
    }

    const result = await insertPrintedLoad(adminClient, invoiceId, userId, validated)
    if (result.error || !result.loadId) {
      await rollbackBatch()
      return { error: result.error || 'Could not create load.' }
    }
    createdIds.push(result.loadId)
    if (result.loadNumber != null) loadNumbers.push(result.loadNumber)
  }

  // upsertOosAlerts already ran per load inside insertPrintedLoad; recompute once.
  await resolveStaleOosAlerts(adminClient, invoiceId, userId)
  await recomputeInvoicePickingStatus(adminClient, invoiceId)
  revalidateOfficeLoadPaths(invoiceId)
  return { loadNumbers }
}

/**
 * Office edits a printed load (fix quantities / OOS lines). Delivered loads
 * are locked. Stale rows are deleted first, then new rows are upserted in
 * two phases (shrinks before grows) so the migration 146 allocation guard
 * never sees a transient over-allocation; failures restore the deleted rows.
 */
export async function updateOfficeLoad(
  loadId: string,
  items: LoadItemInput[]
): Promise<{ error?: string }> {
  const { userId, error } = await requireOfficeLoadManager()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: load } = await adminClient
    .from('delivery_loads')
    .select('id, invoice_id, status')
    .eq('id', loadId)
    .maybeSingle()

  if (!load) return { error: 'Load not found.' }
  if (load.status !== 'printed') {
    return { error: 'Only printed loads can be edited — this one is already delivered.' }
  }

  const invoice = await getManageableInvoice(adminClient, load.invoice_id)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  const { validated, error: validationError } = await validateOfficeLoadItems(
    adminClient,
    load.invoice_id,
    items,
    loadId
  )
  if (validationError || !validated) return { error: validationError || 'Invalid load.' }

  const { data: oldRows } = await adminClient
    .from('delivery_load_items')
    .select('id, invoice_item_id, quantity, status')
    .eq('load_id', loadId)

  const newRowKeys = new Set(
    validated.rows.map((row) => `${row.invoiceItemId}:${row.status}`)
  )

  // A line may legitimately have one row per status (e.g. partially loaded +
  // the remainder out of stock), so staleness is keyed by item AND status.
  const staleRows = (oldRows || []).filter(
    (row) => !newRowKeys.has(`${row.invoice_item_id}:${row.status}`)
  )

  // Delete stale rows BEFORE upserting: the allocation guard trigger
  // (migration 146) validates committed totals at write time, so growing a
  // line while its stale out_of_stock remainder still exists would be
  // falsely rejected. If the upsert then fails, the deleted rows are
  // restored so the original load is left intact.
  if (staleRows.length > 0) {
    const { error: deleteOldError } = await adminClient
      .from('delivery_load_items')
      .delete()
      .in('id', staleRows.map((row) => row.id))
    if (deleteOldError) {
      return {
        error: safeActionError(
          'picker.updateOfficeLoad',
          deleteOldError,
          'Could not remove the old load lines — please try again.'
        ),
      }
    }
  }

  // Upsert (respects UNIQUE (load_id, invoice_item_id, status) — plain
  // inserts would collide with kept rows). TWO PHASES: the allocation guard
  // trigger (migration 146) validates committed totals per row write, so a
  // quantity shift between KEPT rows of the same line (e.g. loaded 4 + oos 6
  // → loaded 7 + oos 3) would be falsely rejected if the growing row landed
  // while the shrinking row still held its old value. Apply non-growing rows
  // first (shrinks; brand-new rows are treated as grows since they only add).
  const oldQtyByKey = new Map(
    (oldRows || []).map((row) => [`${row.invoice_item_id}:${row.status}`, Number(row.quantity)] as const)
  )
  const upsertRows = validated.rows.map((row) => ({
    load_id: loadId,
    invoice_item_id: row.invoiceItemId,
    quantity: row.quantity,
    status: row.status,
  }))
  const isGrowing = (row: (typeof upsertRows)[number]) => {
    const oldQty = oldQtyByKey.get(`${row.invoice_item_id}:${row.status}`)
    return oldQty === undefined || row.quantity > oldQty
  }
  const nonGrowingRows = upsertRows.filter((row) => !isGrowing(row))
  const growingRows = upsertRows.filter(isGrowing)

  const restoreStaleRows = async () => {
    if (staleRows.length > 0) {
      await adminClient.from('delivery_load_items').insert(
        staleRows.map((row) => ({
          id: row.id,
          load_id: loadId,
          invoice_item_id: row.invoice_item_id,
          quantity: row.quantity,
          status: row.status,
        }))
      )
    }
  }

  for (const batch of [nonGrowingRows, growingRows]) {
    if (batch.length === 0) continue
    const { error: upsertError } = await adminClient
      .from('delivery_load_items')
      .upsert(batch, { onConflict: 'load_id,invoice_item_id,status' })

    if (upsertError) {
      // Restore the deleted stale rows. Shrinks from an earlier successful
      // batch stay applied — under-allocated but always valid, and a retry
      // is idempotent.
      await restoreStaleRows()
      if ((upsertError.message || '').includes('LOAD_OVER_ALLOCATED')) {
        return {
          error:
            'Another load for this order changed at the same time and there is not enough remaining quantity. Refresh and try again.',
        }
      }
      return { error: safeActionError('picker.updateOfficeLoad', upsertError, 'Could not update load.') }
    }
  }

  await upsertOosAlerts(adminClient, load.invoice_id, userId, validated.oosLines)
  await resolveStaleOosAlerts(adminClient, load.invoice_id, userId)
  await recomputeInvoicePickingStatus(adminClient, load.invoice_id)
  revalidateOfficeLoadPaths(load.invoice_id)
  return {}
}

/**
 * Office moves a load line (or part of it) to another printed load on the
 * same order — or to a brand-new load (respecting the per-order load cap).
 * Moving the full row just re-links it; a partial move splits the row.
 * Totals per invoice line don't change, so picking status and stock alerts
 * are unaffected.
 */
export async function moveLoadItems(
  sourceLoadId: string,
  itemRowId: string,
  quantity: number,
  target: { loadId?: string; newLoad?: boolean }
): Promise<{ error?: string }> {
  const { userId, error } = await requireOfficeLoadManager()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: sourceLoad } = await adminClient
    .from('delivery_loads')
    .select('id, invoice_id, status')
    .eq('id', sourceLoadId)
    .maybeSingle()

  if (!sourceLoad) return { error: 'Load not found.' }
  if (sourceLoad.status !== 'printed') {
    return { error: 'Only printed loads can be changed — this one is already delivered.' }
  }

  const invoice = await getManageableInvoice(adminClient, sourceLoad.invoice_id)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  const { data: row } = await adminClient
    .from('delivery_load_items')
    .select('id, load_id, invoice_item_id, quantity, status')
    .eq('id', itemRowId)
    .eq('load_id', sourceLoadId)
    .maybeSingle()

  if (!row) return { error: 'Item not found on this load.' }

  const moveQty = roundQty(Number(quantity) || 0)
  const rowQty = roundQty(Number(row.quantity))
  if (moveQty <= 0 || moveQty > rowQty) {
    return { error: 'Invalid quantity.' }
  }

  // Resolve the target load, creating a new printed one when asked.
  let targetLoadId = target.loadId
  if (target.newLoad || !targetLoadId) {
    const capacityError = await checkLoadCapacity(adminClient, sourceLoad.invoice_id)
    if (capacityError) return { error: capacityError }

    const now = new Date().toISOString()
    // MAX(load_number)+1 races with concurrent creates — retry once on a
    // unique violation with a fresh max.
    let newLoad: { id: string } | null = null
    let lastNewLoadError: { message?: string; code?: string } | null = null
    for (let attempt = 0; attempt < 2 && !newLoad; attempt++) {
      const { data: maxRow } = await adminClient
        .from('delivery_loads')
        .select('load_number')
        .eq('invoice_id', sourceLoad.invoice_id)
        .order('load_number', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: inserted, error: newLoadError } = await adminClient
        .from('delivery_loads')
        .insert({
          invoice_id: sourceLoad.invoice_id,
          load_number: (maxRow?.load_number ?? 0) + 1,
          status: 'printed',
          printed_at: now,
          picked_by: userId,
        })
        .select('id')
        .single()

      if (!newLoadError && inserted) {
        newLoad = inserted
        break
      }
      lastNewLoadError = newLoadError
      if (newLoadError?.code !== '23505') break
    }

    if (!newLoad) {
      return { error: safeActionError('picker.moveLoadItems', lastNewLoadError, 'Could not create the new load.') }
    }
    targetLoadId = newLoad.id
  } else {
    const { data: targetLoad } = await adminClient
      .from('delivery_loads')
      .select('id, invoice_id, status')
      .eq('id', targetLoadId)
      .maybeSingle()

    if (!targetLoad || targetLoad.invoice_id !== sourceLoad.invoice_id) {
      return { error: 'Target load not found on this order.' }
    }
    if (targetLoad.status !== 'printed') {
      return { error: 'Items can only be moved to a printed (not yet delivered) load.' }
    }
    if (targetLoad.id === sourceLoad.id) {
      return { error: 'Pick a different load to move the items to.' }
    }
  }

  // If the target load already has a row for the same order line WITH THE
  // SAME STATUS, merge into it — UNIQUE (load_id, invoice_item_id, status)
  // forbids duplicate status rows. Rows of a different status (e.g. an
  // out_of_stock remainder) must never be merged into a 'loaded' row: stock
  // reconciliation only sums 'loaded' rows.
  const { data: existingTargetRow } = await adminClient
    .from('delivery_load_items')
    .select('id, quantity')
    .eq('load_id', targetLoadId)
    .eq('invoice_item_id', row.invoice_item_id)
    .eq('status', row.status)
    .maybeSingle()

  if (existingTargetRow) {
    const targetQty = roundQty(Number(existingTargetRow.quantity))

    // Shrink/remove the SOURCE row first: the allocation guard trigger
    // (migration 146) validates committed totals at write time, so growing
    // the target while the source row still holds its full quantity would
    // be falsely rejected as over-allocation. If the grow then fails, the
    // source row is restored so no quantity is lost.
    if (moveQty >= rowQty) {
      const { error: deleteError } = await adminClient
        .from('delivery_load_items')
        .delete()
        .eq('id', row.id)
      if (deleteError) {
        return { error: safeActionError('picker.moveLoadItems', deleteError, 'Could not move the items.') }
      }
    } else {
      const { error: shrinkError } = await adminClient
        .from('delivery_load_items')
        .update({ quantity: roundQty(rowQty - moveQty) })
        .eq('id', row.id)
      if (shrinkError) {
        return { error: safeActionError('picker.moveLoadItems', shrinkError, 'Could not move the items.') }
      }
    }

    const { error: growError } = await adminClient
      .from('delivery_load_items')
      .update({ quantity: roundQty(targetQty + moveQty) })
      .eq('id', existingTargetRow.id)
    if (growError) {
      // Restore the source row so a failed grow never loses quantity.
      if (moveQty >= rowQty) {
        await adminClient.from('delivery_load_items').insert({
          id: row.id,
          load_id: sourceLoadId,
          invoice_item_id: row.invoice_item_id,
          quantity: rowQty,
          status: row.status,
        })
      } else {
        await adminClient
          .from('delivery_load_items')
          .update({ quantity: rowQty })
          .eq('id', row.id)
      }
      if ((growError.message || '').includes('LOAD_OVER_ALLOCATED')) {
        return {
          error:
            'Another load for this order changed at the same time and there is not enough remaining quantity. Refresh and try again.',
        }
      }
      return { error: safeActionError('picker.moveLoadItems', growError, 'Could not move the items.') }
    }
  } else if (moveQty >= rowQty) {
    // Whole row moves across.
    const { error: moveError } = await adminClient
      .from('delivery_load_items')
      .update({ load_id: targetLoadId })
      .eq('id', row.id)
    if (moveError) {
      return { error: safeActionError('picker.moveLoadItems', moveError, 'Could not move the items.') }
    }
  } else {
    // Partial move: shrink the source row, add a matching row to the target.
    const { error: shrinkError } = await adminClient
      .from('delivery_load_items')
      .update({ quantity: roundQty(rowQty - moveQty) })
      .eq('id', row.id)
    if (shrinkError) {
      return { error: safeActionError('picker.moveLoadItems', shrinkError, 'Could not move the items.') }
    }
    const { error: insertError } = await adminClient.from('delivery_load_items').insert({
      load_id: targetLoadId,
      invoice_item_id: row.invoice_item_id,
      quantity: moveQty,
      status: row.status,
    })
    if (insertError) {
      // Restore the source row so a failed insert never loses quantity.
      await adminClient.from('delivery_load_items').update({ quantity: rowQty }).eq('id', row.id)
      return { error: safeActionError('picker.moveLoadItems', insertError, 'Could not move the items.') }
    }
  }

  // If the source load is now empty, remove it — an empty printed load would
  // just confuse the driver queue.
  const { count: remainingRows } = await adminClient
    .from('delivery_load_items')
    .select('id', { count: 'exact', head: true })
    .eq('load_id', sourceLoadId)
  if ((remainingRows ?? 0) === 0) {
    await adminClient.from('delivery_loads').delete().eq('id', sourceLoadId).eq('status', 'printed')
  }

  revalidateOfficeLoadPaths(sourceLoad.invoice_id)
  return {}
}

/**
 * Office deletes a printed load (e.g. created by mistake). Delivered loads
 * are locked.
 */
export async function deleteOfficeLoad(loadId: string): Promise<{ error?: string }> {
  const { userId, error } = await requireOfficeLoadManager()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()

  const { data: load } = await adminClient
    .from('delivery_loads')
    .select('id, invoice_id, status')
    .eq('id', loadId)
    .maybeSingle()

  if (!load) return { error: 'Load not found.' }
  if (load.status !== 'printed') {
    return { error: 'Only printed loads can be deleted — this one is already delivered.' }
  }

  const invoice = await getManageableInvoice(adminClient, load.invoice_id)
  if (!invoice) return { error: 'Invoice not available for load management.' }

  const { error: deleteError } = await adminClient
    .from('delivery_loads')
    .delete()
    .eq('id', loadId)

  if (deleteError) {
    return { error: safeActionError('picker.deleteOfficeLoad', deleteError, 'Could not delete load.') }
  }

  await resolveStaleOosAlerts(adminClient, load.invoice_id, userId)
  await recomputeInvoicePickingStatus(adminClient, load.invoice_id)
  revalidateOfficeLoadPaths(load.invoice_id)
  return {}
}

/**
 * Office/picker: re-run stock settle from delivery loads without changing
 * picking status. Safe to call multiple times (idempotent when already settled).
 */
export async function reconcileInvoiceStockFromLoads(
  invoiceId: string
): Promise<{ error?: string; result?: { lines_adjusted?: number; restored?: number; deducted?: number } }> {
  const ctx = await getOperatorContext()
  if (!ctx) return { error: 'Not authenticated' }

  const isPicker = ctx.role === 'picker'
  const canOffice =
    ctx.isAdmin ||
    ctx.permissions.invoices_edit ||
    ctx.permissions.invoices_change_status ||
    ctx.permissions.products_edit

  if (!isPicker && !canOffice) {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()

  // Pickers may only reconcile orders they actually have a load on — a
  // picker must not settle stock for an arbitrary invoice (e.g. one being
  // picked by someone else). Office roles keep full access.
  if (isPicker && !canOffice) {
    const { data: ownLoad } = await adminClient
      .from('delivery_loads')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('picked_by', ctx.userId)
      .limit(1)
      .maybeSingle()
    if (!ownLoad) {
      return { error: 'Not authorised' }
    }
  }

  const { data, error } = await adminClient.rpc('reconcile_invoice_stock_from_loads', {
    p_invoice_id: invoiceId,
  })

  if (error) {
    return {
      error: safeActionError(
        'picker.reconcileInvoiceStockFromLoads',
        error,
        'Could not reconcile stock from loads.'
      ),
    }
  }

  const result =
    data && typeof data === 'object'
      ? (data as { lines_adjusted?: number; restored?: number; deducted?: number })
      : undefined

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/admin/products')
  revalidatePath('/picker')
  return { result }
}

export interface DriverOption {
  id: string
  name: string
  email: string
}

/**
 * Gate for driver assignment: pickers can assign (they hand over the load),
 * and so can admin / staff who manage loads or change invoice delivery status.
 */
async function requireCanAssignDriver(): Promise<{ userId: string; error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx) return { userId: '', error: 'Not authenticated' }
  const canAssign =
    ctx.role === 'picker' ||
    ctx.isAdmin ||
    ctx.permissions.invoices_change_status ||
    ctx.permissions.invoices_edit
  if (!canAssign) return { userId: '', error: 'Not authorised' }
  return { userId: ctx.userId }
}

/**
 * List active drivers for the assignment dropdown.
 */
export async function getDrivers(): Promise<{ drivers?: DriverOption[]; error?: string }> {
  const { userId, error } = await requireCanAssignDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()
  const { data, error: driversError } = await adminClient
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'driver')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (driversError) {
    return { error: safeActionError('picker.getDrivers', driversError, 'Could not load drivers.') }
  }

  return {
    drivers: (data || []).map((d) => ({
      id: d.id,
      name: d.full_name || d.email,
      email: d.email,
    })),
  }
}

/**
 * Assign a driver to a printed load (one trip). Stamps assigned_at so the
 * 24-hour overdue-delivery alert can measure from this moment.
 */
export async function assignDriverToLoad(
  loadId: string,
  driverId: string
): Promise<{ error?: string }> {
  const { userId, error } = await requireCanAssignDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()
  const { error: rpcError } = await adminClient.rpc('assign_driver_to_load', {
    p_load_id: loadId,
    p_driver_id: driverId,
    p_assigned_by: userId,
  })

  if (rpcError) {
    return { error: safeActionError('picker.assignDriverToLoad', rpcError, 'Could not assign driver.') }
  }

  // Resolve invoice so the office Loads tab refreshes with the new driver.
  const { data: load } = await adminClient
    .from('delivery_loads')
    .select('invoice_id')
    .eq('id', loadId)
    .maybeSingle()

  revalidatePath('/picker')
  revalidatePath('/picker/loads')
  revalidatePath('/driver')
  if (load?.invoice_id) {
    revalidatePath(`/invoices/${load.invoice_id}`)
  }
  return {}
}

/**
 * Remove a driver assignment from a load.
 */
export async function unassignDriverFromLoad(loadId: string): Promise<{ error?: string }> {
  const { userId, error } = await requireCanAssignDriver()
  if (error || !userId) return { error: error || 'Not authorised' }

  const adminClient = createAdminClient()
  const { error: rpcError } = await adminClient.rpc('unassign_driver_from_load', {
    p_load_id: loadId,
    p_assigned_by: userId,
  })

  if (rpcError) {
    return { error: safeActionError('picker.unassignDriverFromLoad', rpcError, 'Could not unassign driver.') }
  }

  const { data: load } = await adminClient
    .from('delivery_loads')
    .select('invoice_id')
    .eq('id', loadId)
    .maybeSingle()

  revalidatePath('/picker')
  revalidatePath('/picker/loads')
  revalidatePath('/driver')
  if (load?.invoice_id) {
    revalidatePath(`/invoices/${load.invoice_id}`)
  }
  return {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Short-shipment review ("review required") — office-facing actions
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceStockReview {
  id: string
  productName: string
  quantityNeeded: number | null
  alertType: string
  status: string
  raisedAt: string
}

/**
 * Open picker-raised short-shipment alerts for a single invoice. These are
 * what makes an invoice "review required" and block payment.
 */
export async function getInvoiceStockReviews(invoiceId: string): Promise<{
  reviews?: InvoiceStockReview[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('stock_audit_alerts')
    .select('id, alert_type, status, quantity_needed, raised_at, products(name)')
    .eq('invoice_id', invoiceId)
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])
    .order('raised_at', { ascending: true })

  if (error) {
    return { error: safeActionError('picker.getInvoiceStockReviews', error, 'Could not load reviews.') }
  }

  return {
    reviews: (data || []).map((row) => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products
      return {
        id: row.id,
        productName: product?.name || 'Unknown product',
        quantityNeeded: row.quantity_needed != null ? Number(row.quantity_needed) : null,
        alertType: row.alert_type,
        status: row.status,
        raisedAt: row.raised_at,
      }
    }),
  }
}

/**
 * Office staff confirms the short-shipment is handled (customer notified,
 * invoice adjusted, etc.) — resolves the invoice's open picker alerts and
 * unblocks payment.
 */
export async function resolveInvoiceStockReviews(invoiceId: string): Promise<{ error?: string }> {
  const ctx = await getOperatorContext()
  if (!ctx) return { error: 'Not authenticated' }
  if (!ctx.isAdmin && !ctx.permissions.invoices_edit && !ctx.permissions.invoices_change_status) {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('stock_audit_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
    })
    .eq('invoice_id', invoiceId)
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])

  if (error) {
    return { error: safeActionError('picker.resolveInvoiceStockReviews', error, 'Could not resolve review.') }
  }

  revalidatePath(`/invoices/${invoiceId}`)
  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  revalidatePath('/admin/products')
  return {}
}

/**
 * Invoices that currently have open picker-raised short-shipment alerts,
 * for the dashboard review banner.
 */
export async function getOpenShortShipReviews(): Promise<{
  reviews?: { invoiceId: string; documentNumber: string; itemCount: number }[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('stock_audit_alerts')
    .select('invoice_id, invoices(document_number, deleted_at)')
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])
    .not('invoice_id', 'is', null)

  if (error) {
    return {
      error: safeActionError('picker.getOpenShortShipReviews', error, 'Could not load short-ship reviews.'),
    }
  }

  const byInvoice = new Map<string, { documentNumber: string; itemCount: number }>()
  for (const row of data || []) {
    if (!row.invoice_id) continue
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
    if (!invoice || invoice.deleted_at) continue
    const existing = byInvoice.get(row.invoice_id)
    if (existing) {
      existing.itemCount += 1
    } else {
      byInvoice.set(row.invoice_id, {
        documentNumber: invoice.document_number || '',
        itemCount: 1,
      })
    }
  }

  return {
    reviews: Array.from(byInvoice.entries()).map(([invoiceId, info]) => ({
      invoiceId,
      documentNumber: info.documentNumber,
      itemCount: info.itemCount,
    })),
  }
}

/**
 * Unified payment-block check. An invoice cannot be paid while it has an
 * unresolved quantity amendment: the picker loaded LESS than ordered on one
 * or more lines (short-shipment / out of stock), so the invoice totals no
 * longer match what actually went out and office staff must review and fix
 * it first.
 *
 * Load/delivery status deliberately does NOT block payment — a fully loaded
 * order can be paid straight away. Pickers also cannot over-load (clamped
 * in the UI and validated in savePickState), so amendments are always
 * reductions, which surface as open picker stock_audit_alerts.
 */
export async function getPaymentBlockedInvoices(invoiceIds: string[]): Promise<{
  blocks?: { invoiceId: string; reason: 'review' }[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }
  if (invoiceIds.length === 0) return { blocks: [] }

  const adminClient = createAdminClient()

  const { data: alertRows, error: alertsError } = await adminClient
    .from('stock_audit_alerts')
    .select('invoice_id')
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])
    .in('invoice_id', invoiceIds)

  if (alertsError) {
    return {
      error: safeActionError('picker.getPaymentBlockedInvoices', alertsError, 'Could not check invoice blocks.'),
    }
  }

  const seen = new Set<string>()
  const blocks: { invoiceId: string; reason: 'review' }[] = []
  for (const row of alertRows || []) {
    if (row.invoice_id && !seen.has(row.invoice_id)) {
      seen.add(row.invoice_id)
      blocks.push({ invoiceId: row.invoice_id, reason: 'review' })
    }
  }

  return { blocks }
}

/**
 * Batch helper: which of the given invoice ids have open picker-raised
 * short-shipment alerts. Used by the invoice list for the Review pill.
 */
export async function getInvoicesWithOpenReviews(invoiceIds: string[]): Promise<{
  invoiceIds?: string[]
  error?: string
}> {
  const ctx = await getOperatorContext()
  if (!ctx || ctx.role === 'client') {
    return { error: 'Not authorised' }
  }
  if (invoiceIds.length === 0) return { invoiceIds: [] }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('stock_audit_alerts')
    .select('invoice_id')
    .eq('source', 'picker')
    .in('status', ['open', 'ordered'])
    .in('invoice_id', invoiceIds)

  if (error) {
    return {
      error: safeActionError('picker.getInvoicesWithOpenReviews', error, 'Could not load review flags.'),
    }
  }

  return { invoiceIds: Array.from(new Set((data || []).map((row) => row.invoice_id).filter(Boolean))) }
}
