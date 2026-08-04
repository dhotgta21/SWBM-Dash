// components/quote-requests/QuoteItemsEditor.tsx
// Editable list of line items on a quote request. Submits the
// (itemId, quantity, unitPrice) tuple for every row in one go via
// the server action. The "Save changes" button is disabled while
// the form is clean (no edits) so the admin gets visual feedback
// about whether they have unsaved edits.

'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { updateQuoteRequestItems } from '@/lib/actions/admin-quote-requests'

interface ItemRow {
  id: string
  product_id: string | null
  product_code: string
  product_name: string
  unit: string
  quantity: number
  suggested_price: number | null
}

interface QuoteItemsEditorProps {
  requestId: string
  items: ItemRow[]
  disabled?: boolean
  canEdit?: boolean
}

interface DraftRow {
  itemId: string
  quantity: number
  unitPrice: number
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function QuoteItemsEditor({ requestId, items, disabled, canEdit = true }: QuoteItemsEditorProps) {
  // Build the initial draft from the server-provided rows. The
  // draft is what the form actually edits — server values never
  // change until the admin explicitly saves.
  const initialDraft = useMemo<DraftRow[]>(
    () =>
      items.map((it) => ({
        itemId: it.id,
        quantity: it.quantity,
        unitPrice: it.suggested_price ?? 0,
      })),
    [items]
  )

  const [draft, setDraft] = useState<DraftRow[]>(initialDraft)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startSave] = useTransition()

  const dirty = useMemo(() => {
    if (draft.length !== initialDraft.length) return true
    return draft.some((d, i) => {
      const init = initialDraft[i]
      return d.quantity !== init.quantity || d.unitPrice !== init.unitPrice
    })
  }, [draft, initialDraft])

  function update(index: number, patch: Partial<DraftRow>) {
    setSaved(false)
    setDraft((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startSave(async () => {
      const result = await updateQuoteRequestItems(requestId, draft)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  const totalsByIndex = draft.map((d) => Number((d.quantity * d.unitPrice).toFixed(2)))
  const grandTotal = Number(totalsByIndex.reduce((s, v) => s + v, 0).toFixed(2))

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">This request has no line items.</p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && !dirty && (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Product</th>
              <th className="px-4 py-2 text-right font-semibold">Quantity</th>
              <th className="px-4 py-2 text-left font-semibold">Unit</th>
              <th className="px-4 py-2 text-right font-semibold">Unit price</th>
              <th className="px-4 py-2 text-right font-semibold">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {items.map((item, idx) => {
              const d = draft[idx]
              return (
                <tr key={item.id}>
                  <td className="px-4 py-3 align-top">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.product_code}
                    </p>
                    <p className="font-semibold text-foreground">{item.product_name}</p>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="any"
                      value={d?.quantity ?? 0}
                      onChange={(e) =>
                        update(idx, { quantity: Number(e.target.value) })
                      }
                      disabled={disabled || pending || !canEdit}
                      className="ml-auto h-10 w-24 text-right"
                      aria-label={`Quantity for ${item.product_name}`}
                    />
                  </td>
                  <td className="px-4 py-3 align-top text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        £
                      </span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={d?.unitPrice ?? 0}
                        onChange={(e) =>
                          update(idx, { unitPrice: Number(e.target.value) })
                        }
                        disabled={disabled || pending || !canEdit}
                        className="h-10 w-32 pl-6 text-right"
                        aria-label={`Unit price for ${item.product_name}`}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right align-top font-semibold text-foreground">
                    {formatPrice(totalsByIndex[idx] ?? 0)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/50">
              <td className="px-4 py-3 text-sm font-semibold text-foreground" colSpan={4}>
                Subtotal (before VAT)
              </td>
              <td className="px-4 py-3 text-right text-base font-bold text-foreground">
                {formatPrice(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {items.map((item, idx) => {
          const d = draft[idx]
          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.product_code}
              </p>
              <p className="font-semibold text-foreground">{item.product_name}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Quantity ({item.unit})
                  </label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="any"
                    value={d?.quantity ?? 0}
                    onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                    disabled={disabled || pending || !canEdit}
                    className="mt-1 h-10"
                    aria-label={`Quantity for ${item.product_name}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Unit price
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      £
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={d?.unitPrice ?? 0}
                      onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })}
                      disabled={disabled || pending || !canEdit}
                      className="h-10 pl-6"
                      aria-label={`Unit price for ${item.product_name}`}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Line total</span>
                <span className="font-semibold text-foreground">
                  {formatPrice(totalsByIndex[idx] ?? 0)}
                </span>
              </div>
            </div>
          )
        })}
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-base font-bold text-foreground">
            <span>Subtotal (before VAT)</span>
            <span>{formatPrice(grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Changes save into <code className="rounded bg-secondary px-1.5 py-0.5">suggested_price</code>{' '}
          on the line items. The next &ldquo;Convert&rdquo; uses these numbers.
        </p>
        <Button
          type="submit"
          disabled={disabled || pending || !dirty || !canEdit}
          className="gap-2"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {dirty ? 'Save changes' : 'No changes'}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
