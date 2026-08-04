'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { PublicProduct } from '@/lib/public-products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddToCartButton } from './AddToCartButton'
import { ProductCalculator } from './ProductCalculator'
import { ProductPriceCard } from './ProductPriceCard'
import { getEffectivePrice } from '@/lib/public-products/price'

interface ProductPurchaseCardProps {
  product: PublicProduct
  variantDescription?: string
}

export function ProductPurchaseCard({ product, variantDescription }: ProductPurchaseCardProps) {
  const [quantity, setQuantity] = useState(1)

  function adjustQuantity(delta: number) {
    setQuantity((prev) => Math.max(1, prev + delta))
  }

  function handleQuantityInput(value: string) {
    const parsed = parseInt(value, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      setQuantity(1)
      return
    }
    setQuantity(parsed)
  }

  // Compute once and reuse. Only attach the sale label to the cart line
  // when a sale is *currently active* — otherwise a "starts on the 15th"
  // sale would leak into the cart as a misleading success-coloured chip
  // with no matching strikethrough.
  const priceDisplay = getEffectivePrice(product)
  const effectivePrice = priceDisplay.kind === 'quote' ? null : priceDisplay.effectivePrice
  const originalPrice =
    priceDisplay.kind === 'sale' ? priceDisplay.originalPrice : null
  const saleLabel = priceDisplay.kind === 'sale' ? priceDisplay.label : null

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-sm text-muted-foreground">Unit</p>
        <p className="font-semibold text-foreground">{product.unit}</p>
      </div>

      <div className="mt-4">
        <ProductPriceCard product={product} unit={product.unit} />
      </div>

      <div className="mt-5">
        <label htmlFor="quantity" className="text-sm font-medium text-foreground">
          Quantity
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => adjustQuantity(-1)}
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Input
            id="quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => handleQuantityInput(e.target.value)}
            className="h-10 text-center"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => adjustQuantity(1)}
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Type the quantity you need, or use the calculator below.
        </p>
      </div>

      <ProductCalculator product={product} onQuantityChange={(q) => setQuantity(Math.max(1, q))} />

      <div className="mt-5">
        <AddToCartButton
          productId={product.id}
          code={product.code}
          name={product.name}
          unit={product.unit}
          price={effectivePrice}
          originalPrice={originalPrice}
          saleLabel={saleLabel}
          quantity={quantity}
          variantDescription={variantDescription}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Add to your quote list and send it through for trade pricing and delivery slots.
      </p>
    </div>
  )
}
