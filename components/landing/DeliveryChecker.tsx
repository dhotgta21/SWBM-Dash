// components/landing/DeliveryChecker.tsx
// Quick postcode-based delivery availability and charge estimate.
//
// Originally lived at app/tools/delivery-checker/DeliveryChecker.tsx —
// moved out of the Tools section because it isn't a calculator or
// converter; it's a serviceability check that belongs wherever the
// visitor is committing to an order (the /quote page) or scoping out
// delivery (the /delivery page, the home page).
//
// Public-facing client component. Pure UI over a static UK outward-code
// lookup, so it stays fast and works without any backend round-trip.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, XCircle, Clock, Truck } from 'lucide-react'

// Outward postcode areas by service level. These are approximate bands for
// the South-East delivery footprint.
const SAME_DAY_AREAS = new Set([
  'SL',
  'RG',
  'HP',
  'GU',
  'KT',
  'TW',
  'UB',
  'HA',
  'WD',
  'AL',
])

const NEXT_DAY_AREAS = new Set([
  // Greater London
  'N',
  'NW',
  'W',
  'SW',
  'SE',
  'E',
  'EC',
  'WC',
  'CR',
  'SM',
  'BR',
  'DA',
  'RM',
  'IG',
  'EN',
  'Barking',
  // Buckinghamshire
  'MK',
  // Surrey
  'RH',
  // Hampshire
  'SO',
  'PO',
  // Oxfordshire
  'OX',
])

function normalisePostcode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function extractOutward(postcode: string): string | null {
  // UK outward code is the leading letters before the numbers start.
  const match = postcode.match(/^([A-Z]{1,2})\d/)
  return match ? match[1] : null
}

type Result = {
  status: 'same-day' | 'next-day' | 'not-covered'
  outward: string | null
  charge: string
}

function checkPostcode(postcode: string): Result | null {
  if (!postcode) return null
  const outward = extractOutward(postcode)
  if (!outward) return null

  if (SAME_DAY_AREAS.has(outward)) {
    return { status: 'same-day', outward, charge: '£35' }
  }
  if (NEXT_DAY_AREAS.has(outward)) {
    return { status: 'next-day', outward, charge: '£25' }
  }
  return { status: 'not-covered', outward, charge: '—' }
}

interface DeliveryCheckerProps {
  /**
   * Visual variant. The default `'card'` renders the full checker inside
   * a rounded bordered container; `'inline'` strips the chrome so the
   * checker can sit inside a section header or another card.
   */
  variant?: 'card' | 'inline'
}

export function DeliveryChecker({ variant = 'card' }: DeliveryCheckerProps) {
  const [input, setInput] = useState<string>('')
  const postcode = normalisePostcode(input)
  const result = useMemo(() => checkPostcode(postcode), [postcode])

  const wrapperClass =
    variant === 'card'
      ? 'rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8'
      : ''

  return (
    <div className={wrapperClass}>
      <div className="mx-auto max-w-md">
        <div>
          <Label htmlFor="postcode">Enter your postcode</Label>
          <Input
            id="postcode"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="mt-2 uppercase"
            placeholder="e.g. SL1 1AA"
            maxLength={10}
          />
        </div>

        {result && (
          <div className="mt-6 rounded-xl bg-muted/50 p-6">
            {result.status === 'same-day' && (
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-success/10 p-3">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Same-day delivery available
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We cover the <strong>{result.outward}</strong> postcode area.
                    Order before 11:00 for same-day dispatch.
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Estimated charge: {result.charge}
                  </p>
                </div>
              </div>
            )}

            {result.status === 'next-day' && (
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Next-day delivery available
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We cover the <strong>{result.outward}</strong> postcode area.
                    Order before 15:00 for next-day delivery.
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Estimated charge: {result.charge}
                  </p>
                </div>
              </div>
            )}

            {result.status === 'not-covered' && (
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-muted p-3">
                  <XCircle className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    Outside our standard delivery zone
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We do not currently cover the <strong>{result.outward}</strong>{' '}
                    postcode area for regular deliveries. Call the trade counter
                    and we may still be able to help on larger orders.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex items-start gap-3 text-sm text-muted-foreground">
          <Truck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Delivery charges are estimates for standard-sized orders. Large or
            timed deliveries may be priced separately. Final charges are confirmed
            when you request a quote.
          </p>
        </div>
      </div>
    </div>
  )
}