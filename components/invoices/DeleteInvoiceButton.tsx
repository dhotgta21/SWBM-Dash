'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeletionPasswordDialog } from '@/components/ui/DeletionPasswordDialog'
import { deleteInvoice } from '@/lib/actions/invoices'

interface DeleteInvoiceButtonProps {
  invoiceId: string
  documentNumber: string
  documentType: 'invoice' | 'quotation'
  isAdmin: boolean
  requiresConfirmation: boolean
}

export function DeleteInvoiceButton({
  invoiceId,
  documentNumber,
  documentType,
  isAdmin,
  requiresConfirmation,
}: DeleteInvoiceButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleConfirm(password: string) {
    if (requiresConfirmation && !isAdmin) {
      return {
        error:
          documentType === 'quotation'
            ? 'This quotation cannot be deleted by staff.'
            : 'This document cannot be deleted by staff.',
      }
    }

    const result = await deleteInvoice(invoiceId, password)
    if (result?.error) {
      return { error: result.error }
    }
    setOpen(false)
    router.push('/invoices')
    router.refresh()
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
        Delete {documentType === 'quotation' ? 'quotation' : 'invoice'}
      </Button>

      <DeletionPasswordDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${documentNumber}?`}
        description={
          requiresConfirmation ? (
            <>
              This document has recorded payments, is paid/partial, or was
              converted from a quotation. Only admins can delete it. The
              document will be hidden but can be restored from{' '}
              <strong>Recently deleted</strong>.
            </>
          ) : (
            <>
              This hides the document and its line items. It can be restored
              from <strong>Recently deleted</strong>.
            </>
          )
        }
        confirmLabel={`Delete ${documentType === 'quotation' ? 'quotation' : 'invoice'}`}
        onConfirm={handleConfirm}
      />
    </>
  )
}
