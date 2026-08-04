'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeActionError } from '@/lib/errors'

interface UpdateInventoryInput {
  inventoryId: string
  quantityRemaining: number
}

export async function updateInventoryRemaining({
  inventoryId,
  quantityRemaining,
}: UpdateInventoryInput) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be signed in.' }
  }

  // Verify the inventory row belongs to this client.
  const { data: row, error: rowErr } = await supabase
    .from('client_inventory')
    .select('id, client_id')
    .eq('id', inventoryId)
    .maybeSingle()

  if (rowErr || !row) {
    return { error: 'Inventory item not found.' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.client_id !== row.client_id) {
    return { error: 'You can only update your own inventory.' }
  }

  const remaining = Math.max(0, Number(quantityRemaining) || 0)

  const { error } = await supabase
    .from('client_inventory')
    .update({ quantity_remaining: remaining, last_updated_at: new Date().toISOString() })
    .eq('id', inventoryId)

  if (error) {
    return { error: safeActionError('updateInventoryRemaining', error) }
  }

  revalidatePath('/portal/inventory')
  return { success: true }
}
