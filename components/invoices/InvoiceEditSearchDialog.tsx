'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getInvoiceByNumber } from '@/lib/actions/invoices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Loader2, Search, X, ExternalLink } from 'lucide-react'

interface InvoiceResult {
  id: string
  type: 'invoice' | 'quotation'
  document_number: string
  status: string
  issue_date: string
  due_date: string | null
  expiry_date: string | null
  total: number
  amount_paid: number
  balance_due: number
  clients:
    | {
        id: string
        first_name: string | null
        last_name: string | null
        company_name: string | null
      }
    | {
        id: string
        first_name: string | null
        last_name: string | null
        company_name: string | null
      }[]
    | null
}

function clientName(
  client: { company_name?: string | null; first_name?: string | null; last_name?: string | null } | null | undefined
) {
  return (
    client?.company_name ||
    `${client?.first_name || ''} ${client?.last_name || ''}`.trim() ||
    'Unknown'
  )
}

interface InvoiceEditSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InvoiceEditSearchDialog({ open, onOpenChange }: InvoiceEditSearchDialogProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [invoice, setInvoice] = useState<InvoiceResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()

  function resetState() {
    setQuery('')
    setInvoice(null)
    setSearchError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetState()
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchError(null)
    setInvoice(null)

    if (!query.trim()) {
      setSearchError('Please enter a document number')
      return
    }

    startSearch(async () => {
      const result = await getInvoiceByNumber(query)
      if (result.error) {
        setSearchError(result.error)
      } else if (result.invoice) {
        setInvoice(result.invoice as InvoiceResult)
      }
    })
  }

  function handleEdit() {
    if (!invoice) return
    const target = `/invoices/${invoice.id}?tab=edit`
    handleOpenChange(false)
    router.push(target)
  }

  function handleClose() {
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogClose onClick={handleClose} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-red-700">Edit Invoice</span>
          </DialogTitle>
          <DialogDescription>
            Enter a document number or paste a public share link to find the invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. INV-2026-A1, A1, or a share link"
              className="pl-9"
              disabled={isSearching}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="sr-only sm:not-sr-only sm:ml-2">Search</span>
          </Button>
        </form>

        {searchError && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <X className="w-4 h-4 mt-0.5 shrink-0" />
            {searchError}
          </div>
        )}

        {invoice && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {invoice.document_number}
                  </p>
                  <p className="text-xs text-gray-500 capitalize mt-0.5">({invoice.type})</p>
                </div>
                {(() => {
                  const client = Array.isArray(invoice.clients)
                    ? invoice.clients[0]
                    : invoice.clients
                  return (
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{clientName(client)}</p>
                      <p className="text-xs text-gray-500">{formatDate(invoice.issue_date)}</p>
                    </div>
                  )
                })()}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(invoice.total)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Paid</p>
                  <p className="font-semibold text-green-600">{formatCurrency(invoice.amount_paid)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-xs text-gray-500">Balance</p>
                  <p
                    className={
                      invoice.balance_due > 0
                        ? 'font-semibold text-red-600'
                        : 'font-semibold text-green-600'
                    }
                  >
                    {formatCurrency(invoice.balance_due)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-gray-100">
                <Link
                  href={`/invoices/${invoice.id}?tab=edit`}
                  onClick={handleClose}
                  className="text-sm text-red-700 hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in new tab
                </Link>
                <div className="flex-1" />
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleEdit}>
                  Edit Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!invoice && (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={handleClose}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
