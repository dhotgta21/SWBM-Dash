'use client'

// components/invoices/DiscountInput.tsx
//
// A single input that accepts either a £ amount or a %. The character the
// operator types decides which:
//   "£5"        → amount  (£5 off per unit when on a line, or £5 off the
//                       subtotal when on the order-level row)
//   "10%"       → percent (10% off the line net or the subtotal)
//
// On every keystroke we sanitise the raw value to the parser's charset
// (`[0-9 . £ %]` plus spaces), then ask the parser what kind of input it
// is. Invalid input gets an inline error message instead of being
// silently dropped — the operator shouldn't have to wonder why a single
// character broke the math.
//
// When valid, we show a small "−£0.50 × 10 = −£5.00" preview so the
// operator can sanity-check the impact without scrolling to the totals.

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  buildLinePreview,
  parseDiscountInput,
  parseOrderDiscountInput,
  sanitizeDiscountString,
  type ParsedDiscount,
} from '@/lib/format/discount'
import { cn } from '@/lib/utils'

interface DiscountInputProps {
  /** Raw text in the input. The component never mutates this directly —
   *  the parent owns it via React state. We sanitise before render so
   *  pasted/auto-filled values that contain rejected chars don't reach
   *  the user. */
  value: string
  onChange: (raw: string) => void
  /** When set, hides the inline preview below the input. The preview is
   *  helpful on per-line rows where the math depends on qty × price. */
  showPreview?: boolean
  /** Quantity of the parent line. Required when `showPreview` is true
   *  and `mode === 'line'`. */
  quantity?: number
  /** Line net pre-discount, in pence. Required when `showPreview` is true
   *  and `mode === 'line'`. */
  lineNetPence?: number
  /** `line` shows the per-unit preview "£0.50 × 10 = £5.00".
   *  `order` shows just the dollar amount. */
  mode?: 'line' | 'order'
  placeholder?: string
  disabled?: boolean
  /** Optional className passthrough for the outer wrapper. */
  className?: string
  /** Optional smaller visual treatment for tight rows. */
  size?: 'sm' | 'md'
}

const COMPACT_INPUT_CLASS =
  'text-sm h-9 w-full text-right tabular-nums pr-2' as const

export function DiscountInput({
  value,
  onChange,
  showPreview = true,
  quantity,
  lineNetPence,
  mode = 'line',
  placeholder = '£ or %',
  disabled,
  className,
  size = 'md',
}: DiscountInputProps) {
  // Cap £ discounts to product cost:
  //   line  → per-unit price (discount is per unit)
  //   order → full subtotal (flat £ off the order)
  const maxAmountPence = useMemo(() => {
    if (lineNetPence == null || !Number.isFinite(lineNetPence) || lineNetPence < 0) {
      return null
    }
    if (mode === 'order') return Math.round(lineNetPence)
    const qty = quantity ?? 1
    if (!Number.isFinite(qty) || qty <= 0) return null
    return Math.round(lineNetPence / qty)
  }, [lineNetPence, mode, quantity])

  const parsed = useMemo(() => {
    const opts = maxAmountPence != null ? { maxAmountPence } : undefined
    return mode === 'order'
      ? parseOrderDiscountInput(value, opts)
      : parseDiscountInput(value, opts)
  }, [value, mode, maxAmountPence])

  function handleChange(next: string) {
    const sanitised = sanitizeDiscountString(next)
    onChange(sanitised)
  }

  function handleBlur() {
    // On blur, snap the displayed text to the canonical form so the user
    // sees what the parser understood. Empty inputs become empty; valid
    // amounts become "£0.50", percents become "10%".
    if (parsed.kind === 'amount') {
      const pounds = parsed.valuePence / 100
      const txt = `£${pounds.toFixed(2)}`
      if (txt !== value) onChange(txt)
    } else if (parsed.kind === 'percent') {
      const v = parsed.value
      const txt = `${Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '')}%`
      if (txt !== value) onChange(txt)
    } else if (parsed.kind === 'empty') {
      if (value !== '') onChange('')
    }
    // 'invalid' is left as-is so the error message stays next to the bad text
  }

  const preview =
    showPreview && parsed.kind !== 'empty' && parsed.kind !== 'invalid'
      ? buildLinePreview(parsed, quantity ?? 1, lineNetPence ?? 0)
      : null

  const inputClass = size === 'sm'
    ? COMPACT_INPUT_CLASS
    : 'text-sm h-10 w-32 text-right tabular-nums pr-3'

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative">
        <Input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={parsed.kind === 'invalid'}
          className={cn(
            inputClass,
            // Make sure a leading "£" doesn't add visual weight to the right edge
            '[appearance:textfield]',
            parsed.kind === 'invalid' &&
              'border-red-500 focus-visible:ring-red-500',
          )}
          title={
            mode === 'line'
              ? 'Per-line discount. £0.50 off per unit, or 10% off the line net.'
              : 'Order-level discount. £X off the subtotal, or X% off the subtotal.'
          }
        />
      </div>

      {parsed.kind === 'invalid' && (
        <p className="text-xs text-red-600 leading-snug" role="alert">
          {parsed.error}
        </p>
      )}

      {preview && (
        <p className="text-xs text-gray-500 tabular-nums leading-snug">{preview}</p>
      )}
    </div>
  )
}

/**
 * Re-export of the parsed-discount type for callers that need to know
 * "what kind of discount did the user enter?" without re-parsing.
 */
export type { ParsedDiscount }
