'use client'

// components/products/ProductsList.tsx
//
// Client-side wrapper around the dashboard `/products` table. Mirrors the
// server-rendered `DesktopProductsTable` / `MobileProductCard` markup, but
// adds a click-anywhere-on-the-row handler that opens the read-only
// `ProductPreviewDialog`. Action buttons (Edit/Delete) stop event propagation
// so they still toggle their own dropdowns without accidentally triggering the
// preview.
//
// Why a client wrapper instead of moving the whole page to a client component:
// the page is server-rendered for permission gating, search via `?q=`, and a
// pair of Supabase queries — all of which need to stay synchronous on the
// server. This wrapper accepts pre-fetched rows + permissions as props and
// just owns the click state, which keeps the bundle small and the route
// fast.

import { useCallback, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { ProductActions } from '@/components/products/ProductActions'
import { ProductPreviewDialog, type ProductPreviewItem } from '@/components/products/ProductPreviewDialog'
import { cn } from '@/lib/utils'
import { getSaleInfo, describeSaleWindow } from '@/lib/products/sale'
import { Package, Sparkles } from 'lucide-react'
import type { ProductFormData } from '@/lib/actions/products'

interface ProductsListProps {
  rows: ProductPreviewItem[]
  canShowPrices: boolean
  canEdit: boolean
  canDelete: boolean
}

/**
 * Inner on-sale badge used by both desktop and mobile render paths. Kept
 * inline (no shared component import) to avoid pulling an extra file into the
 * client bundle — the markup is small enough to dedupe by eye.
 */
function SaleBadge({
  sale,
}: {
  sale: ReturnType<typeof getSaleInfo>
}) {
  const tone = sale.state === 'clearance' ? 'warning' : sale.state === 'live' ? 'success' : 'info'
  const tones: Record<typeof tone, string> = {
    warning: 'bg-warning-muted text-warning ring-1 ring-warning/20',
    success: 'bg-success-muted text-success ring-1 ring-success/20',
    info: 'bg-info-muted text-info ring-1 ring-info/20',
  }
  const label =
    sale.state === 'clearance'
      ? 'Clearance'
      : sale.state === 'live'
        ? sale.discountPercent > 0
          ? `-${sale.discountPercent}%`
          : 'Sale'
        : 'Sale'
  const window = describeSaleWindow(sale)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        tones[tone]
      )}
      title={sale.label ? `${sale.label}${window ? ` · ${window}` : ''}` : window ?? undefined}
    >
      <Sparkles className="h-3 w-3" />
      {label}
    </span>
  )
}

function productActionsPayload(
  product: ProductPreviewItem
): ProductFormData & { id: string } {
  // `ProductActions` consumes the same ProductFormData shape used by the
  // edit dialog — keep this conversion local so the catalog row type stays
  // lean.
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description ?? '',
    unit: product.unit,
    category: product.category ?? '',
    default_price: product.default_price,
    image_url: product.image_url ?? '',
    is_active: product.is_active,
    price_from: (product as { price_from?: number | null }).price_from ?? null,
    price_includes_vat: (product as { price_includes_vat?: boolean | null }).price_includes_vat ?? false,
    length_mm: product.length_mm ?? null,
    width_mm: product.width_mm ?? null,
    height_mm: product.height_mm ?? null,
    thickness_mm: product.thickness_mm ?? null,
    coverage_m2_per_unit: product.coverage_m2_per_unit ?? null,
    coverage_linear_m_per_unit: product.coverage_linear_m_per_unit ?? null,
    unit_weight_kg: product.unit_weight_kg ?? null,
    pack_size: product.pack_size ?? null,
    wastage_pct: product.wastage_pct ?? 5,
    calculator_type: product.calculator_type ?? '',
    sale_price: product.sale_price,
    sale_starts_at: product.sale_starts_at,
    sale_ends_at: product.sale_ends_at,
    sale_label: product.sale_label,
    track_stock: (product as { track_stock?: boolean | null }).track_stock ?? false,
    stock_quantity: (product as { stock_quantity?: number | null }).stock_quantity ?? 0,
    reorder_level: (product as { reorder_level?: number | null }).reorder_level ?? 0,
  }
}

export function ProductsList({
  rows,
  canShowPrices,
  canEdit,
  canDelete,
}: ProductsListProps) {
  const [previewing, setPreviewing] = useState<ProductPreviewItem | null>(null)

  const open = previewing != null

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) setPreviewing(null)
  }, [])

  const handleRowActivate = useCallback((product: ProductPreviewItem) => {
    setPreviewing(product)
  }, [])

  // Keyboard support: the desktop row gets role="button" + tabIndex so users
  // can scroll the table with Tab and press Enter/Space to preview — matches
  // the affordance of clicking on mobile.
  const handleRowKey = useCallback(
    (product: ProductPreviewItem) => (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setPreviewing(product)
      }
    },
    []
  )

  const renderDesktop = useCallback(
    (desktopRows: ProductPreviewItem[]) => (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">
              <span className="sr-only">Icon</span>
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Unit</TableHead>
            {canShowPrices && <TableHead>Price</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {desktopRows.map((product) => {
            const sale = getSaleInfo(product)
            const onSale = sale.active
            return (
              <TableRow
                key={product.id}
                role="button"
                tabIndex={0}
                aria-label={`Preview ${product.name}`}
                onClick={() => handleRowActivate(product)}
                onKeyDown={handleRowKey(product)}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  !product.is_active && 'bg-muted/50 text-muted-foreground hover:bg-muted',
                  onSale && 'bg-warning/[0.03] hover:bg-warning/[0.08]'
                )}
              >
                <TableCell>
                  <div className="p-2 bg-primary-muted rounded-lg w-fit">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-foreground">{product.name}</span>
                    {onSale ? (
                      <SaleBadge sale={sale} />
                    ) : sale.state === 'scheduled' ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-info-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info"
                        title={`Scheduled for ${sale.startsAt}`}
                      >
                        Upcoming
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{product.code}</TableCell>
                <TableCell className="text-muted-foreground">
                  {product.category || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                {canShowPrices && (
                  <TableCell className="text-muted-foreground">
                    {onSale ? (
                      <div className="flex flex-col leading-tight">
                        <span className="font-semibold text-foreground">
                          £{sale.effectivePrice.toFixed(2)}
                        </span>
                        <span className="text-xs line-through text-muted-foreground">
                          £{product.default_price.toFixed(2)}
                        </span>
                      </div>
                    ) : product.default_price > 0 ? (
                      `£${product.default_price.toFixed(2)}`
                    ) : (
                      '-'
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {product.is_active ? (
                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-success-muted text-success">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-muted text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {/*
                    Wrap the action cluster in a `stopPropagation` div so the
                    Edit / Delete buttons keep their native behaviour without
                    accidentally opening the preview popup. Keyboard users
                    still hit the row's Enter/Space binding because the focus
                    is on the row's role=button.
                  */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <ProductActions
                      product={productActionsPayload(product)}
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    ),
    [canEdit, canDelete, canShowPrices, handleRowActivate, handleRowKey]
  )

  const renderMobile = useCallback(
    (row: ProductPreviewItem) => {
      const sale = getSaleInfo(row)
      const onSale = sale.active
      return (
        <div
          className="flex items-start justify-between gap-3 p-4 cursor-pointer transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          role="button"
          tabIndex={0}
          aria-label={`Preview ${row.name}`}
          onClick={() => handleRowActivate(row)}
          onKeyDown={handleRowKey(row)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-1.5 bg-primary-muted rounded-md w-fit shrink-0">
                <Package className="w-4 h-4 text-primary" />
              </div>
              <p className="font-medium text-foreground truncate">{row.name}</p>
              {onSale ? <SaleBadge sale={sale} /> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.code} · {row.category || 'No category'} · {row.unit}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canShowPrices && (
                onSale ? (
                  <span className="inline-flex items-baseline gap-1.5">
                    <span className="text-sm font-semibold text-foreground">
                      £{sale.effectivePrice.toFixed(2)}
                    </span>
                    <span className="text-xs line-through text-muted-foreground">
                      £{row.default_price.toFixed(2)}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {row.default_price > 0
                      ? `£${row.default_price.toFixed(2)}`
                      : '-'}
                  </span>
                )
              )}
              {row.is_active ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success-muted text-success">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
          </div>
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <ProductActions
              product={productActionsPayload(row)}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
        </div>
      )
    },
    [canEdit, canDelete, canShowPrices, handleRowActivate, handleRowKey]
  )

  // Memo the inner ResponsiveTable to keep reconciliation cheap on long lists.
  const table = useMemo(
    () => (
      <ResponsiveTable
        rows={rows}
        keyField="id"
        renderDesktop={renderDesktop}
        renderMobile={renderMobile}
      />
    ),
    [rows, renderDesktop, renderMobile]
  )

  return (
    <>
      {table}
      <ProductPreviewDialog
        product={previewing}
        open={open}
        onOpenChange={handleOpenChange}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </>
  )
}
