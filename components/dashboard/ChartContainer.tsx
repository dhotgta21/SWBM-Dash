'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ChartContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Wrapper that measures its DOM node and only renders the Recharts
 * ResponsiveContainer once the node has a positive width and height.
 *
 * This prevents Recharts' "width(-1) and height(-1) of chart should be
 * greater than 0" warning, which can fire when ResponsiveContainer is
 * mounted while its parent still has zero computed dimensions (e.g. in
 * a flex/grid layout before the first paint, or inside a hidden tab).
 */
export function ChartContainer({ children, className }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const updateSize = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(el)

    window.addEventListener('resize', updateSize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [])

  const ready = size && size.width > 0 && size.height > 0

  return (
    <div ref={ref} className={cn('min-w-0 min-h-0', className)}>
      {ready ? (
        <div style={{ width: size.width, height: size.height }}>{children}</div>
      ) : null}
    </div>
  )
}
