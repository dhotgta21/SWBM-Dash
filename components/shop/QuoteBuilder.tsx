// components/shop/QuoteBuilder.tsx
// Search-first quote panel. Visitors type a product name or code, see live
// matches, set a quantity, and add it to their quote cart. The persistent
// "Your quote" rail is rendered separately by QuoteShell so it stays
// visible when the customer switches to the catalogue tab.

'use client'

import { useState, useRef, useCallback } from 'react'
import { Plus, Trash2, Search, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCart } from '@/lib/cart/cart-context'
import { QuoteProductSearch, type QuoteProductSearchRef } from './QuoteProductSearch'
import type { PublicProduct } from '@/lib/public-products'

export function QuoteBuilder() {
  const cart = useCart()
  const searchRef = useRef<QuoteProductSearchRef>(null)
  const [selectedProducts, setSelectedProducts] = useState<PublicProduct[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const handleSelect = useCallback((product: PublicProduct) => {
    setSelectedProducts((prev) => {
      if (prev.some((p) => p.id === product.id)) return prev
      return [product, ...prev]
    })
    setQuantities((prev) => ({
      ...prev,
      [product.id]: prev[product.id] ?? 1,
    }))
  }, [])

  function updateQuantity(productId: string, value: string) {
    const parsed = Number(value)
    if (Number.isNaN(parsed) || parsed < 0) return
    setQuantities((prev) => ({ ...prev, [productId]: parsed }))
  }

  function addToQuote(product: PublicProduct) {
    const quantity = quantities[product.id] ?? 1
    if (quantity <= 0) return
    cart.add({
      productId: product.id,
      code: product.code,
      name: product.name,
      unit: product.unit,
      price: product.priceFrom ?? null,
      quantity,
    })
    setSelectedProducts((prev) => prev.filter((p) => p.id !== product.id))
    setQuantities((prev) => {
      const next = { ...prev }
      delete next[product.id]
      return next
    })
    searchRef.current?.focus()
  }

  function removeSelected(productId: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId))
    setQuantities((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }

  return (
    <div>
      <div className="mb-4">
        <QuoteProductSearch ref={searchRef} onSelect={handleSelect} />
        <p className="mt-2 text-xs text-muted-foreground">
          Type a product name or code, select a result, set the quantity and add it to your quote.
        </p>
      </div>

      <SearchResults
        products={selectedProducts}
        quantities={quantities}
        onQuantityChange={updateQuantity}
        onAdd={addToQuote}
        onRemove={removeSelected}
      />
    </div>
  )
}

function SearchResults({
  products,
  quantities,
  onQuantityChange,
  onAdd,
  onRemove,
}: {
  products: PublicProduct[]
  quantities: Record<string, number>
  onQuantityChange: (productId: string, value: string) => void
  onAdd: (product: PublicProduct) => void
  onRemove: (productId: string) => void
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Search className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Search for products
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Type a product name or code above to see matching lines.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Product</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Code</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Category</th>
            <th className="px-4 py-3 font-semibold">Unit</th>
            <th className="px-4 py-3 font-semibold">Qty</th>
            <th className="px-4 py-3 font-semibold"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <tr key={product.id} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{product.name}</p>
                  </div>
                </div>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                {product.code}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                {product.category ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{product.unit}</td>
              <td className="px-4 py-3">
                <Input
                  type="number"
                  min={1}
                  value={quantities[product.id] ?? 1}
                  onChange={(e) => onQuantityChange(product.id, e.target.value)}
                  className="h-9 w-20 px-2 text-center text-sm"
                />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAdd(product)}
                    className="h-9 gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                  <button
                    type="button"
                    onClick={() => onRemove(product.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                    aria-label="Remove from results"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
