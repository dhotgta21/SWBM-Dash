import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOperatorContext } from '@/lib/auth/context'
import { ADMIN_LOGIN_PATH } from '@/lib/auth/login-paths'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EyebrowChip, PageHeader } from '@/components/ui/PageHeader'
import {
  Search,
  Zap,
  Plus,
} from 'lucide-react'
import { ProductAddButton } from '@/components/products/ProductAddButton'
import { ProductsList } from '@/components/products/ProductsList'
import { ProductsViewTabs } from '@/components/products/ProductsViewTabs'
import { TemporaryProductsList } from '@/components/products/TemporaryProductsList'
import { Suspense } from 'react'
import { CampaignsPanel } from '@/components/campaigns/CampaignsPanel'
import { ProductDataDashboard } from '@/components/products/ProductDataDashboard'
import { StockPanel } from '@/components/products/StockPanel'
import { SectionErrorBoundary } from '@/components/ui/SectionErrorBoundary'
import { getStockAlerts } from '@/lib/actions/stock'
import { getSaleInfo } from '@/lib/products/sale'
import Link from 'next/link'
import { listCampaigns } from '@/lib/actions/campaigns'
import { listIndividualDiscountProducts } from '@/lib/actions/individual-discounts'

export const metadata = {
  title: 'Products',
}

interface ProductsPageProps {
  searchParams: Promise<{ q?: string; view?: string; tab?: string; filter?: string }>
}

interface ProductRow {
  id: string
  name: string
  code: string
  category: string | null
  unit: string
  default_price: number
  price_from: number | null
  price_includes_vat: boolean
  track_stock: boolean
  stock_quantity: number
  reorder_level: number
  is_active: boolean
  description: string
  image_url: string
  length_mm: number | null
  width_mm: number | null
  height_mm: number | null
  thickness_mm: number | null
  coverage_m2_per_unit: number | null
  coverage_linear_m_per_unit: number | null
  unit_weight_kg: number | null
  pack_size: number | null
  wastage_pct: number
  calculator_type: string
  sale_price: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
}

/**
 * Slim row shape used by the "Temporary products" tab. Carries only the
 * fields the chip logic + UI need — keeps the query small.
 */
interface TempProductRow {
  id: string
  code: string | null
  name: string
  description: string | null
  unit: string | null
  category: string | null
  default_price: number | string | null
  image_url: string | null
  temp_placeholder_code: boolean
  is_active: boolean
  created_at: string
  created_by: string | null
  is_temporary: boolean
  sale_price: number | string | null
  sale_starts_at: string | null
  sale_ends_at: string | null
  sale_label: string | null
}

/**
 * Resolve which outer tab the URL is asking for.
 *
 *   • `?view=catalog`     → Catalog
 *   • `?view=temporary`   → Temporary products
 *   • `?view=campaigns`   → Campaigns (Product discounts / Campaign groups)
 *   • `?view=stock`       → Stock (Stock take / Stock audit sub-tabs)
 *   • `?view=data`        → Product Dashboard
 *   • no `view`           → default. "Product Dashboard" is the headline tab;
 *                          falls back to "temporary" if the catalog is
 *                          empty but temps exist (so the operator lands
 *                          on the queue rather than an empty dashboard).
 */
function resolveView(
  rawView: string | undefined,
  catalogCount: number,
  tempCount: number
): 'data' | 'catalog' | 'temporary' | 'campaigns' | 'stock' {
  if (rawView === 'catalog') return 'catalog'
  if (rawView === 'temporary') return 'temporary'
  if (rawView === 'campaigns') return 'campaigns'
  if (rawView === 'stock') return 'stock'
  if (rawView === 'data') return 'data'
  if (catalogCount === 0 && tempCount > 0) return 'temporary'
  return 'data'
}

function isMissingColumnError(error: { message?: string; code?: string } | null, column: string): boolean {
  if (!error?.message) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes(column.toLowerCase()) &&
    (msg.includes('does not exist') || msg.includes('schema cache') || error.code === '42703')
  )
}

type SupabaseLike = ReturnType<typeof createAdminClient>

/**
 * Count permanent vs temporary products. Retries without deleted_at /
 * is_temporary when the live DB was bootstrapped from a partial schema.
 */
async function loadProductTabCounts(
  supabase: SupabaseLike
): Promise<{ catalogCount: number; tempCount: number }> {
  const full = await Promise.all([
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', false)
      .is('deleted_at', null),
    supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('is_temporary', true)
      .is('deleted_at', null),
  ])

  const [catalogRes, tempRes] = full
  const missingSoftDelete =
    isMissingColumnError(catalogRes.error, 'deleted_at') ||
    isMissingColumnError(tempRes.error, 'deleted_at')
  const missingTemporary =
    isMissingColumnError(catalogRes.error, 'is_temporary') ||
    isMissingColumnError(tempRes.error, 'is_temporary')

  if (!catalogRes.error && !tempRes.error) {
    return {
      catalogCount: catalogRes.count ?? 0,
      tempCount: tempRes.count ?? 0,
    }
  }

  if (missingSoftDelete || missingTemporary) {
    console.warn(
      'admin/products: soft-delete/temporary columns missing; counting without those filters. Run supabase/seed/00b_fix_products_columns_and_rls.sql'
    )
    if (missingTemporary) {
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
      if (error) {
        console.error('admin/products: fallback product count failed', error)
        return { catalogCount: 0, tempCount: 0 }
      }
      return { catalogCount: count ?? 0, tempCount: 0 }
    }
    // has is_temporary but not deleted_at
    const [c, t] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_temporary', false),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_temporary', true),
    ])
    return { catalogCount: c.count ?? 0, tempCount: t.count ?? 0 }
  }

  console.error('admin/products: product counts failed', catalogRes.error ?? tempRes.error)
  return { catalogCount: 0, tempCount: 0 }
}

async function loadCatalogProducts(supabase: SupabaseLike, query: string): Promise<ProductRow[]> {
  if (query.trim()) {
    const { data: searchResults, error } = await supabase.rpc('search_products', {
      p_query: query,
      p_limit: 1000,
      p_active_only: false,
    })
    if (error) {
      console.warn('admin/products: search_products RPC failed, falling back to list', error.message)
    } else {
      return (searchResults as ProductRow[] | null) ?? []
    }
  }

  const withDeleted = await supabase.from('products').select('*').is('deleted_at', null).order('name')
  if (!withDeleted.error) {
    return (withDeleted.data as ProductRow[] | null) ?? []
  }

  if (isMissingColumnError(withDeleted.error, 'deleted_at')) {
    console.warn('admin/products: deleted_at missing; loading catalog without soft-delete filter')
    const fallback = await supabase.from('products').select('*').order('name')
    if (fallback.error) {
      console.error('admin/products: catalog fallback failed', fallback.error)
      return []
    }
    return (fallback.data as ProductRow[] | null) ?? []
  }

  console.error('admin/products: catalog load failed', withDeleted.error)
  return []
}

async function loadTemporaryProducts(
  supabase: SupabaseLike,
  query: string
): Promise<TempProductRow[]> {
  const selectCols =
    'id, code, name, description, unit, category, default_price, image_url, temp_placeholder_code, is_active, created_at, created_by, is_temporary, sale_price, sale_starts_at, sale_ends_at, sale_label'

  const full = await supabase
    .from('products')
    .select(selectCols)
    .eq('is_temporary', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  let rows: TempProductRow[] = []
  if (!full.error) {
    rows = ((full.data ?? []) as unknown) as TempProductRow[]
  } else if (isMissingColumnError(full.error, 'is_temporary')) {
    // No temporary-product support on this schema.
    return []
  } else if (isMissingColumnError(full.error, 'deleted_at')) {
    const fallback = await supabase
      .from('products')
      .select(selectCols)
      .eq('is_temporary', true)
      .order('created_at', { ascending: false })
    if (fallback.error) {
      console.error('admin/products: temporary fallback failed', fallback.error)
      return []
    }
    rows = ((fallback.data ?? []) as unknown) as TempProductRow[]
  } else {
    console.error('admin/products: temporary load failed', full.error)
    return []
  }

  if (query) {
    const needle = query.trim().toLowerCase()
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.code ?? '').toLowerCase().includes(needle)
    )
  }
  return rows
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const ctx = await getOperatorContext()
  if (!ctx) redirect(ADMIN_LOGIN_PATH)
  if (!ctx.permissions.see_products) redirect('/invoices?view=due')

  // Per-capability flags, not a single "isAdmin" — staff who have
  // products_add enabled (default true per the operator's spec) see
  // the Add button, etc.
  const canAdd = ctx.isAdmin || ctx.permissions.products_add
  const canEdit = ctx.isAdmin || ctx.permissions.products_edit
  const canDelete = ctx.isAdmin || ctx.permissions.products_delete
  const canShowPrices = ctx.isAdmin || ctx.permissions.products_see_prices

  // Auth cookie client is only needed if we later touch session-bound APIs.
  // Product list data uses the service-role client so broken SELECT RLS cannot
  // hide rows from operators who already passed getOperatorContext().
  await createClient()
  const supabase = createAdminClient()

  const { q = '', view: rawView, tab, filter } = await searchParams
  const query = q

  // Legacy URL redirect: the old top-level "Stock audit" tab is now the
  // "Stock audit" sub-tab inside the combined Stock section. Send any
  // deep link (bookmark, old email, etc.) to the new path so the
  // operator lands on the same content under the new tab layout.
  if (rawView === 'stock-audit') {
    redirect('/admin/products?view=stock&tab=audit')
  }

  // ---------- Counts (always needed for tab strip + header) ----------
  // Prefer soft-delete + temporary filters. Demo DBs created from a partial
  // schema.sql may lack those columns; fall back so the list still loads.
  const { catalogCount, tempCount } = await loadProductTabCounts(supabase)

  // Resolve the active outer tab now that we know catalog/temp counts.
  // This ensures the temp-redirect logic works (catalog empty → temp tab).
  const activeView = resolveView(rawView, catalogCount, tempCount)

  // ---------- View-specific data (skip work for inactive tabs) ----------

  let products: ProductRow[] = []
  if (activeView === 'catalog') {
    products = await loadCatalogProducts(supabase, query)
  }

  let tempProducts: TempProductRow[] = []
  if (activeView === 'temporary') {
    tempProducts = await loadTemporaryProducts(supabase, query)
  }

  // Permanent-only catalog. The RPC already excludes temps by default
  // (see migration 065/066) but we re-filter defensively in case the
  // call site ever bypasses the RPC.
  const tempIdSet = new Set(tempProducts.map((p) => p.id))

  const productRows: ProductRow[] = (products ?? [])
    .filter((p) => !tempIdSet.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      category: p.category,
      unit: p.unit,
      default_price: p.default_price,
      // These five fields must round-trip into the quick-edit dialog:
      // updateProductRecord performs a full-row update, so omitting them
      // here would silently wipe pricing/VAT/stock settings on every save.
      price_from: p.price_from ?? null,
      price_includes_vat: p.price_includes_vat ?? false,
      track_stock: p.track_stock ?? false,
      stock_quantity: p.stock_quantity ?? 0,
      reorder_level: p.reorder_level ?? 0,
      is_active: p.is_active,
      description: p.description ?? '',
      image_url: p.image_url ?? '',
      length_mm: p.length_mm ?? null,
      width_mm: p.width_mm ?? null,
      height_mm: p.height_mm ?? null,
      thickness_mm: p.thickness_mm ?? null,
      coverage_m2_per_unit: p.coverage_m2_per_unit ?? null,
      coverage_linear_m_per_unit: p.coverage_linear_m_per_unit ?? null,
      unit_weight_kg: p.unit_weight_kg ?? null,
      pack_size: p.pack_size ?? null,
      wastage_pct: p.wastage_pct ?? 5,
      calculator_type: p.calculator_type ?? '',
      sale_price: p.sale_price ?? null,
      sale_starts_at: p.sale_starts_at ?? null,
      sale_ends_at: p.sale_ends_at ?? null,
      sale_label: p.sale_label ?? null,
    }))

  // Header stats — only meaningful on the Catalog tab (where productRows
  // is loaded); other tabs just show counts to avoid stale numbers.
  const activeCount = productRows.filter((p) => p.is_active).length
  const onSaleCount = productRows.filter((p) => getSaleInfo(p).active).length

  // Campaigns data — needed both for the tab-strip counts (always) and
  // for the CampaignsPanel content (only on the campaigns tab).
  // Stock-alerts count is needed for the Stock tab badge; the rest of
  // the Stock view's data (tracked products, audit history) is fetched
  // inside StockPanel so we don't pay for it on inactive tabs.
  const [
    { campaigns, error: campaignsError },
    { products: individualProducts, error: individualError },
    { alerts: stockAlerts },
  ] = await Promise.all([
    listCampaigns(),
    listIndividualDiscountProducts(
      filter as Parameters<typeof listIndividualDiscountProducts>[0]
    ),
    getStockAlerts(),
  ])

  const individualCount = individualProducts.length
  const campaignGroupCount = campaigns.length
  const stockAlertCount = stockAlerts?.length ?? 0

  // Inner sub-tab for the Campaigns view. CampaignsViewTabs uses `?tab=`
  // so it doesn't collide with the outer `?view=`.
  const innerTab: 'individual' | 'campaigns' =
    activeView === 'campaigns' && tab === 'campaigns' ? 'campaigns' : 'individual'

  // Inner sub-tab for the Stock view. StockViewTabs uses `?tab=` so it
  // doesn't collide with the outer `?view=`.
  const stockTab: 'take' | 'audit' = tab === 'audit' ? 'audit' : 'take'

  const headerDescription = (() => {
    if (activeView === 'catalog') {
      if (catalogCount === 0) {
        return 'Your product catalog is empty.'
      }
      return `${activeCount} active · ${onSaleCount} on sale · ${catalogCount} in catalog${tempCount > 0 ? ` · ${tempCount} temporary pending` : ''}.`
    }
    if (activeView === 'temporary') {
      if (tempCount === 0) return 'No walk-in products pending.'
      return `${tempCount} walk-in product${tempCount === 1 ? '' : 's'} pending completion.`
    }
    if (activeView === 'campaigns') {
      return `${individualCount} product discount${individualCount === 1 ? '' : 's'} · ${campaignGroupCount} campaign group${campaignGroupCount === 1 ? '' : 's'}.`
    }
    if (activeView === 'stock') {
      return stockTab === 'audit'
        ? 'History of every stock change — who, what, when.'
        : `${stockAlertCount} open stock alert${stockAlertCount === 1 ? '' : 's'} · update quantities for tracked products.`
    }
    // Product Dashboard tab
    return `Analytics for your catalog · ${catalogCount} product${catalogCount === 1 ? '' : 's'} · ${tempCount} temporary pending.`
  })()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<EyebrowChip label="Catalog" tone="info" />}
        title="Products"
        description={headerDescription}
        actions={
          activeView === 'campaigns' && innerTab === 'campaigns' && canAdd ? (
            <Button asChild>
              <Link href="/admin/campaigns/new">
                <Plus className="w-4 h-4 mr-2" />
                Add Campaign
              </Link>
            </Button>
          ) : activeView === 'data' || activeView === 'catalog' ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/admin/products/seo">Edit SEO</Link>
              </Button>
              {canAdd && <ProductAddButton />}
            </>
          ) : null
        }
      />

      <Suspense fallback={null}>
        <ProductsViewTabs
          catalogCount={catalogCount}
          temporaryCount={tempCount}
          campaignIndividualCount={individualCount}
          campaignGroupCount={campaignGroupCount}
          stockAlertCount={stockAlertCount}
          defaultView={resolveView(rawView, catalogCount, tempCount)}
        />
      </Suspense>

      {activeView === 'data' ? (
        <SectionErrorBoundary fallbackTitle="Could not load product data dashboard">
          <ProductDataDashboard />
        </SectionErrorBoundary>
      ) : activeView === 'catalog' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search catalog</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap gap-2">
                <input type="hidden" name="view" value="catalog" />
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    name="q"
                    defaultValue={query}
                    placeholder="Search by name or code..."
                    className="pl-9"
                  />
                </div>
                <Button type="submit">Search</Button>
              </form>
            </CardContent>
          </Card>

          {productRows.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <ProductsList
                  rows={productRows}
                  canShowPrices={canShowPrices}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {query
                ? 'No matching catalog products.'
                : 'No catalog products yet — add one above or capture a walk-in from any invoice or quote.'}
            </div>
          )}

          {!canAdd && !canEdit ? (
            <p className="text-sm text-muted-foreground">
              You have read-only access to the catalog. Contact an admin if you need to add or edit products.
            </p>
          ) : null}
        </div>
      ) : activeView === 'temporary' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Search temporary products</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="flex flex-wrap gap-2">
                <input type="hidden" name="view" value="temporary" />
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    name="q"
                    defaultValue={query}
                    placeholder="Search by name or code..."
                    className="pl-9"
                  />
                </div>
                <Button type="submit">Search</Button>
              </form>
            </CardContent>
          </Card>

          {tempProducts.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-700" />
                  <CardTitle className="text-amber-900">
                    Walk-in products needing completion ({tempProducts.length})
                  </CardTitle>
                </div>
                <p className="text-xs text-amber-900/80">
                  Quick-add rows from invoices/quotes. Click any row to fill in code, description and price — save promotes it to a permanent catalog entry.
                </p>
              </CardHeader>
              <CardContent>
                <TemporaryProductsList
                  rows={tempProducts}
                  canShowPrices={canShowPrices}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12 text-muted-foreground rounded-lg border border-dashed border-amber-200 bg-amber-50/40">
              <Zap className="mx-auto h-8 w-8 text-amber-500/70" />
              <p className="mt-3 text-sm font-medium text-foreground">No temporary products pending.</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                {query
                  ? 'No matches in the walk-in queue.'
                  : 'Walk-in products captured from invoices or quotes will appear here until they are promoted to a permanent catalog entry.'}
              </p>
            </div>
          )}
        </div>
      ) : activeView === 'campaigns' ? (
        <>
          {(campaignsError || individualError) ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {campaignsError ?? individualError}
            </div>
          ) : null}
          <CampaignsPanel
            activeView={innerTab}
            activeFilter={filter}
            canAdd={canAdd}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </>
      ) : activeView === 'stock' ? (
        <StockPanel activeTab={stockTab} canEdit={canEdit} />
      ) : null}
    </div>
  )
}