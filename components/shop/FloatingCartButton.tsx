// components/shop/FloatingCartButton.tsx
// Sticky bottom-right widget that shows the current cart item count
// and links to /cart. Stays visible across /quote and /cart/* so the
// visitor always knows what's in their cart.

'use client'

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/cart/cart-context'

export function FloatingCartButton() {
  const cart = useCart()

  if (!cart.hydrated || cart.count === 0) {
    // Before hydration we can't know the count; show nothing rather
    // than a flickering "0" badge. Once hydrated we hide the button
    // entirely when the cart is empty so it doesn't get in the way
    // of browsing.
    return null
  }

  return (
    <Link
      href="/cart"
      className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2.5 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all hover:scale-105 hover:bg-primary-hover mb-safe mr-safe"
      aria-label={`Open cart with ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`}
    >
      <ShoppingCart className="h-5 w-5" />
      <span>
        {cart.count} {cart.count === 1 ? 'item' : 'items'}
      </span>
    </Link>
  )
}
