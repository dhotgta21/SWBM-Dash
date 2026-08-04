'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMounted } from '@/lib/hooks/use-mounted'
import { lookupPostcode } from '@/lib/actions/postcode'
import type { AddressSuggestion } from '@/lib/postcode/goaddress-map'

export interface AddressValue {
  line1: string
  line2: string
  town: string
  county: string
  postcode: string
}

interface AddressAutocompleteProps {
  value: AddressValue
  onChange: (value: AddressValue) => void
  disabled?: boolean
  // Distinct IDs in case two AddressAutocomplete components are rendered on the
  // same page (e.g. billing + delivery on the same form).
  idPrefix?: string
}

const EMPTY_VALUE: AddressValue = {
  line1: '',
  line2: '',
  town: '',
  county: '',
  postcode: '',
}

// Only fire after a complete UK outward+inward postcode is typed.
// Partial values (e.g. "HA3 7") would waste paid GoAddress calls and
// surface "not found" while the operator is still typing.
function looksLikePostcode(v: string): boolean {
  const cleaned = v.replace(/\s/g, '').toUpperCase()
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(cleaned)
}

export function AddressAutocomplete({
  value,
  onChange,
  disabled,
  idPrefix = 'address',
}: AddressAutocompleteProps) {
  const [postcode, setPostcode] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const mounted = useMounted()
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  const hasAnyValue =
    !!value.line1 || !!value.line2 || !!value.town || !!value.county || !!value.postcode

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

  // Debounced postcode lookup — fires 300ms after the last keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = postcode.trim()
    if (!looksLikePostcode(trimmed)) {
      setSuggestions([])
      setOpen(false)
      setError(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await lookupPostcode(trimmed)
        if ('error' in result) {
          // Visible in browser DevTools → Console (server also logs Vercel runtime logs).
          console.error('[address-autocomplete] postcode lookup error:', result.error, {
            postcode: trimmed,
          })
          setError(result.error)
          setSuggestions([])
          setOpen(false)
          // Open manual fields so the operator can still type an address.
          setManualOpen(true)
          return
        }

        const list = result.suggestions || []
        setSuggestions(list)
        setOpen(list.length > 0)
        setActiveIndex(-1)

        // Soft failures (no GoAddress list / free postcodes.io fallback):
        // prefill town/county + postcode and open manual entry so the form
        // is never a silent no-op.
        if (list.length === 0) {
          const soft =
            result.softError ||
            (result.provider === 'postcodes.io'
              ? 'Full address list unavailable. Town/county were filled where possible - complete the rest manually.'
              : null)
          if (soft) {
            console.error('[address-autocomplete] postcode lookup soft failure:', soft, {
              postcode: trimmed,
              provider: result.provider ?? 'unknown',
              town: result.town,
              county: result.county,
            })
            setError(soft)
          }
          setManualOpen(true)
          const current = valueRef.current
          onChangeRef.current({
            line1: current.line1,
            line2: current.line2,
            town: result.town || current.town,
            county: result.county || current.county,
            postcode: result.postcode || trimmed,
          })
        } else {
          console.info(
            `[address-autocomplete] ${list.length} suggestion(s) for ${trimmed} via ${result.provider ?? 'goaddress'}`,
          )
        }
      } catch (err) {
        console.error('[address-autocomplete] postcode lookup threw:', err)
        setError('Postcode lookup unavailable')
        setSuggestions([])
        setOpen(false)
        setManualOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [postcode])

  // Keep the dropdown positioned under the input while it is open, and close
  // when clicking outside either the input or the dropdown itself.
  useEffect(() => {
    if (!open) return

    updateDropdownPosition()

    function handlePositionChange() {
      updateDropdownPosition()
    }

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
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

  function selectSuggestion(s: AddressSuggestion) {
    onChange({
      line1: s.line_1,
      line2: s.line_2,
      town: s.town,
      county: s.county,
      postcode: s.postcode,
    })
    setPostcode('')
    setSuggestions([])
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (suggestions.length === 0) return
      setOpen(true)
      setActiveIndex((i) => (i < suggestions.length - 1 ? i + 1 : i))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i > 0 ? i - 1 : -1))
    } else if (e.key === 'Enter') {
      // While the dropdown is open, Enter belongs to the suggestions —
      // never let it bubble into a parent form submit, even when no
      // suggestion is highlighted yet.
      if (open && suggestions.length > 0) {
        e.preventDefault()
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          selectSuggestion(suggestions[activeIndex])
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function updateField(field: keyof AddressValue, v: string) {
    onChange({ ...value, [field]: v })
  }

  function clearAll() {
    onChange(EMPTY_VALUE)
    setPostcode('')
    setSuggestions([])
    setOpen(false)
  }

  const showDropdown = open && suggestions.length > 0 && mounted && dropdownPos

  const dropdown = showDropdown ? (
    <ul
      ref={dropdownRef}
      id={`${idPrefix}-listbox`}
      role="listbox"
      style={{
        position: 'absolute',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
      }}
      className="z-[100] bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
    >
      {suggestions.map((s, i) => (
        <li
          key={`${s.label}-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          // mousedown (not click) so the input keeps focus and the
          // selection lands before any blur handlers fire.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectSuggestion(s)}
          onMouseEnter={() => setActiveIndex(i)}
          className={cn(
            'px-4 py-2 cursor-pointer text-sm border-b border-gray-100 last:border-0',
            i === activeIndex ? 'bg-red-50' : 'hover:bg-gray-50'
          )}
        >
          {s.label}
        </li>
      ))}
    </ul>
  ) : null

  const selectedLines = [value.line1, value.line2, value.town, value.county, value.postcode].filter(Boolean)

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between">
          <Label htmlFor={`${idPrefix}-postcode`}>Postcode</Label>
          {(hasAnyValue || postcode) && (
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs text-gray-500 hover:text-red-700 disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
        <div className="relative">
          <Input
            ref={inputRef}
            id={`${idPrefix}-postcode`}
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Enter postcode (e.g. HA3 7HZ)..."
            disabled={disabled}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={`${idPrefix}-listbox`}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
          )}
        </div>
        {error && (
          <p className="text-xs text-amber-600">
            {error}. You can still enter the address manually below.
          </p>
        )}
        {dropdown && createPortal(dropdown, document.body)}
      </div>

      {hasAnyValue && !manualOpen && selectedLines.length > 0 && (
        <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Selected address</p>
          {selectedLines.map((line, i) => (
            <p key={i} className="text-sm font-medium">{line}</p>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setManualOpen((v) => !v)}
        disabled={disabled}
        className="w-full sm:w-auto"
      >
        {manualOpen ? (
          <>
            <ChevronUp className="w-4 h-4 mr-2" />
            Hide manual address
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4 mr-2" />
            Enter address manually
          </>
        )}
      </Button>

      {manualOpen && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-line1`}>Address Line 1</Label>
            <Input
              id={`${idPrefix}-line1`}
              value={value.line1}
              onChange={(e) => updateField('line1', e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-line2`}>Address Line 2</Label>
            <Input
              id={`${idPrefix}-line2`}
              value={value.line2}
              onChange={(e) => updateField('line2', e.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-town`}>Town</Label>
              <Input
                id={`${idPrefix}-town`}
                value={value.town}
                onChange={(e) => updateField('town', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-county`}>County</Label>
              <Input
                id={`${idPrefix}-county`}
                value={value.county}
                onChange={(e) => updateField('county', e.target.value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-postcode-manual`}>Postcode</Label>
              <Input
                id={`${idPrefix}-postcode-manual`}
                value={value.postcode}
                onChange={(e) => updateField('postcode', e.target.value.toUpperCase())}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
