// components/shop/CheckoutForm.tsx
// Two-column checkout. Left = contact + delivery form. Right = cart
// summary + submit. Cart contents are read from the cart context on
// mount and serialised into a hidden field so the server action sees
// the same payload the user saw — we never trust the client's local
// state for anything that affects pricing or quantities (the server
// re-resolves product codes + names from the catalogue at insert
// time, so a tampered cart can't ship "10 tonnes of gold" through
// the quote pipeline).

'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Loader2, ShoppingBag, ShieldCheck, MapPin, User, ShoppingCart } from 'lucide-react'
import { useCart } from '@/lib/cart/cart-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { submitQuoteRequest } from '@/lib/actions/quote-requests'

interface CheckoutFormProps {
  /** @deprecated Demo never uses captcha. */
  turnstileSiteKey?: string | null
}

interface SerialisedCart {
  items: Array<{
    productId: string
    code: string
    name: string
    unit: string
    price: number | null
    quantity: number
  }>
}

function formatGBP(value: number): string {
  return `£${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function CheckoutForm(_props: CheckoutFormProps = {}) {
  const cart = useCart()
  const router = useRouter()
  const searchParams = useSearchParams()
  // `kind` comes from the cart CTA query string (?kind=quote|order). The
  // server validator defaults any other value to 'quote', so an old
  // bookmark or a hand-edited URL still works.
  const kindParam = (searchParams.get('kind') ?? '').toLowerCase()
  const initialKind: 'quote' | 'order' = kindParam === 'order' ? 'order' : 'quote'
  const [kind, setKind] = useState<'quote' | 'order'>(initialKind)

  const [error, setError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()
  const [submittingCart, setSubmittingCart] = useState<SerialisedCart | null>(null)

  // Snapshot the cart on mount so the server action payload is stable
  // even if the user clicks back to /cart mid-submit and changes
  // something. The page only submits the snapshot. Defer the state update
  // with requestAnimationFrame to avoid the lint rule against synchronous
  // setState inside an effect body.
  useEffect(() => {
    if (!cart.hydrated || submittingCart) return
    const id = requestAnimationFrame(() => setSubmittingCart({ items: cart.items }))
    return () => cancelAnimationFrame(id)
  }, [cart.hydrated, cart.items, submittingCart])

  const items = submittingCart?.items ?? cart.items
  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items])

  // Recompute priced/unpriced from the *snapshot* so the UI never lies
  // mid-edit. `canOrder` here is the source of truth for the toggle.
  const unpricedLines = items.filter((i) => i.price === null)
  const canOrder = items.length > 0 && unpricedLines.length === 0
  const subtotalPriced = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0)
  const pricedLineCount = items.filter((i) => i.price !== null).length

  // If the customer landed here via ?kind=order but their cart no longer
  // qualifies (e.g. they added an unpriced line on the cart page and
  // came back), fall back to quote automatically so they don't see a
  // disabled-looking form.
  useEffect(() => {
    if (!canOrder && kind === 'order') setKind('quote')
    // We intentionally only depend on canOrder; flipping kind on every
    // keystroke would be surprising.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOrder])

  if (!cart.hydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
        Loading...
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-foreground">
          Your cart is empty.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Add some lines to your cart before requesting a quote.
        </p>
        <div className="mt-8">
          <Link href="/quote">
            <Button size="lg">Start your quote</Button>
          </Link>
        </div>
      </div>
    )
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    if (!submittingCart || submittingCart.items.length === 0) {
      setError('Your cart is empty.')
      return
    }
    formData.set('cart', JSON.stringify(submittingCart))
    formData.set('kind', kind)
    startSubmit(async () => {
      const result = await submitQuoteRequest(formData)
      if (!result.ok) {
        setError(result.error)

        return
      }
      // Clear the cart and reset the snapshot so a return to the page
      // (or a back-navigation that doesn't unmount us) starts from
      // empty. Without this, a partially-failed navigation could
      // leave the snapshot pointing at items the user already submitted.
      cart.clear()
      setSubmittingCart(null)
      const ref = encodeURIComponent(result.requestNumber)
      router.replace(
        `/cart/confirmation?ref=${ref}&kind=${result.kind}`
      )
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to cart
        </Link>
      </div>

      <header className="mb-8 border-b border-border pb-5">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {kind === 'order' ? 'Submit your order' : 'Submit your request'}
        </span>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
          {kind === 'order' ? 'Place your order' : 'Request a quote'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {kind === 'order'
            ? 'We\u2019ll call to confirm stock, take payment over the phone, and book a delivery slot for your area \u2014 usually the same business day.'
            : 'We\u2019ll review your list, confirm stock and email you a written quote with a delivery slot for your area, usually the same business day.'}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <form action={handleSubmit} className="space-y-8">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Kind toggle. Persists across edits without a round-trip.
              When the cart can't be ordered (any unpriced line), the order
              option is disabled and quote is forced. */}
          {canOrder ? (
            <fieldset className="overflow-hidden rounded-xl border border-border bg-card p-1 shadow-sm">
              <legend className="sr-only">How do you want to send this?</legend>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setKind('quote')}
                  aria-pressed={kind === 'quote'}
                  className={
                    'rounded-lg px-4 py-3 text-sm font-semibold transition-colors ' +
                    (kind === 'quote'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  Request a quote
                </button>
                <button
                  type="button"
                  onClick={() => setKind('order')}
                  aria-pressed={kind === 'order'}
                  className={
                    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ' +
                    (kind === 'order'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  <ShoppingCart className="h-4 w-4" />
                  Place order
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold">This cart can only be sent as a quote</p>
              <p className="mt-1 leading-relaxed">
                {unpricedLines.length === 1
                  ? '1 line doesn\u2019t have a listed price yet, so we\u2019ll'
                  : `${unpricedLines.length} lines don\u2019t have a listed price yet, so we\u2019ll`}{' '}
                phone you, agree the price, then email your written quote.
              </p>
            </div>
          )}

          <input type="hidden" name="kind" value={kind} />

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-foreground">Your details</h2>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="client_name">Full name</Label>
                <Input id="client_name" name="client_name" type="text" required autoComplete="name" maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_email">Email</Label>
                <Input
                  id="client_email"
                  name="client_email"
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="client_phone"
                  name="client_phone"
                  type="tel"
                  autoComplete="tel"
                  maxLength={40}
                  placeholder="07123 456 789"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="client_company">Company <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="client_company"
                  name="client_company"
                  type="text"
                  autoComplete="organization"
                  maxLength={160}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MapPin className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-foreground">Delivery address</h2>
              <span className="ml-auto text-xs text-muted-foreground">All fields optional</span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="delivery_address_line_1">Address line 1</Label>
                <Input
                  id="delivery_address_line_1"
                  name="delivery_address_line_1"
                  type="text"
                  autoComplete="address-line1"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="delivery_address_line_2">Address line 2</Label>
                <Input
                  id="delivery_address_line_2"
                  name="delivery_address_line_2"
                  type="text"
                  autoComplete="address-line2"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_town">Town / city</Label>
                <Input
                  id="delivery_town"
                  name="delivery_town"
                  type="text"
                  autoComplete="address-level2"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_county">County</Label>
                <Input
                  id="delivery_county"
                  name="delivery_county"
                  type="text"
                  autoComplete="address-level1"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="delivery_postcode">Postcode</Label>
                <Input
                  id="delivery_postcode"
                  name="delivery_postcode"
                  type="text"
                  autoComplete="postal-code"
                  maxLength={16}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Send className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-foreground">
                {kind === 'order' ? 'Delivery / site notes (optional)' : 'Notes for the trade counter'}
              </h2>
            </div>
            <div className="mt-5 space-y-2">
              <Label htmlFor="notes">
                {kind === 'order'
                  ? 'Anything we should know about the delivery?'
                  : 'Anything we should know?'}{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                name="notes"
                rows={4}
                maxLength={1000}
                placeholder={
                  kind === 'order'
                    ? 'Site access, preferred delivery window, gate code...'
                    : 'Site access, preferred delivery window, special cuts, payment-on-account reference...'
                }
              />
            </div>
          </section>

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                Your details stay between us and the trade counter. We
                don&rsquo;t share or sell them.
              </p>
              <Button type="submit" size="lg" disabled={submitting} className="gap-2 sm:w-auto">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {kind === 'order' ? 'Placing order...' : 'Submitting...'}
                </>
              ) : (
                <>
                  {kind === 'order' ? 'Place order' : 'Send request'}
                  <Send className="h-4 w-4" />
                </>
              )}
            </Button>
            </div>
          </div>
        </form>

        <aside aria-label="Order summary" className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {kind === 'order' ? 'Your order' : 'Your request'}
            </h2>
            <ul className="mt-4 divide-y divide-border">
              {items.map((item) => {
                const lineTotal = item.price !== null ? item.price * item.quantity : null
                return (
                  <li key={item.productId} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.quantity} {item.unit} &middot; {item.code}
                      </p>
                      {item.price !== null && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatGBP(item.price)} per {item.unit.toLowerCase()}
                        </p>
                      )}
                    </div>
                    {lineTotal !== null && (
                      <span className="shrink-0 text-right text-sm font-semibold text-foreground">
                        {formatGBP(lineTotal)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            <dl className="mt-3 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Lines</dt>
                <dd className="font-semibold text-foreground">{items.length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total qty</dt>
                <dd className="font-semibold text-foreground">{count}</dd>
              </div>
              {pricedLineCount > 0 && (
                <>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <dt className="text-muted-foreground">
                      {items.length - pricedLineCount > 0 ? 'Priced subtotal' : 'Estimated total'}
                    </dt>
                    <dd className="text-base font-extrabold tracking-tight text-foreground">
                      {formatGBP(subtotalPriced)}
                    </dd>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Excludes VAT and delivery &mdash; confirmed on the
                    written {kind === 'order' ? 'invoice' : 'quote'}.
                  </p>
                </>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  )
}
