'use client'

// components/ui/MoneyInput.tsx
//
// Reverse-entry currency input — calculator-style. Each digit appends to the
// right of the running pence value, so:
//
//   typed "1"      → 1p    → display "0.01"
//   typed "0"      → 10p   → display "0.10"
//   typed "0"      → 100p  → display "1.00"
//   typed "0"      → 1000p → display "10.00"
//   typed "5"      → 1005p → display "10.05"
//
// Backspace strips the rightmost digit (`Math.floor(pence / 10)`).
//
// Display rules:
//   - Focused + value is zero → show empty so the first keystroke isn't
//     preceded by a stray "0".
//   - Unfocused + value is zero → show "0.00" so the operator can see the
//     slot is empty but valid.
//   - Otherwise → format as fixed 2-decimal "X.XX".
//
// Why not `<input type="number">`: native number inputs allow typing the
// decimal point, accept exponent notation, hide leading zeros, and let the
// user scroll the value with arrow keys. None of that matches how shop
// staff type prices — they reach for the digit keys and expect the field
// to behave like a till.

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface MoneyInputProps {
  /** Current value in integer pence (550 = £5.50). */
  valuePence: number
  /** Called whenever the pence value changes. */
  onChangePence: (pence: number) => void
  /** Pass-through key handler — used by callers to chain Tab/Enter behaviour. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  /** Optional ref forwarded to the underlying input (for `.focus()` etc.). */
  ref?: React.Ref<HTMLInputElement>
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  id?: string
  name?: string
  autoFocus?: boolean
  'aria-label'?: string
}

export function MoneyInput({
  valuePence,
  onChangePence,
  onKeyDown,
  ref,
  disabled,
  placeholder = '0.00',
  className,
  inputClassName,
  id,
  name,
  autoFocus,
  'aria-label': ariaLabel,
}: MoneyInputProps) {
  const innerRef = React.useRef<HTMLInputElement | null>(null)
  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref && 'current' in ref) {
        ;(ref as React.MutableRefObject<HTMLInputElement | null>).current = node
      }
    },
    [ref],
  )

  const [isFocused, setIsFocused] = React.useState(false)

  const displayValue = React.useMemo(() => {
    if (valuePence === 0) {
      // Show empty while typing so the operator's first digit isn't fighting
      // a leading "0". Outside focus, fall back to "0.00" so the slot still
      // looks valid.
      return isFocused ? '' : '0.00'
    }
    return (valuePence / 100).toFixed(2)
  }, [valuePence, isFocused])

  function placeCaretAtEnd() {
    // Defer one frame so React commits the new value before we move the
    // caret. Without this the caret would jump to position 0 on every
    // keystroke.
    requestAnimationFrame(() => {
      const el = innerRef.current
      if (!el) return
      const end = el.value.length
      try {
        el.setSelectionRange(end, end)
      } catch {
        // setSelectionRange throws on input type=email etc. We use text,
        // so this should never fire — swallow defensively.
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Let modifier shortcuts (Cmd+A, Ctrl+C, etc.) through unchanged.
    if (e.metaKey || e.ctrlKey || e.altKey) {
      onKeyDown?.(e)
      return
    }

    // Tab / Enter / arrow keys are navigation — let the caller's handler
    // (or the browser default) deal with them.
    if (e.key === 'Tab' || e.key === 'Enter' || e.key.startsWith('Arrow')) {
      onKeyDown?.(e)
      return
    }

    if (e.key >= '0' && e.key <= '9') {
      e.preventDefault()
      const digit = Number.parseInt(e.key, 10)
      onChangePence(valuePence * 10 + digit)
      placeCaretAtEnd()
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      onChangePence(Math.floor(valuePence / 10))
      placeCaretAtEnd()
      return
    }

    if (e.key === 'Delete') {
      e.preventDefault()
      onChangePence(0)
      placeCaretAtEnd()
      return
    }

    // Block any other printable character (letters, symbols, decimal point).
    // The field is calculator-only — there is no £ or . to type because the
    // unit and decimals are implied.
    if (e.key.length === 1) {
      e.preventDefault()
      return
    }

    // Anything else (function keys, etc.) just falls through.
    onKeyDown?.(e)
  }

  function handleFocus() {
    setIsFocused(true)
    // Select the whole value so the next digit overwrites. Common case:
    // operator picks a product with a default price they want to override.
    requestAnimationFrame(() => {
      innerRef.current?.select()
    })
  }

  function handleBlur() {
    setIsFocused(false)
  }

  return (
    <div className={cn('relative', className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"
      >
        £
      </span>
      <Input
        ref={setRefs}
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(e) => {
          // Keystrokes are captured in onKeyDown (we preventDefault on
          // digits) so onChange normally only fires for paste / drop /
          // autofill. Treat those as "best effort reverse entry": keep
          // only the digits and re-parse to pence.
          const digits = e.target.value.replace(/[^\d]/g, '')
          const pence = digits === '' ? 0 : Number.parseInt(digits, 10)
          onChangePence(pence)
          placeCaretAtEnd()
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        className={cn('pl-7 tabular-nums', inputClassName)}
      />
    </div>
  )
}