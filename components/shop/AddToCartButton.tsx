// components/shop/AddToCartButton.tsx
// "Add to quote" client button. Disabled until the cart context has
// hydrated from localStorage to avoid the brief moment where the
// button looks ready but the click is lost.

'use client'

import { useState } from 'react'
import { Plus, Check } from 'lucide-react'
import { useCart } from '@/lib/cart/cart-context'
import { Button } from '@/components/ui/button'

interface AddToCartButtonProps {
  productId: string
  code: string
  name: string
  unit: string
  price?: number | null
  /**
   * Optional pre-sale trade price. When the line was added mid-sale we
   * persist both so the cart can render a strikethrough next to the
   * discounted `price`. Null/undefined for normal lines.
   */
  originalPrice?: number | null
  /** Optional sale label (e.g. "Winter Sale"). Null when no sale. */
  saleLabel?: string | null
  quantity?: number
  variantDescription?: string
}

export function AddToCartButton({
  productId,
  code,
  name,
  unit,
  price = null,
  originalPrice = null,
  saleLabel = null,
  quantity = 1,
  variantDescription,
}: AddToCartButtonProps) {
  const cart = useCart()
  const [justAdded, setJustAdded] = useState(false)

  function handleClick() {
    if (quantity <= 0) return
    cart.add({
      productId,
      code,
      name,
      unit,
      price,
      originalPrice: originalPrice ?? null,
      saleLabel: saleLabel ?? null,
      quantity,
      variantDescription,
    })
    setJustAdded(true)
    // Reset the "Added" pill after a moment so the button reverts to
    // its default state — it stays clickable for adding more.
    setTimeout(() => setJustAdded(false), 1400)
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      disabled={!cart.hydrated || quantity <= 0}
      className="gap-1.5"
      aria-label={`Add ${name} to quote`}
    >
      {justAdded ? (
        <>
          <Check className="h-4 w-4" />
          Added
        </>
      ) : (
        <>
          <Plus className="h-4 w-4" />
          Add {quantity > 1 ? quantity : ''} to quote
        </>
      )}
    </Button>
  )
}
