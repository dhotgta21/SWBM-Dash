// components/shop/CartView.tsx
// Client view of the cart. Hydrates from localStorage on mount and
// renders line items split into two clear sections:
//
//   1. **Priced items** — every line here has a published price. The
//      section footer shows the priced subtotal so the customer can
//      eyeball the order total before committing.
//   2. **Awaiting quote** — lines without a published price. The
//      section explains we'll phone to agree pricing before sending a
//      written quote.
//
// Both sections are native <details> accordions so they can be
// collapsed once the cart grows long.
//
// Summary card on the right has two CTAs:
//   * "Place order" — visible only when every line is priced.
//   * "Request a quote" — always available. Sole CTA when any line
//     is unpriced.
// Both route to /cart/checkout?kind=order|quote so the checkout form
// picks the right server-action branch.

'use client'

import Link from 'next/link'
import Image from 'next/image'
import {
  ShoppingBag,
  ArrowRight,
  AlertTriangle,
  ShoppingCart,
  FileSignature,
  Banknote,
  PhoneCall,
} from 'lucide-react'
import { useCart } from '@/lib/cart/cart-context'
import { Button } from '@/components/ui/button'
import { CartLineItem, CartSection } from './CartLineItem'
import { cn } from '@/lib/utils'

// Matches lib/actions/quote-requests.ts — kept here so client copy and
// server validator stay in lockstep.
const QUOTE_CTA_LABEL = 'Request a quote'
const ORDER_CTA_LABEL = 'Place order'

function formatGBP(value: number): string {
  return `£${value.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CartView() {
  const cart = useCart()

  if (!cart.hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
        Loading your cart...
      </div>
    )
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground">
          Your cart is empty.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Browse our product list and add the lines you need a quote for.
        </p>
        <div className="mt-8">
          <Link href="/quote">
            <Button size="lg" className="gap-2">
              Start your quote
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  // Derive both sections in one pass. Items without a price flow into
  // the awaiting-quote section; everything else goes to the priced
  // breakdown. Recomputed inline so a quantity edit in the same render
  // pass can't read a stale `cart` snapshot.
  const pricedItems = cart.items.filter((i) => i.price !== null)
  const unpricedItems = cart.items.filter((i) => i.price === null)
  const canOrder = unpricedItems.length === 0

  // Priced subtotal — kept in sync with cart.subtotal but recomputed here
  // so a row we just edited in the same render pass is reflected.
  const pricedSubtotal = pricedItems.reduce(
    (sum, i) => sum + (i.price ?? 0) * i.quantity,
    0
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Quote &amp; order cart
          </span>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
            Review your items
          </h1>
        </div>
        <button
          type="button"
          onClick={cart.clear}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Empty cart
        </button>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* ── Priced items section ───────────────────────────────────── */}
          {pricedItems.length > 0 && (
            <CartSection
              title="Priced items"
              amount={formatGBP(pricedSubtotal)}
              count={pricedItems.length}
              icon={Banknote}
              tone="success"
              caption="Every line has a published price. You can place the order now or request a written quote instead."
              footer={
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {pricedItems.length === 1
                      ? '1 priced line'
                      : `${pricedItems.length} priced lines`}{' '}
                    · VAT &amp; delivery confirmed on the quote
                  </span>
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    Subtotal {formatGBP(pricedSubtotal)}
                  </span>
                </div>
              }
            >
              {pricedItems.map((item) => {
                const lineTotal = (item.price ?? 0) * item.quantity
                const onSale =
                  (item.originalPrice ?? 0) > 0 &&
                  (item.originalPrice ?? 0) > (item.price ?? 0)
                return (
                  <CartLineItem
                    key={item.cartKey}
                    item={item}
                    onSale={onSale}
                    lineTotal={lineTotal}
                    onSetQuantity={cart.setQuantity}
                    onRemove={cart.remove}
                  />
                )
              })}
            </CartSection>
          )}

          {/* ── Awaiting quote section ────────────────────────────────── */}
          {unpricedItems.length > 0 && (
            <CartSection
              title="Awaiting quote"
              count={unpricedItems.length}
              icon={PhoneCall}
              tone="warning"
              caption="No published price yet — we'll phone to agree the price, then email your written quote. These lines are saved together with the priced items above."
            >
              {unpricedItems.map((item) => (
                <CartLineItem
                  key={item.cartKey}
                  item={item}
                  onSale={false}
                  lineTotal={null}
                  onSetQuantity={cart.setQuantity}
                  onRemove={cart.remove}
                />
              ))}
            </CartSection>
          )}
        </div>

        <aside aria-label="Summary" className="md:sticky md:top-20 md:self-start">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {canOrder ? 'Order summary' : 'Quote summary'}
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total items</dt>
                <dd className="font-semibold text-foreground tabular-nums">{cart.count}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Lines</dt>
                <dd className="font-semibold text-foreground tabular-nums">{cart.items.length}</dd>
              </div>
              {pricedItems.length > 0 && (
                <div className="flex items-center justify-between text-success">
                  <dt>Priced</dt>
                  <dd className="font-semibold tabular-nums">{pricedItems.length}</dd>
                </div>
              )}
              {unpricedItems.length > 0 && (
                <div className="flex items-center justify-between text-warning">
                  <dt>Awaiting quote</dt>
                  <dd className="font-semibold tabular-nums">{unpricedItems.length}</dd>
                </div>
              )}
            </dl>

            {/* Subtotal block — shown whenever there are priced lines. The
                section above already shows the running total; the card
                just repeats it so it sticks while scrolling. */}
            {pricedItems.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    {unpricedItems.length > 0 ? 'Priced subtotal' : 'Estimated total'}
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
                    {formatGBP(pricedSubtotal)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Excludes VAT and delivery &mdash; confirmed on the written
                  quote / invoice.
                </p>
              </div>
            )}

            {unpricedItems.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">To quote:</strong>{' '}
                  we&rsquo;ll confirm trade pricing and delivery charges for the{' '}
                  {unpricedItems.length === 1
                    ? '1 line'
                    : `${unpricedItems.length} lines`}{' '}
                  above when we email your written quote.
                </p>
              </div>
            )}

            <div className="mt-6 space-y-2.5">
              {/* Place order — primary, red, only when every line is priced. */}
              {canOrder && (
                <Link href="/cart/checkout?kind=order" className="block">
                  <Button size="lg" className="w-full gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    {ORDER_CTA_LABEL}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}

              {/* Request a quote — always available. */}
              <Link href="/cart/checkout?kind=quote" className="block">
                <Button
                  size="lg"
                  variant={canOrder ? 'outline' : 'primary'}
                  className="w-full gap-2"
                >
                  <FileSignature className="h-4 w-4" />
                  {QUOTE_CTA_LABEL}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="mt-4">
              <Link
                href="/quote"
                className="block text-center text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Continue shopping
              </Link>
            </div>
          </div>

          {/* Mixed-cart explanation note. Only renders when at least one
              line lacks a price so we don't pile redundant copy onto
              fully-priced carts. */}
          {unpricedItems.length > 0 && pricedItems.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">Some lines need pricing</p>
              <p className="mt-1 leading-relaxed">
                {unpricedItems.length === 1
                  ? '1 line doesn\u2019t have a listed price yet,'
                  : `${unpricedItems.length} lines don\u2019t have a listed price yet,`}{' '}
                so we&rsquo;ll phone you, agree the price, then email your
                written quote. The priced lines are still in the same
                document.
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            <div className="flex items-start gap-3">
              <Image
                src="/Logo.webp"
                alt=""
                width={22}
                height={25}
                className="mt-0.5 h-5 w-auto shrink-0"
              />
              <p className="leading-relaxed">
                Need a price before you commit? Submit the cart and we
                will reply the same business day with a written quote
                and a delivery slot for your area.
              </p>
            </div>
          </div>

          {!cart.persisted && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="leading-relaxed">
                We can&apos;t save your cart on this device. Your items will
                disappear if you refresh or close the tab — please submit
                the quote before navigating away.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
