// components/shop/QuoteSidebar.tsx
// The persistent cart rail shown on /quote. Lives outside the tab strip
// so the customer always sees what they have ready to send, regardless of
// whether they are searching by name/code or browsing the catalogue.
//
// Renders two stacked cards: the live quote list (with qty steppers +
// remove) and a small "bespoke list?" helper card. Empty state is a calm
// dashed prompt so first-time visitors know where to start.

'use client'

import Link from 'next/link'
import { Plus, Minus, Trash2, ShoppingCart, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/cart/cart-context'

interface QuoteSidebarProps {
  /**
   * When provided (e.g. the customer has drilled into a category inside
   * the catalogue panel), render a prominent "Back" affordance at the
   * top of the right rail so they can return to the catalogue grid
   * without losing their quote cart.
   */
  backAction?: { label: string; onClick: () => void } | null
}

export function QuoteSidebar({ backAction = null }: QuoteSidebarProps) {
  const cart = useCart()

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      {backAction && (
        <button
          type="button"
          onClick={backAction.onClick}
          className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" />
          {backAction.label}
        </button>
      )}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </span>
            Your quote
            <span className="ml-auto text-xs font-semibold text-muted-foreground">
              {cart.count} {cart.count === 1 ? 'line' : 'lines'}
            </span>
          </div>
        </div>

        <div className="p-5">
          {cart.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm leading-relaxed text-muted-foreground">
              Search or browse the catalogue &mdash; add the lines you need a quote for.
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {cart.items.map((item) => (
                  <li
                    key={item.cartKey}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.code}
                        {item.variantDescription ? ` · ${item.variantDescription}` : ''} &middot;{' '}
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          cart.setQuantity(item.cartKey, item.quantity - 1)
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          cart.setQuantity(item.cartKey, item.quantity + 1)
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => cart.remove(item.cartKey)}
                        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Lines</span>
                  <span className="font-semibold text-foreground">{cart.count}</span>
                </div>
                <Button asChild className="mt-4 w-full gap-2">
                  <Link href="/cart/checkout">
                    Review &amp; send quote
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => cart.clear()}
                >
                  Clear quote
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        <p className="font-semibold text-foreground">Need a bespoke list?</p>
        <p className="mt-1.5 leading-relaxed">
          Send a take-off by email and we&rsquo;ll come back with a written quote.
        </p>
      </div>
    </aside>
  )
}
