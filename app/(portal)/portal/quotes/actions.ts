'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeActionError } from '@/lib/errors'

interface QuoteItem {
  product_id?: string
  product_name: string
  quantity: number
  notes?: string
}

export async function createClientQuote(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  const clientId = profile?.client_id
  if (!clientId) {
    return { error: 'Your portal account is not linked to a customer record.' }
  }

  const itemsRaw = formData.get('items') as string
  const notes = ((formData.get('notes') as string) ?? '').slice(0, 2000)
  const deliveryAddressRaw = (formData.get('delivery_address') as string) ?? 'null'
  let parsedItems: unknown
  let deliveryAddress: Record<string, unknown> | null = null
  try {
    parsedItems = JSON.parse(itemsRaw)
    deliveryAddress = JSON.parse(deliveryAddressRaw)
  } catch {
    return { error: 'Invalid quote data.' }
  }

  if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
    return { error: 'Add at least one item to your quote request.' }
  }
  if (parsedItems.length > 100) {
    return { error: 'Too many items in one quote request (maximum 100).' }
  }

  // The payload is client-controlled JSON, so validate every field's type
  // before touching it — a missing/non-string product_name must produce a
  // clean validation error, not an uncaught TypeError.
  const cleanedItems: {
    product_id: string | null
    product_name: string
    quantity: number
    notes: string
  }[] = []
  for (const raw of parsedItems as QuoteItem[]) {
    if (!raw || typeof raw !== 'object') continue
    const name = typeof raw.product_name === 'string' ? raw.product_name.trim() : ''
    const quantity = Number(raw.quantity)
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue
    cleanedItems.push({
      product_id: typeof raw.product_id === 'string' && raw.product_id ? raw.product_id : null,
      product_name: name.slice(0, 200),
      quantity: Math.min(quantity, 1_000_000),
      notes: (typeof raw.notes === 'string' ? raw.notes.trim() : '').slice(0, 1000),
    })
  }

  if (cleanedItems.length === 0) {
    return { error: 'Add at least one item with a name and quantity.' }
  }

  // Generate a friendly reference number like CQ-00001 via the row-locked
  // sequence RPC — counting rows through the user client is RLS-scoped to
  // the caller's own quotes and races under concurrency.
  const { data: referenceNumber, error: refError } = await supabase.rpc(
    'generate_client_quote_reference' as never
  )

  if (refError || !referenceNumber) {
    return { error: safeActionError('createClientQuote', refError, 'Could not create your quote request.') }
  }

  const { error } = await supabase.from('client_quotes').insert({
    client_id: clientId,
    reference_number: referenceNumber as string,
    items: cleanedItems,
    delivery_address: deliveryAddress,
    notes: notes.trim(),
    status: 'pending',
  })

  if (error) {
    return { error: safeActionError('createClientQuote', error) }
  }

  revalidatePath('/portal/quotes')
  redirect('/portal/quotes')
}
