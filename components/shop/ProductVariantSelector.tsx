'use client'

import { useState, useMemo } from 'react'
import type { PublicProduct, VariantOption, VariantChoice } from '@/lib/public-products'
import { ProductPurchaseCard } from './ProductPurchaseCard'
import { cn } from '@/lib/utils'

interface ProductVariantSelectorProps {
  product: PublicProduct
  /**
   * Optional initial selector values. The map key is the option's
   * canonical "size" identifier (the variant_options JSONB now uses a
   * single flat options list per variant — no per-selector name) and
   * the value is the option's URL slug (e.g. "ub-127x76x13"). Used
   * by the public product page to pre-select an option when the
   * user arrives via a search result link like
   * `/products/STL-073?size=ub-127x76x13`. Unknown values are
   * silently ignored.
   */
  initialSelections?: Record<string, string>
}

/**
 * Flatten every variant's `options` into a single ordered list. The
 * new shape (post 2026-07-18 refactor) keeps the variant wrapping
 * for future multi-variant expansion (treated vs untreated timber),
 * but the public product page treats all options as one dropdown —
 * multi-variant products land on the first variant for now. When a
 * product genuinely needs the picker split across two variants we
 * can revisit.
 */
function collectOptions(variants: VariantOption[]): VariantChoice[] {
  const out: VariantChoice[] = []
  for (const variant of variants) {
    for (const option of variant.options ?? []) {
      out.push(option)
    }
  }
  return out
}

export function ProductVariantSelector({ product, initialSelections }: ProductVariantSelectorProps) {
  const variants = useMemo(() => product.variantOptions || [], [product.variantOptions])
  const options = useMemo(() => collectOptions(variants), [variants])
  const materials = product.materials

  // Single-select dropdown against the flattened options list.
  // The legacy "selector name" concept is gone — the URL still uses
  // `?size=<slug>` for backward compat with the search result deep
  // links, but the React state is just a single string now.
  const initialSize = initialSelections?.['size'] ?? ''
  const [selectedValue, setSelectedValue] = useState<string>(initialSize)

  const selectedOption = useMemo(
    () => options.find((o) => o.value === selectedValue) || null,
    [options, selectedValue]
  )

  // "Selected: <material> · <option label>" — matches the line item
  // name the invoice picker pre-bakes so the public PDP and the
  // admin picker agree on how a chosen variant is shown.
  const variantDescription = useMemo(() => {
    const parts: string[] = []
    if (materials && materials.length > 0 && materials[0]) {
      parts.push(materials[0])
    }
    if (selectedOption?.text) {
      parts.push(selectedOption.text)
    }
    return parts.filter(Boolean).join(' · ')
  }, [materials, selectedOption])

  // Surface the per-option measurements (length_m, weight_kg, etc.)
  // as a small "Spec" row so customers see the steel length or
  // timber width without us having to bake them into the product
  // description. Only render when at least one measurement is set.
  const selectedMeasurements = selectedOption?.measurements ?? []
  const hasMeasurements = selectedMeasurements.some(
    (m) => m.value != null && Number.isFinite(m.value)
  )

  // If there are no variant options, fall back to the standard purchase card.
  if (variants.length === 0 || options.length === 0) {
    return <ProductPurchaseCard product={product} />
  }

  return (
    <div className="mt-6 space-y-6 rounded-xl border border-border bg-card p-5">
      {/* Option picker — single dropdown for the flat option list.
       * The "size" label is kept because every variant the operator
       * builds today is a size/spec dropdown, but if a future product
       * needs a different label the operator encodes it in the option
       * text itself. */}
      <div>
        <label
          htmlFor="variant-option"
          className="mb-1 block text-sm font-medium text-foreground"
        >
          Size
        </label>
        <select
          id="variant-option"
          value={selectedValue}
          onChange={(e) => setSelectedValue(e.target.value)}
          className={cn(
            'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary'
          )}
        >
          <option value="">Select a size</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.text}
            </option>
          ))}
        </select>
      </div>

      {/* Per-option measurements (length, weight, etc.) — only shown
       * when the operator attached at least one measurement to the
       * selected option. Rendered as a compact key/value list so it
       * reads as a spec sheet, not a form. */}
      {hasMeasurements && (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Specifications
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {selectedMeasurements
              .filter((m) => m.value != null && Number.isFinite(m.value))
              .map((m, idx) => (
                <div key={idx} className="flex items-baseline justify-between gap-2">
                  <dt className="text-muted-foreground">{m.name}</dt>
                  <dd className="font-medium text-foreground">
                    {m.value} {m.unit}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      {/* Selected summary — mirrors the "Mild steel · UB 127x76x13kg"
       * convention the invoice picker uses so admin + public stay in
       * sync. */}
      {variantDescription && (
        <p className="text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{variantDescription}</span>
        </p>
      )}

      <ProductPurchaseCard product={product} variantDescription={variantDescription} />
    </div>
  )
}
