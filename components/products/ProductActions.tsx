'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ProductFormDialog } from './ProductForm'
import { deleteProductRecord, toggleProductActive, ProductFormData } from '@/lib/actions/products'
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { Pencil, Trash2, Power } from 'lucide-react'

interface ProductActionsProps {
  product: ProductFormData & { id: string }
  onChange?: () => void
  /** Per-capability flags. When the caller (the products page)
   *  doesn't pass these we default to "no access" — defence in
   *  depth so a missing parent gate can't quietly grant perms. */
  canEdit?: boolean
  canDelete?: boolean
}

export function ProductActions({
  product,
  onChange,
  canEdit = false,
  canDelete = false,
}: ProductActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function handleConfirmDelete(password: string) {
    if (!canDelete) return { error: 'Not authorised' }

    const result = await deleteProductRecord(product.id, password)
    if (result.error) {
      return { error: result.error }
    }

    setDeleteOpen(false)
    if (onChange) {
      onChange()
    } else {
      router.refresh()
    }
  }

  async function handleToggleActive() {
    if (!canEdit) return
    setToggling(true)
    const result = await toggleProductActive(product.id, !product.is_active)
    setToggling(false)

    if (result.error) {
      alert(result.error)
      return
    }

    if (onChange) {
      onChange()
    } else {
      router.refresh()
    }
  }

  // No actions allowed — render nothing rather than disabled buttons,
  // saves vertical space in the table and matches the page-level
  // "no actions column" behaviour.
  if (!canEdit && !canDelete) return null

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleToggleActive}
            disabled={toggling}
            title={product.is_active ? 'Deactivate product' : 'Activate product'}
            className={cn(
              'h-11 w-11',
              product.is_active
                ? 'text-success hover:text-success hover:bg-success/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Power className="w-4 h-4" />
            <span className="sr-only">{product.is_active ? 'Deactivate' : 'Activate'}</span>
          </Button>
        )}
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditOpen(true)}
            title="Edit product"
            className="h-11 w-11"
          >
            <Pencil className="w-4 h-4" />
            <span className="sr-only">Edit</span>
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDeleteOpen(true)}
            title="Delete product"
            className="h-11 w-11 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
            <span className="sr-only">Delete</span>
          </Button>
        )}
      </div>

      {canEdit && (
        <ProductFormDialog
          key={product.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          initialData={product}
          onSuccess={onChange}
        />
      )}

      {canDelete && (
        <DeletionPasswordDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${product.name}?`}
          description={
            <>
              This hides the product. It can be restored from{' '}
              <strong>Recently deleted</strong>. Existing invoices that
              reference it keep their line-item details.
            </>
          }
          confirmLabel="Delete product"
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
