'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  restoreClientRecord,
  restoreProductRecord,
  restoreInvoiceRecord,
} from '@/lib/actions/deleted'

interface ClientRow {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  account_number?: string | null
  deleted_at?: string | null
}

interface ProductRow {
  id: string
  code?: string | null
  name?: string | null
  category?: string | null
  deleted_at?: string | null
}

interface InvoiceClient {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
}

interface InvoiceRow {
  id: string
  document_number?: string | null
  type?: string | null
  status?: string | null
  total?: number | null
  deleted_at?: string | null
  clients?: InvoiceClient | InvoiceClient[] | null
}

interface RecentlyDeletedListProps {
  clients: ClientRow[]
  products: ProductRow[]
  invoices: InvoiceRow[]
  clientsError?: string
  productsError?: string
  invoicesError?: string
}

export function RecentlyDeletedList({
  clients,
  products,
  invoices,
  clientsError,
  productsError,
  invoicesError,
}: RecentlyDeletedListProps) {
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function restore(
    action: (id: string, password: string) => Promise<{ error?: string; success?: boolean }>,
    id: string
  ) {
    if (!password) {
      setFeedback({ kind: 'error', text: 'Enter the deletion password to restore.' })
      return
    }
    setFeedback(null)
    startTransition(async () => {
      const result = await action(id, password)
      if (result.error) {
        setFeedback({ kind: 'error', text: result.error })
      } else {
        setFeedback({ kind: 'info', text: 'Record restored successfully.' })
      }
    })
  }

  const total = clients.length + products.length + invoices.length

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`text-sm rounded-md px-3 py-2 ${
            feedback.kind === 'error'
              ? 'bg-destructive-muted text-destructive'
              : 'bg-success-muted text-success'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Deletion password"
          className="flex-1 min-w-0 rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No recently deleted records.</p>
      ) : (
        <div className="space-y-6">
          {clientsError && <p className="text-sm text-destructive">Clients error: {clientsError}</p>}
          {clients.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Clients ({clients.length})</h3>
              <ul className="divide-y border rounded-md">
                {clients.map((c) => (
                  <li key={c.id} className="flex items-center justify-between p-3 text-sm">
                    <span>
                      {c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.id}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => restore(restoreClientRecord, c.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {productsError && <p className="text-sm text-destructive">Products error: {productsError}</p>}
          {products.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Products ({products.length})</h3>
              <ul className="divide-y border rounded-md">
                {products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                    <span>{p.name || p.code || p.id}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => restore(restoreProductRecord, p.id)}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {invoicesError && <p className="text-sm text-destructive">Invoices error: {invoicesError}</p>}
          {invoices.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Invoices ({invoices.length})</h3>
              <ul className="divide-y border rounded-md">
                {invoices.map((i) => {
                  const client = Array.isArray(i.clients) ? i.clients[0] : i.clients
                  return (
                    <li key={i.id} className="flex items-center justify-between p-3 text-sm">
                      <span>
                        {i.document_number || i.id}
                        {client
                          ? ` — ${client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim()}`
                          : ''}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => restore(restoreInvoiceRecord, i.id)}
                      >
                        Restore
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
