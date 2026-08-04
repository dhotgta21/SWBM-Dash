'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { createQuickProductRecord } from '@/lib/actions/products'
import { type Product } from '@/components/products/ProductSearch'
import { Loader2, Plus, X, Zap } from 'lucide-react'

interface QuickProductAdderProps {
  /**
   * Called when the operator saves a temporary product straight from the
   * invoice/quote line item. The caller is responsible for inserting it
   * into the draft line (we don't auto-insert because not every caller
   * uses the same shape).
   */
  onCreated: (product: Product) => void
  disabled?: boolean
}

/**
 * Inline "+ New product" affordance for the invoice / quote line item area.
 * Inline capture from inside an invoice/quote ALWAYS creates a temporary
 * walk-in record. Operators who need a full permanent catalog entry use the
 * dedicated /admin/products/new page; the inline path stays minimal so the line
 * item is never blocked by "fill out the full form first". The row then gets
 * auto-promoted to permanent the moment the operator fills in code,
 * description, and a non-zero price from the dashboard "Temporary products"
 * section.
 */
export function QuickProductAdder({ onCreated, disabled }: QuickProductAdderProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('EA')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setUnit('EA')
    setError(null)
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function handleQuickSave() {
    if (saving || disabled) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Product name is required')
      return
    }
    setSaving(true)
    setError(null)
    const result = await createQuickProductRecord({
      name: trimmedName,
      unit: unit.trim() || undefined,
    })
    setSaving(false)
    if (result.error || !result.product) {
      setError(result.error || 'Could not save the product.')
      return
    }
    const product: Product = {
      id: result.product.id,
      code: result.product.code,
      name: result.product.name,
      unit: result.product.unit,
      default_price: result.product.default_price ? Number(result.product.default_price) : 0,
      category: result.product.category,
    }
    onCreated(product)
    close()
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="h-9"
      >
        <Plus className="w-4 h-4 mr-1" />
        New product
      </Button>
    )
  }

  return (
    <div className={cn('rounded-lg border p-3 space-y-3 border-amber-200 bg-amber-50/60')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Zap className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground leading-tight">New · temporary product</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Saved to "Temporary products" until code, price and description are filled in. Promote it
              to a permanent catalog entry from the Products section.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={close}
          disabled={saving}
          aria-label="Close"
          className="h-7 w-7 p-0 shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {error ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
          {error}
        </div>
      ) : null}

      {/* Rendered as a div, not a nested <form>, because this component is
          used inside the invoice/quote <form>. Nested forms are invalid HTML
          and can cause the parent form to submit when the user clicks Save. */}
      <div className="space-y-3" onKeyDown={(e) => e.stopPropagation()}>
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div className="space-y-1.5">
            <Label htmlFor="quick-product-name">Product name *</Label>
            <Input
              id="quick-product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleQuickSave()
                }
              }}
              placeholder="e.g. 4x2 CLS Stud 2.4m"
              autoFocus
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-product-unit">Unit</Label>
            <Input
              id="quick-product-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleQuickSave()
                }
              }}
              placeholder="EA"
              disabled={saving}
              className="uppercase"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleQuickSave}
            disabled={saving || disabled}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Save & use here
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Code (auto TEMP-XXXXXX) can be replaced from the dashboard when you're ready.
          </span>
        </div>
      </div>
    </div>
  )
}
