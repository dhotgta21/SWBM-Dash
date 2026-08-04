import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onWheel, ...props }, ref) => {
    // Number inputs must not react to the mouse wheel: while the field has
    // focus, scrolling the page (e.g. to reach a Save button) would nudge
    // the value by `step` — a penny at a time for money fields, silently
    // turning 10,000 into 9,999.99. Blur on wheel to kill the browser's
    // step behaviour; the page still scrolls. A caller-supplied onWheel
    // always wins.
    const handleWheel =
      type === 'number' && !onWheel
        ? (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur()
        : onWheel
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-placeholder focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        onWheel={handleWheel}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
