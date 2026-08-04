'use client'

import { useRouter } from 'next/navigation'
import { useState, useCallback, useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  clearIndividualDiscount,
  type IndividualDiscountProduct,
  type IndividualDiscountFilter,
} from '@/lib/actions/individual-discounts'
import { IndividualDiscountFormDialog } from './IndividualDiscountFormDialog'
import { Tag, Pencil, X, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatSaleDate } from '@/lib/products/sale'

interface IndividualDiscountsListProps {
  products: IndividualDiscountProduct[]
  canEdit: boolean
  activeFilter: IndividualDiscountFilter
}

const FILTER_OPTIONS: { value: IndividualDiscountFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'no-discount', label: 'No discount' },
  { value: 'live', label: 'Live now' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expiring-soon', label: 'Expiring soon' },
  { value: 'recently-ended', label: 'Recently ended' },
]

function StatusBadge({ status }: { status: IndividualDiscountProduct['status'] }) {
  const styles: Record<typeof status, string> = {
    none: 'bg-muted text-muted-foreground',
    live: 'bg-emerald-100 text-emerald-700',
    scheduled: 'bg-blue-100 text-blue-700',
    expiring: 'bg-amber-100 text-amber-700',
    'recently-ended': 'bg-slate-100 text-slate-700',
  }
  const labels: Record<typeof status, string> = {
    none: 'No discount',
    live: 'Live now',
    scheduled: 'Scheduled',
    expiring: 'Expiring soon',
    'recently-ended': 'Recently ended',
  }
  return (
    <Badge variant="default" className={cn('font-medium', styles[status])}>
      {labels[status]}
    </Badge>
  )
}

function ScheduleSummary({
  product,
}: {
  product: Pick<IndividualDiscountProduct, 'sale_starts_at' | 'sale_ends_at' | 'status'>
}) {
  if (product.status === 'none') return <span className="text-muted-foreground">—</span>
  const starts = product.sale_starts_at ? formatSaleDate(product.sale_starts_at) : 'Immediately'
  const ends = product.sale_ends_at ? formatSaleDate(product.sale_ends_at) : 'Open-ended'
  return (
    <span className="text-muted-foreground">
      {starts} → {ends}
    </span>
  )
}

export function IndividualDiscountsList({ products, canEdit, activeFilter }: IndividualDiscountsListProps) {
  const router = useRouter()
  const [editingProduct, setEditingProduct] = useState<IndividualDiscountProduct | null>(null)
  const [clearingId, setClearingId] = useState<string | null>(null)

  const handleClear = useCallback(
    async (productId: string) => {
      if (!canEdit || clearingId === productId) return
      setClearingId(productId)
      const result = await clearIndividualDiscount(productId)
      setClearingId(null)
      if (result.error) {
        alert(result.error)
        return
      }
      router.refresh()
    },
    [canEdit, clearingId, router]
  )

  const discountPercent = useCallback((product: IndividualDiscountProduct) => {
    if (product.sale_price == null || product.default_price <= 0) return 0
    return Math.round(((product.default_price - product.sale_price) / product.default_price) * 100)
  }, [])

  const renderDesktop = useCallback(
    (rows: IndividualDiscountProduct[]) => (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">
              <span className="sr-only">Icon</span>
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Trade price</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((product) => (
            <TableRow
              key={product.id}
              className={cn(
                product.status === 'live' && 'bg-emerald-50/[0.4]',
                product.status === 'expiring' && 'bg-amber-50/[0.4]'
              )}
            >
              <TableCell>
                <div className="p-2 bg-primary-muted rounded-lg w-fit">
                  <Tag className="w-4 h-4 text-primary" />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{product.code}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{product.category ?? '—'}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                £{product.default_price.toFixed(2)}
              </TableCell>
              <TableCell>
                {product.sale_price != null ? (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 w-fit">
                      <Percent className="w-3 h-3" />
                      −{discountPercent(product)}%
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      £{product.sale_price.toFixed(2)}
                    </span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={product.status} />
              </TableCell>
              <TableCell>
                <ScheduleSummary product={product} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingProduct(product)}
                      title={product.sale_price != null ? 'Edit discount' : 'Add discount'}
                      className="h-9 w-9"
                    >
                      <Pencil className="w-4 h-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                  )}
                  {canEdit && product.sale_price != null && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleClear(product.id)}
                      disabled={clearingId === product.id}
                      title="Clear discount"
                      className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                      <span className="sr-only">Clear</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    ),
    [canEdit, clearingId, discountPercent, handleClear]
  )

  const renderMobile = useCallback(
    (product: IndividualDiscountProduct) => (
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-1.5 bg-primary-muted rounded-md w-fit shrink-0">
              <Tag className="w-4 h-4 text-primary" />
            </div>
            <p className="font-medium text-foreground truncate">{product.name}</p>
            <StatusBadge status={product.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.code} · {product.category ?? 'No category'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Trade £{product.default_price.toFixed(2)}
            {product.sale_price != null && (
              <>
                {' · '}
                <span className="text-emerald-700 font-medium">
                  £{product.sale_price.toFixed(2)} (−{discountPercent(product)}%)
                </span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <ScheduleSummary product={product} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setEditingProduct(product)}
              className="h-9 w-9"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {canEdit && product.sale_price != null && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleClear(product.id)}
              disabled={clearingId === product.id}
              className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    ),
    [canEdit, clearingId, discountPercent, handleClear]
  )

  const table = useMemo(
    () => (
      <ResponsiveTable
        rows={products}
        keyField="id"
        renderDesktop={renderDesktop}
        renderMobile={renderMobile}
      />
    ),
    [products, renderDesktop, renderMobile]
  )

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Filter:</span>
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const url = new URL(window.location.href)
                if (opt.value === 'all') {
                  url.searchParams.delete('filter')
                } else {
                  url.searchParams.set('filter', opt.value)
                }
                window.history.replaceState({}, '', url.toString())
                router.refresh()
              }}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                activeFilter === opt.value || (opt.value === 'all' && activeFilter == null)
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-white text-muted-foreground hover:text-foreground border border-border'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {products.length} product{products.length === 1 ? '' : 's'}
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No products match the selected filter.</p>
        </div>
      ) : (
        table
      )}

      <IndividualDiscountFormDialog
        product={editingProduct}
        open={editingProduct != null}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        onSuccess={() => {
          setEditingProduct(null)
          router.refresh()
        }}
      />
    </>
  )
}
