'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProductFormDialog } from './ProductForm'
import { Plus } from 'lucide-react'

export function ProductAddButton() {
  const [open, setOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)

  function handleOpen() {
    setDialogKey((prev) => prev + 1)
    setOpen(true)
  }

  return (
    <>
      <Button onClick={handleOpen}>
        <Plus className="w-4 h-4 mr-2" />
        Add Product
      </Button>
      <ProductFormDialog key={dialogKey} open={open} onOpenChange={setOpen} />
    </>
  )
}
