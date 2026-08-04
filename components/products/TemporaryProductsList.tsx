'use client'

// components/products/TemporaryProductsList.tsx
//
// Table/card view for temporary (walk-in) products. Mirrors the catalog
// table layout (Product, Code, Category, Unit, Price, Status, Actions) but
// handles nullable fields, shows missing-field chips, and surfaces the
// "Complete & promote" primary action.

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { cn } from '@/lib/utils'
import {
  temporaryProductMissingFields,
  type MissingFieldChip,
} from '@/lib/temporary'
import { deleteProductRecord, toggleProductActive } from '@/lib/actions/products'
import { Package, Zap, Hash, ArrowRight, Pencil, Trash2, Power } from 'lucide-react'

export interface TemporaryProductRow {
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
}

interface TemporaryProductsListProps {
  rows: TemporaryProductRow[]
  canShowPrices: boolean
  canEdit: boolean
  canDelete: boolean
}

function formatPrice(value: number | string | null | undefined): string | null {
  if (value == null) return null
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n) || n <= 0) return null
  return `£${n.toFixed(2)}`
}

function MissingFieldChips({ chips }: { chips: MissingFieldChip[] }) {
  if (chips.length === 0) {
    return (
      <span className="text-[10px] text-success">Ready to promote — just needs a save.</span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mr-1">
        Missing:
      </span>
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant={chip.blocksPromotion ? 'destructive' : 'outline'}
          className="text-[10px] font-medium"
          title={chip.hint}
        >
          {chip.label}
        </Badge>
      ))}
    </div>
  )
}

export function TemporaryProductsList({
  rows,
  canShowPrices,
  canEdit,
  canDelete,
}: TemporaryProductsListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggleActive = useCallback(
    async (product: TemporaryProductRow) => {
      if (!canEdit || togglingId) return
      setTogglingId(product.id)
      const result = await toggleProductActive(product.id, !product.is_active)
      setTogglingId(null)
      if (result.error) {
        alert(result.error)
        return
      }
      router.refresh()
    },
    [canEdit, togglingId, router]
  )

  const handleConfirmDelete = useCallback(
    async (password: string) => {
      if (!deletingId || !canDelete) return { error: 'Not authorised' }
      const result = await deleteProductRecord(deletingId, password)
      if (result.error) {
        return { error: result.error }
      }
      setDeletingId(null)
      router.refresh()
      return { error: undefined }
    },
    [deletingId, canDelete, router]
  )

  const renderDesktop = useCallback(
    (desktopRows: TemporaryProductRow[]) => (
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
            const chips = temporaryProductMissingFields(product)
            const priceText = formatPrice(product.default_price)
            return (
              <TableRow
                key={product.id}
                className={cn(
                  'bg-amber-50/[0.15] hover:bg-amber-50/40',
                  !product.is_active && 'bg-muted/50 text-muted-foreground hover:bg-muted'
                )}
              >
                <TableCell>
                  <div className="p-2 bg-amber-100 rounded-lg w-fit">
                    <Package className="w-4 h-4 text-amber-700" />
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="flex items-start gap-2">
                      <span className="font-medium text-foreground">{product.name}</span>
                      <Badge
                        variant="outline"
                        className="border-amber-300 text-amber-900 bg-amber-50 text-[10px] uppercase tracking-wide"
                      >
                        Temporary
                      </Badge>
                    </div>
                    <MissingFieldChips chips={chips} />
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Hash className="h-3 w-3" />
                    {product.code ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {product.category || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {product.unit || '-'}
                </TableCell>
                {canShowPrices && (
                  <TableCell className="text-muted-foreground">
                    {priceText ?? '-'}
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
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-9 w-9 text-amber-700 hover:text-amber-800 hover:bg-amber-100"
                      title="Complete & promote"
                    >
                      <Link href={`/admin/products/${product.id}/edit`}>
                        <Pencil className="w-4 h-4" />
                        <span className="sr-only">Complete &amp; promote</span>
                      </Link>
                    </Button>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(product)}
                        disabled={togglingId === product.id}
                        title={product.is_active ? 'Deactivate product' : 'Activate product'}
                        className={cn(
                          'h-9 w-9',
                          product.is_active
                            ? 'text-success hover:text-success hover:bg-success/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        )}
                      >
                        <Power className="w-4 h-4" />
                        <span className="sr-only">
                          {product.is_active ? 'Deactivate' : 'Activate'}
                        </span>
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingId(product.id)}
                        title="Delete product"
                        className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    ),
    [canShowPrices, canEdit, canDelete, togglingId, handleToggleActive]
  )

  const renderMobile = useCallback(
    (product: TemporaryProductRow) => {
      const chips = temporaryProductMissingFields(product)
      const priceText = formatPrice(product.default_price)
      return (
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="p-1.5 bg-amber-100 rounded-md w-fit shrink-0">
                <Zap className="w-4 h-4 text-amber-700" />
              </div>
              <p className="font-medium text-foreground truncate">{product.name}</p>
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-900 bg-amber-50 text-[10px] uppercase tracking-wide"
              >
                Temporary
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {product.code ?? 'No code'} · {product.category || 'No category'} ·{' '}
              {product.unit || 'No unit'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canShowPrices && (
                <span className="text-sm font-medium text-foreground">
                  {priceText ?? '-'}
                </span>
              )}
              {product.is_active ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-success-muted text-success">
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
            <MissingFieldChips chips={chips} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              asChild
              className="h-9 w-9 text-amber-700 hover:text-amber-800 hover:bg-amber-100"
              title="Complete & promote"
            >
              <Link href={`/admin/products/${product.id}/edit`}>
                <ArrowRight className="w-4 h-4" />
                <span className="sr-only">Complete &amp; promote</span>
              </Link>
            </Button>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleToggleActive(product)}
                disabled={togglingId === product.id}
                className={cn(
                  'h-9 w-9',
                  product.is_active
                    ? 'text-success hover:text-success hover:bg-success/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Power className="w-4 h-4" />
              </Button>
            )}
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setDeletingId(product.id)}
                className="h-9 w-9 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )
    },
    [canShowPrices, canEdit, canDelete, togglingId, handleToggleActive]
  )

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
      <DeletionPasswordDialog
        open={deletingId != null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title="Delete temporary product"
        description="This temporary product will be permanently deleted. Type your deletion password to confirm."
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
