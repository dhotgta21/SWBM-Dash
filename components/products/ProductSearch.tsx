'use client'

import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Minimal variant option shape used by the invoice picker. Mirrors
 *  the canonical VariantOption interface in lib/public-products.ts so
 *  the JSON returned by the search RPC round-trips through. */
export interface ProductSearchVariantOption {
  options: {
    value: string
    text: string
  }[]
}

/** When the search query matches one of the product's variant options
 *  (e.g. admin types "UB 127x76x13kg", picks STL-073 Universal Beam),
 *  we pass the matched selector / value / text through to the parent so
 *  the line item can be pre-populated with the size baked in. */
export interface ProductSearchMatchedVariant {
  /** Variant selector name (e.g. "size"). */
  selector: string
  /** Variant option value (e.g. "ub-127x76x13"). */
  value: string
  /** Variant option display text (e.g. "UB 127x76x13kg"). */
  text: string
}

export interface Product {
  id: string
  code: string
  name: string
  unit: string
  default_price: number
  category: string | null
  /**
   * Variant options for the product, when the product is a size-only
   * "family" SKU (e.g. STL-073 Universal Beam with 21 size variants).
   * Used by the admin invoice picker to pre-fill the line item name
   * with the size the operator searched for, and to render an inline
   * dropdown so the size can be changed before the line is committed.
   */
  variantOptions?: ProductSearchVariantOption[] | null
}

export interface ProductSearchProps {
  /**
   * Called when the operator picks a result. The second argument carries
   * the variant option that matched the current search query, when the
   * picked product has variants and the query matches one of them (e.g.
   * admin types "UB 127x76x13kg", picks STL-073 Universal Beam → the
   * matched variant is { selector: "size", value: "ub-127x76x13", text:
   * "UB 127x76x13kg" }). Null/undefined when there is no match or the
   * product has no variants. The admin invoice picker uses this to
   * pre-fill the line item with the size baked into the description.
   */
  onSelect: (product: Product, matchedVariant?: ProductSearchMatchedVariant | null) => void
  onChange?: (value: string) => void
  onSubmit?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  value?: string
}

/**
 * Parse the `variant_options` JSONB column from a search_products RPC
 * row. The RPC returns it as either an already-parsed array (when
 * PostgREST auto-parses JSONB) or a JSON string (when the column
 * arrives as text). Anything malformed falls back to null so the
 * caller can treat "no variants" the same as "couldn't parse".
 */
function parseVariantOptions(value: unknown): ProductSearchVariantOption[] | null {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!Array.isArray(raw)) return null
  return raw
    .filter((v) => v != null && typeof v === 'object')
    .map((v) => {
      const variant = v as Record<string, unknown>
      // New shape: { options: [{ value, text }] }
      if (Array.isArray(variant.options)) {
        return {
          options: variant.options
            .filter(
              (o): o is { value: string; text: string } =>
                o != null &&
                typeof o === 'object' &&
                typeof (o as { value: string }).value === 'string' &&
                typeof (o as { text: string }).text === 'string'
            )
            .map((o) => ({ value: o.value, text: o.text })),
        }
      }
      // Legacy shape: { material, image, selectors: [{ name, label,
      // options: [{ value, text }] }] } — flatten inline so the admin
      // picker keeps working during the brief window between the code
      // change and migration 162.
      if (Array.isArray(variant.selectors)) {
        const flat: { value: string; text: string }[] = []
        for (const selector of variant.selectors) {
          if (!selector || typeof selector !== 'object') continue
          const options = (selector as { options?: unknown }).options
          if (!Array.isArray(options)) continue
          for (const o of options) {
            if (
              o != null &&
              typeof o === 'object' &&
              typeof (o as { value: string }).value === 'string' &&
              typeof (o as { text: string }).text === 'string'
            ) {
              flat.push({
                value: (o as { value: string }).value,
                text: (o as { text: string }).text,
              })
            }
          }
        }
        return { options: flat }
      }
      return null
    })
    .filter((v): v is ProductSearchVariantOption => v !== null)
}

/**
 * Normalise a string for contains-matching. Lowercases, drops spaces,
 * and converts ×/x/* to a single canonical "x" so "UB 127x76x13kg",
 * "ub 127×76×13kg" and "ub127x76x13kg" all match the variant text
 * "UB 127x76x13kg". Mirrors findVariantMatchForQuery in
 * lib/public-products.ts so the front-end and admin picker agree.
 */
function normaliseForVariantMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[×x*]/g, 'x')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Find the variant option whose display text contains the current
 * search query. Returns the first match (variants are searched in
 * declaration order, options in declaration order) so the most
 * specific match wins. Null when no match or no variants. The
 * returned `selector` field is always `"size"` for the new flat
 * shape — kept for backward compat with the invoice picker
 * consumer that still uses it as a stable identifier.
 */
function findMatchedVariant(product: Product, query: string): ProductSearchMatchedVariant | null {
  if (!query || !query.trim()) return null
  if (!product.variantOptions || product.variantOptions.length === 0) return null
  const needle = normaliseForVariantMatch(query)
  if (!needle) return null
  for (const variant of product.variantOptions) {
    for (const option of variant.options ?? []) {
      const hay = normaliseForVariantMatch(option.text ?? '')
      if (hay && hay.includes(needle)) {
        return { selector: 'size', value: option.value, text: option.text }
      }
    }
  }
  return null
}

/**
 * Compute the matched variant for every result in the dropdown so we
 * can show a "size: UB 127x76x13kg" hint next to the product name
 * when the operator's query is matching a specific variant. This is
 * the same logic that runs at pick-time, so the hint and the actual
 * line-item pre-fill can never disagree.
 */
function matchVariantsForResults(
  results: Product[],
  query: string
): Map<string, ProductSearchMatchedVariant> {
  const out = new Map<string, ProductSearchMatchedVariant>()
  if (!query || !query.trim()) return out
  for (const product of results) {
    const match = findMatchedVariant(product, query)
    if (match) out.set(product.id, match)
  }
  return out
}

export interface ProductSearchRef {
  focus: () => void
  select: () => void
}

export const ProductSearch = forwardRef<ProductSearchRef, ProductSearchProps>(
  function ProductSearch(
    { onSelect, onChange, onSubmit, onKeyDown, placeholder = 'Search product...', disabled, autoFocus, className, value: controlledValue },
    ref
  ) {
    const [internalQuery, setInternalQuery] = useState('')
    const query = controlledValue !== undefined ? controlledValue : internalQuery
    const [results, setResults] = useState<Product[]>([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    // `selectProduct` flips the parent's controlled value (typed text →
    // product name), which re-triggers the search effect below. Without
    // this flag the search would re-fire, find the freshly-selected
    // product in the catalogue, and immediately reopen the dropdown we
    // just closed. We set it on selection, the effect clears it on its
    // one suppressed run, and any subsequent user typing clears it via
    // `setQuery` so a real search still happens.
    const suppressNextSearchRef = useRef(false)
    // Position of the dropdown in viewport coordinates. Recomputed on scroll /
    // resize so the dropdown always sits flush under the input, even when the
    // surrounding table or its overflow-x-auto parent would normally clip it.
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
    const [mounted, setMounted] = useState(false)
    const supabase = createClient()

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      select: () => inputRef.current?.select(),
    }))

    // Portals require document.body. Defer until after mount to avoid SSR
    // hydration mismatches (createPortal on the server is a no-op anyway).
    useEffect(() => {
      setMounted(true)
    }, [])

    function updateDropdownPosition() {
      const input = inputRef.current
      if (!input) return
      const rect = input.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + window.scrollY + 4, // mt-1 equivalent
        left: rect.left + window.scrollX,
        width: rect.width,
      })
    }

    useEffect(() => {
      if (!open) return
      updateDropdownPosition()

      function handlePositionChange() {
        updateDropdownPosition()
      }

      function handleClickOutside(event: MouseEvent) {
        const target = event.target as Node
        if (
          containerRef.current?.contains(target) ||
          dropdownRef.current?.contains(target)
        ) {
          return
        }
        setOpen(false)
      }

      window.addEventListener('scroll', handlePositionChange, true)
      window.addEventListener('resize', handlePositionChange)
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        window.removeEventListener('scroll', handlePositionChange, true)
        window.removeEventListener('resize', handlePositionChange)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [open])

    useEffect(() => {
      // Selection just happened: don't re-search for the product name the
      // parent just set. The dropdown is already closed — leave it that
      // way. The cached results are kept (we don't clear them) so if the
      // operator re-focuses the input they still see the prior matches.
      if (suppressNextSearchRef.current) {
        suppressNextSearchRef.current = false
        setOpen(false)
        return
      }

      let cancelled = false
      let requestId = 0

      async function search() {
        const q = query.trim()
        if (!q) {
          if (!cancelled) {
            setResults([])
            setOpen(false)
          }
          return
        }

        const currentRequestId = ++requestId
        if (!cancelled) setLoading(true)

        const { data } = await supabase.rpc('search_products', {
          p_query: q,
          p_limit: 8,
          // Internal invoice/quote line-item picker must keep showing
          // walk-in (temporary) products so staff can re-pick the same
          // temp product across follow-up invoices. The public /quote
          // catalogue uses the default (true) and stays clean.
          p_exclude_temporary: false,
        })

        if (cancelled || currentRequestId !== requestId) return

        const mapped = ((data as Record<string, unknown>[]) || []).map((row) => ({
          id: String(row.id),
          code: String(row.code),
          name: String(row.name),
          unit: String(row.unit),
          default_price: row.default_price ? Number(row.default_price) : 0,
          category: row.category ? String(row.category) : null,
          variantOptions: parseVariantOptions(row.variant_options),
        }))

        setResults(mapped)
        setOpen(true)
        setHighlightedIndex(0)
        setLoading(false)
      }

      const timeout = setTimeout(search, 200)
      return () => {
        clearTimeout(timeout)
        cancelled = true
      }
    }, [query, supabase])

    const setQuery = useCallback(
      (value: string) => {
        // Any user-driven keystroke clears the post-selection suppress so
        // the next search effect runs normally.
        if (suppressNextSearchRef.current) {
          suppressNextSearchRef.current = false
        }
        if (controlledValue === undefined) {
          setInternalQuery(value)
        }
        onChange?.(value)
      },
      [controlledValue, onChange]
    )

    function selectProduct(product: Product) {
      if (disabled) return
      // Mark the next search run as "ignore me" so the controlled-value
      // update that follows (typed text → product name) doesn't reopen
      // the dropdown we just closed.
      suppressNextSearchRef.current = true
      setResults([])
      setOpen(false)
      setHighlightedIndex(0)
      // If the current query matches a variant option on the picked
      // product (e.g. admin types "UB 127x76x13kg" and clicks STL-073
      // Universal Beam) we pass the matched option through to the
      // parent so the line item can be pre-filled with the size baked
      // into the description. Otherwise (no variants, or no query
      // match) we pass null and the parent uses the bare product name.
      const matchedVariant = query ? findMatchedVariant(product, query) : null
      onSelect(product, matchedVariant)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!open) {
          if (query.trim()) {
            setOpen(true)
            setHighlightedIndex(0)
          }
          return
        }
        setHighlightedIndex((prev) => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!open) return
        setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (open && results.length > 0) {
          e.preventDefault()
          selectProduct(results[highlightedIndex])
        } else if (onSubmit) {
          e.preventDefault()
          onSubmit()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }

      onKeyDown?.(e)
    }

    const showDropdown = open && mounted && dropdownPos
    const showEmpty = open && query.trim() && !loading && results.length === 0 && mounted && dropdownPos

    // When the operator types a query that matches a variant option on
    // any of the returned results, surface that as a "Size: X" hint
    // in the dropdown row. The matching is recomputed from the latest
    // results + query, so it never disagrees with the value we pass
    // through onSelect. Empty map = no hints shown.
    const matchedVariants = matchVariantsForResults(results, query)

    return (
      <div ref={containerRef} className="relative">
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim()) {
              setOpen(true)
              updateDropdownPosition()
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn('w-full', className)}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">Loading...</div>
        )}
        {showDropdown && createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'absolute',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            className="z-[100] bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto"
          >
            {results.map((product, index) => {
              const matched = matchedVariants.get(product.id)
              return (
                <button
                  key={product.id}
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={() => selectProduct(product)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 border-b last:border-0 transition-colors',
                    index === highlightedIndex ? 'bg-red-50 text-red-900' : 'hover:bg-gray-50'
                  )}
                >
                  <div className="font-medium text-gray-900 text-sm">{product.name}</div>
                  <div className="text-xs text-gray-500">
                    Code: {product.code} · Unit: {product.unit}
                    {product.default_price > 0 && ` · £${product.default_price.toFixed(2)}`}
                    {matched && (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Size: {matched.text}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>,
          document.body
        )}
        {showEmpty && createPortal(
          <div
            style={{
              position: 'absolute',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
            className="z-[100] bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-sm text-gray-500"
          >
            No products found
          </div>,
          document.body
        )}
      </div>
    )
  }
)