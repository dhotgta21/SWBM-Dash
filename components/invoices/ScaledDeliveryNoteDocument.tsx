'use client'

// Wrapper around DeliveryNoteDocument that scales the 794px-wide A4 layout
// to fit whatever container it's placed in. Mirrors ScaledInvoiceDocument.

import { useEffect, useRef, useState } from 'react'
import { DeliveryNoteDocument } from '@/components/invoices/DeliveryNoteDocument'
import type { ComponentProps } from 'react'

const A4_WIDTH = 794

export function ScaledDeliveryNoteDocument(props: ComponentProps<typeof DeliveryNoteDocument>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>(() => {
    if (typeof window === 'undefined') return undefined
    const width = Math.min(window.innerWidth - 32, 820 - 32)
    return Math.max(0, width * (1123 / 794))
  })

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) return

    function update() {
      if (!container || !content) return
      const rect = container.getBoundingClientRect()
      const style = getComputedStyle(container)
      const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const availableWidth = Math.max(0, rect.width - paddingX)
      const newScale = availableWidth / A4_WIDTH
      setScale(newScale)
      setHeight(content.scrollHeight * newScale)
    }

    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (ro) ro.observe(container)
    window.addEventListener('resize', update)
    return () => {
      if (ro) ro.unobserve(container)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    if (!contentRef.current) return
    setHeight(contentRef.current.scrollHeight * scale)
  }, [scale, props.invoice, props.company, props.logoSrc])

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-2"
      style={{ height, minHeight: height }}
    >
      <div
        ref={contentRef}
        style={{
          width: A4_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        <DeliveryNoteDocument {...props} />
      </div>
    </div>
  )
}
