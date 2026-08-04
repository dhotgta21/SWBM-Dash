'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { deleteClientRecord } from '@/lib/actions/clients'

interface DeleteClientButtonProps {
  clientId: string
  clientName: string
  invoiceCount: number
}

export function DeleteClientButton({
  clientId,
  clientName,
  invoiceCount,
}: DeleteClientButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const hasInvoices = invoiceCount > 0

  async function handleConfirm(password: string) {
    const result = await deleteClientRecord(clientId, password)
    if (result?.error) {
      return { error: result.error }
    }
    setOpen(false)
    router.push('/clients')
    router.refresh()
  }

  if (hasInvoices) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <strong>Cannot delete {clientName}</strong> — this client has{' '}
        {invoiceCount} invoice{invoiceCount === 1 ? '' : 's'}. Delete all
        invoices first, or create a new client instead.
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete client
      </Button>

      <DeletionPasswordDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${clientName}?`}
        description={
          <>
            This hides the client profile. It can be restored from{' '}
            <strong>Recently deleted</strong>. Invoices linked to this client
            must be removed before deletion is allowed.
          </>
        }
        confirmLabel="Delete client"
        onConfirm={handleConfirm}
      />
    </>
  )
}
