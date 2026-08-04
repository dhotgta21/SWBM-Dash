'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InvoiceUpdateDialog } from './InvoiceUpdateDialog'
import { Edit } from 'lucide-react'

export function InvoiceStatusUpdater() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Edit className="w-4 h-4 mr-2" />
        Update Invoice
      </Button>
      <InvoiceUpdateDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
