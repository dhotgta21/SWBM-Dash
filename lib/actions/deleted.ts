'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/supabase/access'
import { safeActionError } from '@/lib/errors'

async function getRequestMeta() {
  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null
  return {
    p_ip_address: ip === 'unknown' ? null : ip,
    p_user_agent: userAgent,
  }
}

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const isAdmin = await isAdminUser(supabase, user.id)
  if (!isAdmin) return { error: 'Only admins can restore records.' }
  return { supabase, user }
}

export async function restoreClientRecord(id: string, password: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const meta = await getRequestMeta()
  // Call via the authenticated user client so the RPC sees auth.uid().
  // The RPC is SECURITY DEFINER, so it can still update deleted_at.
  const { data: result, error } = await auth.supabase.rpc('restore_client', {
    p_client_id: id,
    p_password: password,
    ...meta,
  })

  if (error) {
    return { error: safeActionError('deleted.restoreClientRecord', error, 'Could not restore the client.') }
  }
  if (!result?.success) {
    return { error: result?.message || 'Could not restore the client.' }
  }

  revalidatePath('/clients')
  revalidatePath('/invoices')
  return { success: true }
}

export async function restoreProductRecord(id: string, password: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const meta = await getRequestMeta()
  const { data: result, error } = await auth.supabase.rpc('restore_product', {
    p_product_id: id,
    p_password: password,
    ...meta,
  })

  if (error) {
    return { error: safeActionError('deleted.restoreProductRecord', error, 'Could not restore the product.') }
  }
  if (!result?.success) {
    return { error: result?.message || 'Could not restore the product.' }
  }

  revalidatePath('/admin/products')
  revalidatePath('/invoices')
  return { success: true }
}

export async function restoreInvoiceRecord(id: string, password: string) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth

  const meta = await getRequestMeta()
  const { data: result, error } = await auth.supabase.rpc('restore_invoice', {
    p_invoice_id: id,
    p_password: password,
    ...meta,
  })

  if (error) {
    return { error: safeActionError('deleted.restoreInvoiceRecord', error, 'Could not restore the invoice.') }
  }
  if (!result?.success) {
    return { error: result?.message || 'Could not restore the invoice.' }
  }

  revalidatePath('/invoices')
  revalidatePath('/dashboard')
  return { success: true }
}
