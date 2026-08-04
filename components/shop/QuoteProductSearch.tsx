// components/shop/QuoteProductSearch.tsx
// Public product search input. Debounces keystrokes and calls a server
// action so anonymous visitors can search the catalogue without needing
// an account or exposing the service-role key in the browser.

'use client'

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { createPortal } from 'react-dom'
import { Search, Loader2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { searchPublicProducts } from '@/lib/actions/public-products'
import type { PublicProduct } from '@/lib/public-products'

export interface QuoteProductSearchRef {
  focus: () => void
  select: () => void
}

interface QuoteProductSearchProps {
  onSelect: (product: PublicProduct) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
}

export const QuoteProductSearch = forwardRef<
  QuoteProductSearchRef,
  QuoteProductSearchProps
>(function QuoteProductSearch(
  { onSelect, placeholder = 'Search by name or code...', disabled, autoFocus, className },
  ref
) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    select: () => inputRef.current?.select(),
  }))

  useEffect(() => {
    setMounted(true)
  }, [])

  function updateDropdownPosition() {
    const input = inputRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    setDropdownPos({
      top: rect.bottom + window.scrollY + 4,
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
    async function search() {
      const q = query.trim()
      if (!q) {
        setResults([])
        setOpen(false)
        return
      }

      setLoading(true)
      setError(null)
      const { products: found, error: searchError } = await searchPublicProducts(q)
      if (searchError) {
        setError(searchError)
        setResults([])
        setOpen(false)
      } else {
        setResults(found)
        setOpen(true)
        setHighlightedIndex(0)
      }
      setLoading(false)
    }

    const timeout = setTimeout(search, 200)
    return () => clearTimeout(timeout)
  }, [query])

  function selectProduct(product: PublicProduct) {
    if (disabled) return
    setQuery('')
    setResults([])
    setOpen(false)
    setHighlightedIndex(0)
    onSelect(product)
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
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const showDropdown = open && mounted && dropdownPos && results.length > 0
  const showEmpty = open && query.trim() && !loading && results.length === 0 && !error && mounted && dropdownPos
  const showError = error && mounted && dropdownPos

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
          className="pl-10 pr-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {!loading && query && (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              setOpen(false)
              inputRef.current?.focus()
            }}
            className="absolute right-0 top-0 inline-flex h-full w-9 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
          className="z-[100] max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
        >
          {results.map((product, index) => (
            <button
              key={product.id}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectProduct(product)}
              className={cn(
                'w-full border-b border-border px-4 py-3 text-left transition-colors last:border-0',
                index === highlightedIndex ? 'bg-primary/10' : 'hover:bg-muted'
              )}
            >
              <div className="font-medium text-foreground text-sm">{product.name}</div>
              <div className="text-xs text-muted-foreground">
                Code: {product.code} · Unit: {product.unit}
                {product.category && ` · ${product.category}`}
              </div>
            </button>
          ))}
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
          className="z-[100] rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-xl"
        >
          No products found. Try a different name or code.
        </div>,
        document.body
      )}
      {showError && createPortal(
        <div
          style={{
            position: 'absolute',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
          className="z-[100] rounded-lg border border-destructive/20 bg-destructive-muted p-4 text-sm text-destructive shadow-xl"
        >
          {error}
        </div>,
        document.body
      )}
      {error && (
        <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
})

