'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeActionError } from '@/lib/errors'
import { resolveStaffPermissions } from '@/lib/auth/permissions'
import { slugifyCategory, type VariantOption } from '@/lib/public-products'
import { getCategoryCodePrefix } from '@/lib/products'

function revalidateProductPublicPaths(code: string, category: string | null) {
  revalidatePath('/admin/products')
  revalidatePath('/quote')
  revalidatePath('/catalogue')
  revalidatePath('/sitemap.xml')
  revalidatePath('/llms.txt')
  revalidatePath(`/products/${code}`)
  if (category) {
    revalidatePath(`/quote/${slugifyCategory(category)}`)
  }
}

export interface ProductFormData {
  code: string
  name: string
  description: string
  unit: string
  category: string
  default_price: number
  image_url: string
  is_active: boolean
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  coverage_m2_per_unit: number | null
  coverage_linear_m_per_unit: number | null
  unit_weight_kg: number | null
  pack_size: number | null
  wastage_pct: number | null
  calculator_type: string
  /**
   * Optional "from" starting price (the lowest entry-point across sizes /
   * variants). Shown as "From £X per unit" on the public PDP. Null = use the
   * single default_price on the public page instead.
   */
  price_from: number | null
  /** Whether the listed prices already include VAT @ 20%. Default false. */
  price_includes_vat: boolean
  /** Optional sale price in £. Null = no sale configured. */
  sale_price: number | null
  /** ISO timestamp. Null = no scheduled start (sale is live / clearance). */
  sale_starts_at: string | null
  /** ISO timestamp. Null = open-ended (clearance). */
  sale_ends_at: string | null
  /** Free-text label ("Winter Sale", "Clearance", etc.). Null = no label. */
  sale_label: string | null
  track_stock: boolean
  stock_quantity: number
  reorder_level: number
  is_temporary?: boolean
  promoted_at?: string | null
  temp_placeholder_code?: boolean
  /**
   * When true the backend will auto-generate a sequential code from the
   * selected category if the client did not provide one. Mirrors the UI
   * "Auto-generate code" toggle so the decision is explicit on both sides.
   */
  auto_generate_code?: boolean
  /**
   * Variant options. Each variant represents a material/finish; each
   * variant carries one or more "selectors" (e.g. size, length, finish)
   * with their own option lists. Drives the public product page dropdown.
   *
   * Shape mirrors the columns used by lib/public-products.ts and the
   * existing Parker Steel import — see VariantOption / VariantSelector.
   */
  variant_options?: VariantOption[] | null
  /** Material names for the product, surfaced as a schema.org/Product.material array. */
  materials?: string[] | null
  /** URL slug for the product family. Empty for non-variant products. */
  family_slug?: string | null
  /**
   * Free-form search tags indexed at weight C by the search RPC. The
   * admin form auto-populates this with the variant option texts so a
   * customer typing "UB 127x76x13kg" matches the consolidated Universal
   * Beam product without us having to teach the RPC about
   * variant_options. See migration 158 and 159 for the bulk backfill
   * applied during the steel consolidation.
   */
  search_tags?: string[] | null
}

/**
 * Minimum input accepted by createQuickProductRecord. Only the product name
 * is required for a temporary row — code is auto-generated as TEMP-XXXXXX,
 * price defaults to 0, unit defaults to 'EA'. Staff flesh out the rest from
 * the "Temporary products" section of the dashboard.
 */
export interface QuickProductFormData {
  name: string
  unit?: string
}

function normalizeProductData(data: ProductFormData): ProductFormData {
  return {
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    description: data.description?.trim() || '',
    unit: data.unit.trim().toUpperCase(),
    category: data.category?.trim() || '',
    default_price: Number(data.default_price) || 0,
    image_url: data.image_url?.trim() || '',
    is_active: data.is_active,
    price_from:
      data.price_from != null && Number.isFinite(Number(data.price_from)) && Number(data.price_from) > 0
        ? Number(data.price_from)
        : null,
    price_includes_vat: data.price_includes_vat === true,
    length_mm: Number.isFinite(data.length_mm) && data.length_mm != null ? Number(data.length_mm) : null,
    width_mm: Number.isFinite(data.width_mm) && data.width_mm != null ? Number(data.width_mm) : null,
    height_mm: Number.isFinite(data.height_mm) && data.height_mm != null ? Number(data.height_mm) : null,
    thickness_mm: Number.isFinite(data.thickness_mm) && data.thickness_mm != null ? Number(data.thickness_mm) : null,
    coverage_m2_per_unit: Number.isFinite(data.coverage_m2_per_unit) && data.coverage_m2_per_unit != null ? Number(data.coverage_m2_per_unit) : null,
    coverage_linear_m_per_unit: Number.isFinite(data.coverage_linear_m_per_unit) && data.coverage_linear_m_per_unit != null ? Number(data.coverage_linear_m_per_unit) : null,
    unit_weight_kg: Number.isFinite(data.unit_weight_kg) && data.unit_weight_kg != null ? Number(data.unit_weight_kg) : null,
    pack_size: Number.isFinite(data.pack_size) && data.pack_size != null ? Number(data.pack_size) : null,
    wastage_pct: Number.isFinite(data.wastage_pct) && data.wastage_pct != null ? Number(data.wastage_pct) : 5,
    calculator_type: data.calculator_type?.trim() || '',
    sale_price:
      data.sale_price != null && Number.isFinite(Number(data.sale_price)) && Number(data.sale_price) > 0
        ? Number(data.sale_price)
        : null,
    sale_starts_at:
      typeof data.sale_starts_at === 'string' && data.sale_starts_at.trim()
        ? data.sale_starts_at.trim()
        : null,
    sale_ends_at:
      typeof data.sale_ends_at === 'string' && data.sale_ends_at.trim()
        ? data.sale_ends_at.trim()
        : null,
    sale_label:
      typeof data.sale_label === 'string' && data.sale_label.trim()
        ? data.sale_label.trim()
        : null,
    track_stock: data.track_stock === true,
    stock_quantity:
      Number.isFinite(data.stock_quantity) && data.stock_quantity != null
        ? Math.round(Number(data.stock_quantity) * 1000) / 1000
        : 0,
    reorder_level:
      Number.isFinite(data.reorder_level) && data.reorder_level != null
        ? Math.round(Number(data.reorder_level) * 1000) / 1000
        : 0,
    auto_generate_code: data.auto_generate_code === true,
    variant_options:
      data.variant_options === undefined || data.variant_options === null
        ? null
        : data.variant_options,
    materials: Array.isArray(data.materials)
      ? data.materials.filter((m): m is string => typeof m === 'string' && m.length > 0)
      : null,
    family_slug:
      typeof data.family_slug === 'string' && data.family_slug.trim()
        ? data.family_slug.trim().toLowerCase()
        : null,
    search_tags: Array.isArray(data.search_tags)
      ? Array.from(
          new Set(
            data.search_tags
              .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
              .filter((tag) => tag.length > 0)
          )
        )
      : null,
  }
}

function validateProductData(data: ProductFormData): string | null {
  if (!data.code.trim()) {
    return 'Product code is required'
  }
  if (!data.name.trim()) {
    return 'Product name is required'
  }
  if (!data.unit.trim()) {
    return 'Unit is required'
  }
  if (!data.category.trim()) {
    return 'Category is required'
  }
  if (!Number.isFinite(data.default_price) || data.default_price < 0) {
    return 'Price cannot be negative'
  }
  if (data.price_from != null) {
    if (!Number.isFinite(data.price_from) || data.price_from < 0) {
      return '"From" price cannot be negative'
    }
    if (data.price_from > data.default_price) {
      return '"From" price cannot exceed the trade price'
    }
  }
  if (data.sale_price != null && data.sale_price >= data.default_price) {
    return 'Sale price must be lower than the default price'
  }
  if (data.sale_price != null && data.sale_price < 0) {
    return 'Sale price cannot be negative'
  }
  if (
    data.sale_starts_at &&
    data.sale_ends_at &&
    new Date(data.sale_starts_at).getTime() >= new Date(data.sale_ends_at).getTime()
  ) {
    return 'Sale end date must be after the start date'
  }
  return null
}

/**
 * Generate a TEMP-XXXXXX placeholder code. Avoids colliding with real codes
 * by always prefixing with "TEMP-" and using a random 8-char hex suffix.
 * Even though collisions inside TEMP- are astronomically unlikely, we still
 * retry once on a unique-violation just in case.
 */
function generateTempProductCode(): string {
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase()
  return `TEMP-${rand}`
}

/**
 * What we consider "complete enough" for a temporary product to be auto-promoted
 * out of the "Temporary products" section into the main catalog:
 *   * real (non-placeholder) code
 *   * description present
 *   * a non-zero price set
 *
 * Once those are in place, the staff has done the minimum to make the row
 * usable from the public catalogue and/or any further invoices.
 */
function isProductCompleteEnough(data: ProductFormData): boolean {
  const hasRealCode = !!(data.code && data.code.trim() && !data.code.startsWith('TEMP-'))
  const hasDescription = !!(data.description && data.description.trim())
  const hasPrice = data.default_price > 0
  return hasRealCode && hasDescription && hasPrice
}

/**
 * If the row is currently temporary, decide what promotion fields to flip on
 * the next write. Returns an empty object when no-op so callers can just
 * spread it into the main update payload without conditional logic.
 */
function applyProductAutoPromote(payload: Partial<ProductFormData>, existing: {
  is_temporary: boolean
  temp_placeholder_code: boolean
  code: string
}): Partial<ProductFormData> {
  if (!existing.is_temporary) return {}
  const nextIsComplete = isProductCompleteEnough({
    ...payload,
    code: payload.code ?? existing.code,
  } as ProductFormData)
  if (!nextIsComplete) return {}
  return {
    is_temporary: false,
    promoted_at: new Date().toISOString(),
    // Force-clear the placeholder flag so the dashboard stops showing the
    // "real code still missing" chip after promotion.
    temp_placeholder_code: false,
  }
}

interface PermissionLookup {
  isAdmin: boolean
  canAdd: boolean
  canEdit: boolean
  canDelete: boolean
}

/**
 * Loads the caller's permission row and returns the product-related
 * flags in one go. Admins always pass; staff pass when the admin
 * enabled the matching toggle in Settings.
 */
export async function getProductPermissions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PermissionLookup | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, permissions')
    .eq('id', userId)
    .maybeSingle()
  if (!profile) return null
  const isAdmin = profile.role === 'admin'
  const perms = resolveStaffPermissions(profile.role, profile.permissions)
  return {
    isAdmin,
    canAdd: isAdmin || perms.products_add,
    canEdit: isAdmin || perms.products_edit,
    canDelete: isAdmin || perms.products_delete,
  }
}

/**
 * Generate the next sequential code for a category (e.g. "Steel & Lintels" → "STL-014").
 * Looks at existing products whose code matches the category prefix and returns
 * the next unused 3-digit suffix. This is a UI convenience helper; callers still
 * rely on the unique constraint to catch any race.
 */
export async function generateProductCode(category: string) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms?.canAdd) {
    return { error: 'Not authorised' }
  }

  const prefix = getCategoryCodePrefix(category)

  const { data: rows, error } = await admin
    .from('products')
    .select('code')
    .is('deleted_at', null)
    .like('code', `${prefix}-%`)

  if (error) {
    return { error: safeActionError('products.generateProductCode', error, 'Could not generate product code.') }
  }

  let max = 0
  for (const row of rows ?? []) {
    const suffix = row.code?.split('-')[1]
    if (!suffix) continue
    const num = Number.parseInt(suffix, 10)
    if (Number.isFinite(num) && num > max) {
      max = num
    }
  }

  const next = max + 1
  return { code: `${prefix}-${String(next).padStart(3, '0')}` }
}

/**
 * Backend safety net for auto-generated codes. When the client requests
 * auto-generation but no code was produced (e.g. client-side race or the
 * user toggled the option after clearing the field), generate one from the
 * category before the write proceeds.
 */
async function ensureAutoGeneratedCode(
  data: ProductFormData
): Promise<{ code: string } | { error: string }> {
  const category = data.category.trim()
  if (!category) {
    return { error: 'Category is required to auto-generate a code' }
  }
  return generateProductCode(category)
}

export async function createProductRecord(data: ProductFormData) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canAdd) {
    return { error: 'Your account is not allowed to add products. Ask an administrator.' }
  }

  const normalized = normalizeProductData(data)

  // Backend trigger path: when the UI requested auto-generation but the code
  // field is still empty, generate one from the category before validating.
  if (!normalized.code && normalized.auto_generate_code) {
    const generated = await ensureAutoGeneratedCode(normalized)
    if ('error' in generated) {
      return { error: generated.error }
    }
    normalized.code = generated.code
  }

  const validationError = validateProductData(normalized)
  if (validationError) {
    return { error: validationError }
  }

  const { data: product, error } = await admin
    .from('products')
    .insert({
      code: normalized.code,
      name: normalized.name,
      description: normalized.description || null,
      unit: normalized.unit,
      category: normalized.category || null,
      default_price: normalized.default_price,
      image_url: normalized.image_url || null,
      is_active: normalized.is_active,
      length_mm: normalized.length_mm,
      width_mm: normalized.width_mm,
      height_mm: normalized.height_mm,
      thickness_mm: normalized.thickness_mm,
      coverage_m2_per_unit: normalized.coverage_m2_per_unit,
      coverage_linear_m_per_unit: normalized.coverage_linear_m_per_unit,
      unit_weight_kg: normalized.unit_weight_kg,
      pack_size: normalized.pack_size,
      wastage_pct: normalized.wastage_pct,
      calculator_type: normalized.calculator_type || null,
      price_from: normalized.price_from,
      price_includes_vat: normalized.price_includes_vat,
      sale_price: normalized.sale_price,
      sale_starts_at: normalized.sale_starts_at,
      sale_ends_at: normalized.sale_ends_at,
      sale_label: normalized.sale_label,
      track_stock: normalized.track_stock,
      // Initial stock is set on create only; afterwards the counter is owned
      // by the dedicated stock flows (see updateProductRecord below).
      stock_quantity: normalized.stock_quantity,
      reorder_level: normalized.reorder_level,
      // Variant options, materials, family slug and search tags round-trip
      // into their respective JSONB / text[] columns. search_tags is
      // auto-populated by the form from the variant option texts so the
      // search RPC can match "UB 127x76x13kg" against the consolidated
      // Universal Beam product without us having to teach the RPC about
      // variant_options JSON shape.
      variant_options: normalized.variant_options ?? null,
      materials: normalized.materials ?? null,
      family_slug: normalized.family_slug ?? null,
      search_tags: normalized.search_tags ?? null,
      // Stamp the owner so update/delete can enforce per-row ownership
      // even if RLS is ever relaxed. Legacy products with created_by=NULL
      // are admin-only in the action layer.
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'A product with this code already exists' }
    }
    return { error: safeActionError('products.createProductRecord', error, 'Could not save the product.') }
  }

  revalidateProductPublicPaths(product.code, product.category)
  return { product }
}

/**
 * Quick-create path used by the inline "+ New" affordance on the invoice /
 * quote line item. Only the product name is required. The code is auto-
 * generated as TEMP-XXXXXX (and flagged via temp_placeholder_code=true) so the
 * NOT NULL constraint is satisfied without forcing the staff to invent a
 * real SKU on the spot. unit defaults to 'EA', default_price to 0.
 *
 * Like createQuickClientRecord, this is callable only by staff/admin via the
 * invoice/quote inline UI. The dedicated /admin/products/new page never invokes
 * it.
 */
export async function createQuickProductRecord(data: QuickProductFormData) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canAdd) {
    return { error: 'Your account is not allowed to add products. Ask an administrator.' }
  }

  const name = data.name.trim()
  const unit = (data.unit || 'EA').trim().toUpperCase() || 'EA'
  if (!name) {
    return { error: 'Product name is required' }
  }

  // Retry on the off chance of a placeholder code collision.
  let lastError: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateTempProductCode()
    const { data: product, error } = await admin
      .from('products')
      .insert({
        code,
        name,
        unit,
        description: null,
        category: null,
        default_price: 0,
        image_url: null,
        is_active: true,
        is_temporary: true,
        temp_placeholder_code: true,
        created_by: user.id,
      })
      .select()
      .single()
    if (!error && product) {
      revalidateProductPublicPaths(product.code, product.category)
      return { product }
    }
    if (error && error.code !== '23505') {
      return { error: safeActionError('products.createQuickProductRecord', error, 'Could not save the product.') }
    }
    lastError = 'Could not allocate a placeholder code, please try again.'
  }

  return { error: lastError || 'Could not allocate a placeholder code, please try again.' }
}

export async function updateProductRecord(id: string, data: ProductFormData) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canEdit) {
    return { error: 'Your account is not allowed to edit products. Ask an administrator.' }
  }

  // Per-product ownership check. Defense in depth on top of the RLS
  // admin-only-write policy — keeps the model consistent with clients.ts
  // and protects against future RLS changes. Legacy rows (created_by IS
  // NULL) fall back to admin-only; admins always pass.
  const { data: existing } = await admin
    .from('products')
    .select('id, code, category, created_by, is_temporary, temp_placeholder_code, sale_price, sale_starts_at, sale_ends_at, sale_label')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) {
    return { error: 'Product not found' }
  }
  if (!perms.isAdmin) {
    if (existing.created_by && existing.created_by !== user.id) {
      return { error: 'You can only edit products you created. Ask an administrator.' }
    }
    if (!existing.created_by) {
      // Legacy product without an owner — staff can't touch it.
      return { error: 'You can only edit products you created. Ask an administrator.' }
    }
  }

  const normalized = normalizeProductData(data)

  // Backend trigger path: when the UI requested auto-generation but the code
  // field is still empty, generate one from the category before validating.
  if (!normalized.code && normalized.auto_generate_code) {
    const generated = await ensureAutoGeneratedCode(normalized)
    if ('error' in generated) {
      return { error: generated.error }
    }
    normalized.code = generated.code
  }

  const validationError = validateProductData(normalized)
  if (validationError) {
    return { error: validationError }
  }

  // Only Show-price products can carry individual sale data. This is enforced
  // server-side even though the product form no longer exposes sale fields.
  const isShowPrice = normalized.default_price > 0 && normalized.price_from == null
  if (
    !isShowPrice &&
    (normalized.sale_price != null ||
      normalized.sale_starts_at != null ||
      normalized.sale_ends_at != null ||
      normalized.sale_label != null)
  ) {
    return { error: 'Only Show-price products can have a discount.' }
  }

  // Auto-promote: if the row was created as a temporary walk-in (is_temporary
  // = true) and the operator has now entered a real (non-placeholder) code,
  // a description, and a non-zero price, flip it to a permanent product in
  // the same write. Staff editing a temp row becomes "fill in details" not
  // "promote manually".
  const promotionFields = applyProductAutoPromote(
    {
      code: normalized.code,
      description: normalized.description,
      default_price: normalized.default_price,
    },
    {
      is_temporary: existing.is_temporary,
      temp_placeholder_code: existing.temp_placeholder_code,
      code: existing.code,
    }
  )

  const { data: product, error } = await admin
    .from('products')
    .update({
      code: normalized.code,
      name: normalized.name,
      description: normalized.description || null,
      unit: normalized.unit,
      category: normalized.category || null,
      default_price: normalized.default_price,
      image_url: normalized.image_url || null,
      is_active: normalized.is_active,
      length_mm: normalized.length_mm,
      width_mm: normalized.width_mm,
      height_mm: normalized.height_mm,
      thickness_mm: normalized.thickness_mm,
      coverage_m2_per_unit: normalized.coverage_m2_per_unit,
      coverage_linear_m_per_unit: normalized.coverage_linear_m_per_unit,
      unit_weight_kg: normalized.unit_weight_kg,
      pack_size: normalized.pack_size,
      wastage_pct: normalized.wastage_pct,
      calculator_type: normalized.calculator_type || null,
      price_from: normalized.price_from,
      price_includes_vat: normalized.price_includes_vat,
      sale_price: normalized.sale_price,
      sale_starts_at: normalized.sale_starts_at,
      sale_ends_at: normalized.sale_ends_at,
      sale_label: normalized.sale_label,
      track_stock: normalized.track_stock,
      // stock_quantity is deliberately NOT updated here. It is a live counter
      // owned by the dedicated stock flows (set_product_stock RPC, stock
      // takes, goods-in, invoice deductions); the edit form seeds its value
      // when opened, so writing it back on save would silently overwrite any
      // concurrent stock movement (lost-update race). Use the Stock tab to
      // adjust levels.
      reorder_level: normalized.reorder_level,
      // Variant options, materials, family slug and search tags round-trip
      // into their respective JSONB / text[] columns.
      variant_options: normalized.variant_options ?? null,
      materials: normalized.materials ?? null,
      family_slug: normalized.family_slug ?? null,
      search_tags: normalized.search_tags ?? null,
      // Recompute the placeholder flag on every edit so the dashboard "real
      // code missing" chip stays in sync even when the row hasn't been
      // promoted yet.
      temp_placeholder_code: normalized.code.startsWith('TEMP-'),
      ...promotionFields,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'A product with this code already exists' }
    }
    return { error: safeActionError('products.updateProductRecord', error, 'Could not save the product.') }
  }

  revalidateProductPublicPaths(product.code, product.category)
  return { product }
}

/**
 * Quick toggle for a product's active flag. Used by the dashboard row action
 * so staff can activate/deactivate products without opening the full edit form.
 */
export async function toggleProductActive(id: string, nextIsActive: boolean) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canEdit) {
    return { error: 'Your account is not allowed to edit products. Ask an administrator.' }
  }

  const { data: existing } = await admin
    .from('products')
    .select('id, code, category, created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) {
    return { error: 'Product not found' }
  }
  if (!perms.isAdmin) {
    if (existing.created_by && existing.created_by !== user.id) {
      return { error: 'You can only edit products you created. Ask an administrator.' }
    }
    if (!existing.created_by) {
      return { error: 'You can only edit products you created. Ask an administrator.' }
    }
  }

  const { data: product, error } = await admin
    .from('products')
    .update({ is_active: nextIsActive })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: safeActionError('products.toggleProductActive', error, 'Could not update product status.') }
  }

  revalidateProductPublicPaths(product.code, product.category)
  return { product }
}

export interface ProductSeoData {
  seo_title?: string | null
  seo_description?: string | null
  short_description?: string | null
  key_features?: string[]
  brand?: string | null
  mpn?: string | null
  price_from?: number | null
  applications?: string[]
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v.length > 0)
}

/**
 * Update only the SEO/structured-data fields for a product. Admins and staff
 * with products_edit can update any product's SEO (ownership check is skipped
 * because SEO is a site-wide concern, not per-creator content).
 */
export async function updateProductSeo(id: string, data: ProductSeoData) {
  const supabase = await createClient()
  const admin = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canEdit) {
    return { error: 'Your account is not allowed to edit products. Ask an administrator.' }
  }

  const { data: existing } = await admin
    .from('products')
    .select('id, default_price')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!existing) {
    return { error: 'Product not found' }
  }

  // Only touch price_from when the form actually supplies a value — an empty
  // field must not silently clear it. A provided value follows the same rule
  // as validateProductData: the "from" price cannot exceed the trade price.
  const priceFrom =
    typeof data.price_from === 'number' && Number.isFinite(data.price_from) && data.price_from > 0
      ? data.price_from
      : null
  const defaultPrice = Number(existing.default_price ?? 0)
  if (priceFrom !== null && defaultPrice > 0 && priceFrom > defaultPrice) {
    return { error: '"From" price cannot exceed the trade price' }
  }

  const update = {
    seo_title: typeof data.seo_title === 'string' ? data.seo_title.trim() || null : null,
    seo_description: typeof data.seo_description === 'string' ? data.seo_description.trim() || null : null,
    short_description: typeof data.short_description === 'string' ? data.short_description.trim() || null : null,
    key_features: normalizeStringArray(data.key_features) as unknown as string,
    brand: typeof data.brand === 'string' ? data.brand.trim() || null : null,
    mpn: typeof data.mpn === 'string' ? data.mpn.trim() || null : null,
    applications: normalizeStringArray(data.applications) as unknown as string,
    ...(priceFrom !== null ? { price_from: priceFrom } : {}),
  }

  const { data: product, error } = await admin
    .from('products')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return { error: safeActionError('products.updateProductSeo', error, 'Could not save product SEO.') }
  }

  revalidateProductPublicPaths(product.code, product.category)
  return { product }
}

export async function deleteProductRecord(id: string, password: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  const perms = await getProductPermissions(supabase, user.id)
  if (!perms) {
    return { error: 'Not authorised' }
  }
  if (!perms.canDelete) {
    return { error: 'Your account is not allowed to delete products. Ask an administrator.' }
  }

  const hdrs = await headers()
  const ip =
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  const userAgent = hdrs.get('user-agent')?.slice(0, 500) || null

  // Capture the public paths BEFORE the soft delete — afterwards the row has
  // deleted_at set and a fresh lookup would return null.
  const { data: existing } = await supabase
    .from('products')
    .select('code, category')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  const { data: result, error } = await supabase.rpc('soft_delete_product', {
    p_product_id: id,
    p_password: password,
    p_ip_address: ip === 'unknown' ? null : ip,
    p_user_agent: userAgent,
  })

  if (error) {
    return { error: safeActionError('products.deleteProductRecord', error, 'Could not delete the product.') }
  }

  if (!result?.success) {
    return { error: result?.message || 'Could not delete the product.' }
  }

  if (existing) {
    revalidateProductPublicPaths(existing.code, existing.category)
  }

  return { success: true }
}
