'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { safeActionError } from '@/lib/errors'

interface AddressInput {
  label: string
  addressLine1: string
  addressLine2?: string | null
  town: string
  county?: string | null
  postcode: string
  contactName?: string | null
  contactPhone?: string | null
  deliveryNotes?: string | null
  isDefault?: boolean
}

function normalisePostcode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ')
}

// Server-side validation for delivery address fields — the client form is not
// a trust boundary, so required fields and length caps are enforced here too.
function validateAddressInput(input: AddressInput): string | null {
  if (!input.addressLine1?.trim()) return 'Address line 1 is required.'
  if (!input.town?.trim()) return 'Town is required.'
  if (!normalisePostcode(input.postcode ?? '')) return 'Postcode is required.'
  if ((input.label ?? '').trim().length > 100) return 'Label must be 100 characters or fewer.'
  if (input.addressLine1.trim().length > 200) return 'Address line 1 must be 200 characters or fewer.'
  if ((input.addressLine2 ?? '').trim().length > 200) return 'Address line 2 must be 200 characters or fewer.'
  if (input.town.trim().length > 100) return 'Town must be 100 characters or fewer.'
  if (normalisePostcode(input.postcode).length > 20) return 'Postcode must be 20 characters or fewer.'
  return null
}

async function verifyOwnAddress(supabase: Awaited<ReturnType<typeof createClient>>, addressId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.client_id) return { error: 'No client record linked.' }

  const { data: address } = await supabase
    .from('client_delivery_addresses')
    .select('id, client_id')
    .eq('id', addressId)
    .maybeSingle()

  if (!address || address.client_id !== profile.client_id) {
    return { error: 'Address not found.' }
  }

  return { user, clientId: profile.client_id }
}

export async function createClientDeliveryAddress(input: AddressInput) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()

  const clientId = profile?.client_id
  if (!clientId) return { error: 'Your portal account is not linked to a customer record.' }

  const validationError = validateAddressInput(input)
  if (validationError) return { error: validationError }

  const isDefault = input.isDefault ?? false

  // If setting as default, clear the existing default first.
  if (isDefault) {
    await supabase
      .from('client_delivery_addresses')
      .update({ is_default: false })
      .eq('client_id', clientId)
      .eq('is_default', true)
  }

  const { error } = await supabase.from('client_delivery_addresses').insert({
    client_id: clientId,
    label: input.label.trim(),
    is_default: isDefault,
    address_line_1: input.addressLine1.trim(),
    address_line_2: input.addressLine2?.trim() || null,
    town: input.town.trim(),
    county: input.county?.trim() || null,
    postcode: normalisePostcode(input.postcode),
    contact_name: input.contactName?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    delivery_notes: input.deliveryNotes?.trim() || null,
  })

  if (error) return { error: safeActionError('profileAction', error) }

  revalidatePath('/portal/profile')
  return { success: true }
}

export async function updateClientDeliveryAddress(addressId: string, input: AddressInput) {
  const supabase = await createClient()
  const check = await verifyOwnAddress(supabase, addressId)
  if ('error' in check && check.error) return { error: check.error }
  const { clientId } = check as { clientId: string }

  const validationError = validateAddressInput(input)
  if (validationError) return { error: validationError }

  const isDefault = input.isDefault ?? false

  // If setting as default, clear the existing default first (excluding this row).
  if (isDefault) {
    await supabase
      .from('client_delivery_addresses')
      .update({ is_default: false })
      .eq('client_id', clientId)
      .eq('is_default', true)
      .neq('id', addressId)
  }

  const { error } = await supabase
    .from('client_delivery_addresses')
    .update({
      label: input.label.trim(),
      is_default: isDefault,
      address_line_1: input.addressLine1.trim(),
      address_line_2: input.addressLine2?.trim() || null,
      town: input.town.trim(),
      county: input.county?.trim() || null,
      postcode: normalisePostcode(input.postcode),
      contact_name: input.contactName?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      delivery_notes: input.deliveryNotes?.trim() || null,
    })
    .eq('id', addressId)

  if (error) return { error: safeActionError('profileAction', error) }

  revalidatePath('/portal/profile')
  return { success: true }
}

export async function deleteClientDeliveryAddress(addressId: string) {
  const supabase = await createClient()
  const check = await verifyOwnAddress(supabase, addressId)
  if ('error' in check && check.error) return { error: check.error }

  const { error } = await supabase
    .from('client_delivery_addresses')
    .delete()
    .eq('id', addressId)

  if (error) return { error: safeActionError('profileAction', error) }

  revalidatePath('/portal/profile')
  return { success: true }
}
