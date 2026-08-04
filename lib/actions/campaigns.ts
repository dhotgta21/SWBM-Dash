'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeActionError } from '@/lib/errors'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { getCampaignStatus, isCampaignRunning, type CampaignSaleFields } from '@/lib/products/sale'
import type { Database } from '@/lib/database.types'

export interface CampaignFormData {
  name: string
  discount_percent: number
  starts_at: string | null
  ends_at: string | null
  label: string | null
  product_ids: string[]
}

export interface CampaignProductRow {
  id: string
  code: string
  name: string
  category: string | null
  default_price: number
}

export interface CampaignRow {
  id: string
  name: string
  discount_percent: number
  starts_at: string | null
  ends_at: string | null
  label: string | null
  is_paused: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
  product_count?: number
  ineligible_product_count?: number
  status?: ReturnType<typeof getCampaignStatus>
}

export interface CampaignWithProducts extends CampaignRow {
  products: CampaignProductRow[]
}

interface PermissionResult {
  canSee: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
  isAdmin: boolean
}

/**
 * Returns the right Supabase client for campaign DB operations.
 * Admins use the service-role client to bypass RLS quirks; staff use the
 * authenticated SSR client so row-level security policies still apply.
 */
function getCampaignDbClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  isAdmin: boolean
) {
  return isAdmin ? createAdminClient() : supabase
}

async function getCampaignPermissions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<PermissionResult | null> {
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
    canAdd: isAdmin || perms.products_add,
    canEdit: isAdmin || perms.products_edit,
    canDelete: isAdmin || perms.products_delete,
    isAdmin,
  }
}

function campaignRowFromDb(row: Database['public']['Tables']['campaigns']['Row']): CampaignRow {
  const fields: CampaignSaleFields = {
    discountPercent: row.discount_percent,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isPaused: row.is_paused,
  }
  return {
    ...row,
    status: getCampaignStatus(fields),
  }
}

function normalizeCampaignData(data: CampaignFormData): CampaignFormData {
  return {
    name: data.name.trim(),
    discount_percent: Math.min(100, Math.max(0, Number(data.discount_percent) || 0)),
    starts_at:
      typeof data.starts_at === 'string' && data.starts_at.trim() ? data.starts_at.trim() : null,
    ends_at:
      typeof data.ends_at === 'string' && data.ends_at.trim() ? data.ends_at.trim() : null,
    label: typeof data.label === 'string' && data.label.trim() ? data.label.trim() : null,
    product_ids: Array.isArray(data.product_ids) ? data.product_ids.filter(Boolean) : [],
  }
}

async function validateCampaignProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productIds: string[]
): Promise<string | null> {
  if (productIds.length === 0) return null

  const { data: products, error } = await supabase
    .from('products')
    .select('id, is_temporary, default_price, price_from')
    .in('id', productIds)
    .is('deleted_at', null)

  if (error) {
    console.error('validateCampaignProducts error:', error)
    return 'Could not validate campaign products'
  }

  const foundIds = new Set((products ?? []).map((p) => p.id))
  const missing = productIds.filter((id) => !foundIds.has(id))
  if (missing.length > 0) {
    return `${missing.length} selected product(s) do not exist or have been deleted`
  }

  const temporary = (products ?? []).filter((p) => p.is_temporary)
  if (temporary.length > 0) {
    return 'Temporary products cannot be added to a campaign. Promote them to the catalog first.'
  }

  const ineligible = (products ?? []).filter(
    (p) => Number(p.default_price ?? 0) <= 0 || p.price_from != null
  )
  if (ineligible.length > 0) {
    return 'Only Show-price products can be added to a campaign.'
  }

  return null
}

async function validateCampaignData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: CampaignFormData
): Promise<string | null> {
  if (!data.name.trim()) return 'Campaign name is required'
  if (data.name.length > 120) return 'Campaign name must be 120 characters or less'
  if (!Number.isFinite(data.discount_percent) || data.discount_percent <= 0 || data.discount_percent > 100) {
    return 'Discount must be between 0.01% and 100%'
  }
  if (data.starts_at && data.ends_at) {
    if (new Date(data.starts_at).getTime() >= new Date(data.ends_at).getTime()) {
      return 'End date must be after the start date'
    }
  }

  const productError = await validateCampaignProducts(supabase, data.product_ids)
  if (productError) return productError

  return null
}

export async function listCampaigns(): Promise<{ campaigns: CampaignRow[]; error?: string }> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return { campaigns: [], error: 'Not authenticated' }

    const perms = await getCampaignPermissions(supabase, user.id)
    if (!perms?.canSee) return { campaigns: [], error: 'Not authorised' }

    // Admins use the service-role client to bypass any RLS quirks on the
    // campaigns / campaign_products tables while the application layer
    // enforces permissions.
    const queryClient = perms.isAdmin ? createAdminClient() : supabase

    const { data: campaigns, error } = await queryClient
      .from('campaigns')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return { campaigns: [], error: safeActionError('campaigns.listCampaigns', error, 'Could not load campaigns.') }
    }

    if (!campaigns || campaigns.length === 0) {
      return { campaigns: [] }
    }

    const { data: memberships, error: countError } = await queryClient
      .from('campaign_products')
      .select('campaign_id, products(default_price, price_from, deleted_at)')
      .in(
        'campaign_id',
        campaigns.map((c) => c.id)
      )

    if (countError) {
      console.error('campaigns.listCampaigns count error:', countError)
    }

    const countMap = new Map<string, number>()
    const ineligibleMap = new Map<string, number>()
    if (memberships) {
      for (const row of memberships as any[]) {
        const campaignId: string = row.campaign_id
        const product = row.products as {
          default_price: number | null
          price_from: number | null
          deleted_at: string | null
        } | null
        // The embedded join doesn't filter out soft-deleted products, so
        // exclude them here — deleted products must not count as members.
        if (product?.deleted_at) continue
        countMap.set(campaignId, (countMap.get(campaignId) ?? 0) + 1)
        if (
          product &&
          (Number(product.default_price ?? 0) <= 0 || product.price_from != null)
        ) {
          ineligibleMap.set(campaignId, (ineligibleMap.get(campaignId) ?? 0) + 1)
        }
      }
    }

    return {
      campaigns: campaigns.map((c) => ({
        ...campaignRowFromDb(c),
        product_count: countMap.get(c.id) ?? 0,
        ineligible_product_count: ineligibleMap.get(c.id) ?? 0,
      })),
    }
  } catch (error) {
    console.error('campaigns.listCampaigns unexpected error:', error)
    return { campaigns: [], error: safeActionError('campaigns.listCampaigns', error as any, 'Could not load campaigns.') }
  }
}

export async function getCampaignById(id: string): Promise<{ campaign?: CampaignWithProducts; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canSee) return { error: 'Not authorised' }

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  const { data: campaign, error } = await queryClient
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !campaign) {
    return { error: error ? safeActionError('campaigns.getCampaignById', error, 'Campaign not found.') : 'Campaign not found.' }
  }

  const { data: products, error: productsError } = await queryClient
    .from('campaign_products')
    .select('products(id, code, name, category, default_price, deleted_at)')
    .eq('campaign_id', id)

  if (productsError) {
    return { error: safeActionError('campaigns.getCampaignById.products', productsError, 'Could not load campaign products.') }
  }

  const mappedProducts: CampaignProductRow[] = (products ?? [])
    .map((row: any) => row.products)
    // Exclude soft-deleted products — the embedded join doesn't filter them.
    .filter((p: any) => p && !p.deleted_at)
    .map((p: any) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      default_price: Number(p.default_price ?? 0),
    }))

  return {
    campaign: {
      ...campaignRowFromDb(campaign),
      products: mappedProducts,
    },
  }
}

export async function getActiveCampaignForProduct(
  productId: string,
  now: Date = new Date()
): Promise<CampaignRow | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canSee) return null

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  const { data: memberships, error } = await queryClient
    .from('campaign_products')
    .select('campaign_id, campaigns(*)')
    .eq('product_id', productId)

  if (error || !memberships || memberships.length === 0) return null

  const activeCampaigns: CampaignRow[] = []

  for (const row of memberships as any[]) {
    const campaign = row.campaigns
    if (!campaign || campaign.deleted_at) continue
    const fields: CampaignSaleFields = {
      discountPercent: campaign.discount_percent,
      startsAt: campaign.starts_at,
      endsAt: campaign.ends_at,
      isPaused: campaign.is_paused,
    }
    if (isCampaignRunning(fields, now)) {
      activeCampaigns.push(campaignRowFromDb(campaign))
    }
  }

  if (activeCampaigns.length === 0) return null

  // If a product is in multiple running campaigns, pick the highest discount.
  if (activeCampaigns.length > 1) {
    activeCampaigns.sort((a, b) => b.discount_percent - a.discount_percent)
    console.warn(`Product ${productId} is in ${activeCampaigns.length} running campaigns; using highest discount.`)
  }

  return activeCampaigns[0]
}

export async function createCampaign(data: CampaignFormData): Promise<{ campaign?: CampaignRow; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canAdd) return { error: 'Not authorised' }

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  const normalized = normalizeCampaignData(data)
  const validationError = await validateCampaignData(queryClient, normalized)
  if (validationError) return { error: validationError }

  const { data: campaign, error } = await queryClient
    .from('campaigns')
    .insert({
      name: normalized.name,
      discount_percent: normalized.discount_percent,
      starts_at: normalized.starts_at,
      ends_at: normalized.ends_at,
      label: normalized.label,
    })
    .select()
    .single()

  if (error || !campaign) {
    return { error: safeActionError('campaigns.createCampaign', error, 'Could not create campaign.') }
  }

  if (normalized.product_ids.length > 0) {
    const insertRows = normalized.product_ids.map((productId) => ({
      campaign_id: campaign.id,
      product_id: productId,
    }))

    const { error: joinError } = await queryClient.from('campaign_products').insert(insertRows)
    if (joinError) {
      console.error('campaigns.createCampaign join error:', joinError)
      return { error: 'Campaign created but some products could not be added.' }
    }
  }

  revalidatePath('/admin/campaigns')
  revalidatePath('/admin/products')

  return { campaign: campaignRowFromDb(campaign) }
}

export async function updateCampaign(id: string, data: CampaignFormData): Promise<{ campaign?: CampaignRow; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canEdit) return { error: 'Not authorised' }

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  const normalized = normalizeCampaignData(data)
  const validationError = await validateCampaignData(queryClient, normalized)
  if (validationError) return { error: validationError }

  const { data: existing, error: existingError } = await queryClient
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (existingError || !existing) {
    return { error: existingError ? safeActionError('campaigns.updateCampaign', existingError, 'Campaign not found.') : 'Campaign not found.' }
  }

  const { error } = await queryClient
    .from('campaigns')
    .update({
      name: normalized.name,
      discount_percent: normalized.discount_percent,
      starts_at: normalized.starts_at,
      ends_at: normalized.ends_at,
      label: normalized.label,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    return { error: safeActionError('campaigns.updateCampaign', error, 'Could not update campaign.') }
  }

  // Sync products atomically-ish: insert the new set FIRST, then delete rows
  // whose product_id is not in the new set. This ordering means an insert
  // failure leaves the campaign's existing products intact instead of wiping
  // them (the old delete-all-then-insert pattern lost everything on error).
  if (normalized.product_ids.length > 0) {
    const insertRows = normalized.product_ids.map((productId) => ({
      campaign_id: id,
      product_id: productId,
    }))
    const { error: joinError } = await queryClient
      .from('campaign_products')
      .upsert(insertRows, { onConflict: 'campaign_id,product_id', ignoreDuplicates: true })
    if (joinError) {
      console.error('campaigns.updateCampaign insert products error:', joinError)
      return { error: 'Campaign updated but some products could not be saved.' }
    }

    const { error: deleteError } = await queryClient
      .from('campaign_products')
      .delete()
      .eq('campaign_id', id)
      .not('product_id', 'in', `(${normalized.product_ids.join(',')})`)
    if (deleteError) {
      console.error('campaigns.updateCampaign delete products error:', deleteError)
      return { error: 'Campaign updated but removed products could not be cleared.' }
    }
  } else {
    const { error: deleteError } = await queryClient.from('campaign_products').delete().eq('campaign_id', id)
    if (deleteError) {
      console.error('campaigns.updateCampaign delete products error:', deleteError)
      return { error: 'Campaign updated but its products could not be cleared.' }
    }
  }

  revalidatePath('/admin/campaigns')
  revalidatePath(`/admin/campaigns/${id}/edit`)
  revalidatePath('/admin/products')

  const { data: campaign, error: fetchError } = await queryClient
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !campaign) {
    return { error: safeActionError('campaigns.updateCampaign.fetch', fetchError, 'Campaign updated but could not be reloaded.') }
  }

  return { campaign: campaignRowFromDb(campaign) }
}

export async function toggleCampaignPaused(id: string, isPaused: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canEdit) return { error: 'Not authorised' }

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  const { error } = await queryClient
    .from('campaigns')
    .update({ is_paused: isPaused, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    return { error: safeActionError('campaigns.toggleCampaignPaused', error, 'Could not update campaign.') }
  }

  revalidatePath('/admin/campaigns')
  revalidatePath(`/admin/campaigns/${id}/edit`)
  revalidatePath('/admin/products')

  return {}
}

export async function deleteCampaign(id: string, password: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated' }

  const perms = await getCampaignPermissions(supabase, user.id)
  if (!perms?.canDelete) return { error: 'Not authorised' }

  const queryClient = getCampaignDbClient(supabase, perms.isAdmin)

  // Verify deletion password using the existing DB function.
  const { data: verified, error: verifyError } = await supabase.rpc('verify_deletion_password', {
    p_password: password,
  })

  if (verifyError || !verified) {
    return { error: 'Incorrect deletion password' }
  }

  const { error } = await queryClient
    .from('campaigns')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) {
    return { error: safeActionError('campaigns.deleteCampaign', error, 'Could not delete campaign.') }
  }

  revalidatePath('/admin/campaigns')
  revalidatePath('/admin/products')

  return {}
}


