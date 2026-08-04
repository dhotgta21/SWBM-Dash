'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeActionError } from '@/lib/errors'
import { resolveStaffPermissions } from '@/lib/auth/permissions'

export interface IndividualDiscountProduct {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
  status: 'none' | 'live' | 'scheduled' | 'expiring' | 'recently-ended'
}

export type IndividualDiscountFilter =
  | 'all'
  | 'no-discount'
  | 'live'
  | 'scheduled'
  | 'expiring-soon'
  | 'recently-ended'

export interface IndividualDiscountInput {
  sale_price: number
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
}

interface PermissionResult {
  canSee: boolean
  canEdit: boolean
  isAdmin: boolean
}

async function getPermissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PermissionResult | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userId)
    .single()

  if (!profile) return null

  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  const isAdmin = profile.role === 'admin'

  return {
    canSee: isAdmin || perms.see_products,
    canEdit: isAdmin || perms.products_edit,
    isAdmin,
  }
}

function computeStatus(
  product: Pick<
    IndividualDiscountProduct,
    'sale_price' | 'sale_starts_at' | 'sale_ends_at'
  >,
  now: Date
): IndividualDiscountProduct['status'] {
  if (product.sale_price == null) return 'none'

  const startsAt = product.sale_starts_at ? new Date(product.sale_starts_at) : null
  const endsAt = product.sale_ends_at ? new Date(product.sale_ends_at) : null

  const started = startsAt ? now.getTime() >= startsAt.getTime() : true
  const notEnded = endsAt ? now.getTime() < endsAt.getTime() : true

  if (started && notEnded) {
    if (endsAt) {
      const msToEnd = endsAt.getTime() - now.getTime()
      const daysToEnd = msToEnd / (1000 * 60 * 60 * 24)
      if (daysToEnd <= 7) return 'expiring'
    }
    return 'live'
  }

  if (startsAt && now.getTime() < startsAt.getTime()) {
    return 'scheduled'
  }

  if (endsAt && now.getTime() >= endsAt.getTime()) {
    const msSinceEnd = now.getTime() - endsAt.getTime()
    const daysSinceEnd = msSinceEnd / (1000 * 60 * 60 * 24)
    if (daysSinceEnd <= 30) return 'recently-ended'
  }

  return 'none'
}

function normalizeInput(input: IndividualDiscountInput): IndividualDiscountInput {
  return {
    sale_price: Number(input.sale_price) || 0,
    sale_starts_at:
      typeof input.sale_starts_at === 'string' && input.sale_starts_at.trim()
        ? input.sale_starts_at.trim()
        : null,
    sale_ends_at:
      typeof input.sale_ends_at === 'string' && input.sale_ends_at.trim()
        ? input.sale_ends_at.trim()
        : null,
    sale_label:
      typeof input.sale_label === 'string' && input.sale_label.trim()
        ? input.sale_label.trim().slice(0, 60)
        : null,
  }
}

export async function listIndividualDiscountProducts(
  filter: IndividualDiscountFilter = 'all'
): Promise<{ products: IndividualDiscountProduct[]; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { products: [], error: 'Authentication required' }
    }

    const perms = await getPermissions(supabase, user.id)
    if (!perms?.canSee) {
      return { products: [], error: 'You do not have permission to view products' }
    }

    // Admins use the service-role client to bypass any RLS quirks on the
    // products table while the application layer enforces permissions.
    const queryClient = perms.isAdmin ? createAdminClient() : supabase

    const { data: rows, error } = await queryClient
      .from('products')
      .select(
        'id, code, name, category, default_price, sale_price, sale_starts_at, sale_ends_at, sale_label'
      )
      .is('deleted_at', null)
      .eq('is_temporary', false)
      .gt('default_price', 0)
      .is('price_from', null)
      .order('name', { ascending: true })

    if (error) {
      console.error('listIndividualDiscountProducts error:', error)
      return { products: [], error: 'Could not load products' }
    }

    const now = new Date()
    let products = (rows ?? []).map((row) => {
      const product: IndividualDiscountProduct = {
        id: row.id,
        code: row.code,
        name: row.name,
        category: row.category,
        default_price: Number(row.default_price) || 0,
        sale_price: row.sale_price != null ? Number(row.sale_price) : null,
        sale_starts_at: row.sale_starts_at ?? null,
        sale_ends_at: row.sale_ends_at ?? null,
        sale_label: row.sale_label ?? null,
        status: 'none',
      }
      product.status = computeStatus(product, now)
      return product
    })

    if (filter === 'no-discount') {
      products = products.filter((p) => p.sale_price == null)
    } else if (filter === 'live') {
      products = products.filter((p) => p.status === 'live' || p.status === 'expiring')
    } else if (filter === 'scheduled') {
      products = products.filter((p) => p.status === 'scheduled')
    } else if (filter === 'expiring-soon') {
      products = products.filter((p) => p.status === 'expiring')
    } else if (filter === 'recently-ended') {
      products = products.filter((p) => p.status === 'recently-ended')
    }

    const statusPriority: Record<IndividualDiscountProduct['status'], number> = {
      live: 0,
      expiring: 1,
      scheduled: 2,
      'recently-ended': 3,
      none: 4,
    }

    products.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
      if (priorityDiff !== 0) return priorityDiff
      return a.name.localeCompare(b.name)
    })

    return { products }
  } catch (error) {
    return { products: [], error: safeActionError('listIndividualDiscountProducts', error as any) }
  }
}

export async function updateIndividualDiscount(
  productId: string,
  input: IndividualDiscountInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    const perms = await getPermissions(supabase, user.id)
    if (!perms?.canEdit) {
      return { success: false, error: 'You do not have permission to edit products' }
    }

    // Admins use the service-role client to bypass any RLS quirks on the
    // products table while the application layer enforces permissions.
    const queryClient = perms.isAdmin ? createAdminClient() : supabase

    const normalized = normalizeInput(input)

    const { data: product, error: productError } = await queryClient
      .from('products')
      .select('default_price, price_from, is_temporary, deleted_at')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return { success: false, error: 'Product not found' }
    }

    if (product.deleted_at) {
      return { success: false, error: 'Product has been deleted' }
    }

    if (product.is_temporary) {
      return { success: false, error: 'Temporary products cannot have discounts' }
    }

    const defaultPrice = Number(product.default_price) || 0
    if (defaultPrice <= 0 || product.price_from != null) {
      return { success: false, error: 'Only Show-price products can have a discount' }
    }

    if (!Number.isFinite(normalized.sale_price) || normalized.sale_price <= 0) {
      return { success: false, error: 'Sale price must be greater than 0' }
    }

    if (normalized.sale_price >= defaultPrice) {
      return { success: false, error: 'Sale price must be lower than the trade price' }
    }

    if (
      normalized.sale_starts_at &&
      normalized.sale_ends_at &&
      new Date(normalized.sale_starts_at).getTime() >= new Date(normalized.sale_ends_at).getTime()
    ) {
      return { success: false, error: 'Sale end date must be after the start date' }
    }

    const { error: updateError } = await queryClient
      .from('products')
      .update({
        sale_price: normalized.sale_price,
        sale_starts_at: normalized.sale_starts_at,
        sale_ends_at: normalized.sale_ends_at,
        sale_label: normalized.sale_label,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)

    if (updateError) {
      console.error('updateIndividualDiscount error:', updateError)
      return { success: false, error: 'Could not save discount' }
    }

    revalidatePath('/admin/campaigns')
    revalidatePath('/admin/products')
    revalidatePath('/products')
    revalidatePath('/categories')

    return { success: true }
  } catch (error) {
    return { success: false, error: safeActionError('updateIndividualDiscount', error as any) }
  }
}

export async function clearIndividualDiscount(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Authentication required' }
    }

    const perms = await getPermissions(supabase, user.id)
    if (!perms?.canEdit) {
      return { success: false, error: 'You do not have permission to edit products' }
    }

    // Admins use the service-role client to bypass any RLS quirks on the
    // products table while the application layer enforces permissions.
    const queryClient = perms.isAdmin ? createAdminClient() : supabase

    const { error } = await queryClient
      .from('products')
      .update({
        sale_price: null,
        sale_starts_at: null,
        sale_ends_at: null,
        sale_label: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId)

    if (error) {
      console.error('clearIndividualDiscount error:', error)
      return { success: false, error: 'Could not clear discount' }
    }

    revalidatePath('/admin/campaigns')
    revalidatePath('/admin/products')
    revalidatePath('/products')
    revalidatePath('/categories')

    return { success: true }
  } catch (error) {
    return { success: false, error: safeActionError('clearIndividualDiscount', error as any) }
  }
}
