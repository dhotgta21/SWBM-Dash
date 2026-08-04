// components/blog/MaterialList.tsx
// Renders the structured materials block as a clean table. This
// sits below the body (the body itself contains inline links via
// the auto-linker; this block gives readers a quick scannable
// summary and adds internal link equity to product pages).
//
// The list is collapsed to the first COLLAPSED_LIMIT rows by default
// and expands with a "Show all" toggle so long schedules (a self-build
// can have 15+ line items) don't dominate the page on first paint.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Package } from 'lucide-react'
import type { CaseStudyMaterial } from '@/lib/blog/loader'

interface MaterialListProps {
  readonly materials: readonly CaseStudyMaterial[]
}

const COLLAPSED_LIMIT = 5

export function MaterialList({ materials }: MaterialListProps) {
  const [expanded, setExpanded] = useState(false)
  if (materials.length === 0) return null

  const visible = expanded ? materials : materials.slice(0, COLLAPSED_LIMIT)
  const hiddenCount = materials.length - COLLAPSED_LIMIT
  const canCollapse = materials.length > COLLAPSED_LIMIT

  return (
    <section
      aria-labelledby="materials-heading"
      className="my-10 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Package className="h-4 w-4" />
        </span>
        <h2
          id="materials-heading"
          className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
        >
          Materials we supplied
        </h2>
        <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {materials.length} {materials.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        A complete schedule of the materials we delivered to site for
        this project. Click any line to view the full product spec and
        current trade price.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <th scope="col" className="py-3 pr-4">Material</th>
              <th scope="col" className="py-3 pr-4">Quantity</th>
              <th scope="col" className="py-3 text-right">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((m, i) => (
              <tr key={i}>
                <td className="py-3 pr-4 font-semibold text-foreground">
                  {m.name}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{m.quantity}</td>
                <td className="py-3 text-right">
                  <Link
                    href={m.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View product &rarr;
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canCollapse && (
        <div className="mt-5 flex justify-center border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <ChevronDown
              className={[
                'h-3.5 w-3.5 transition-transform',
                expanded ? 'rotate-180' : '',
              ].join(' ')}
            />
            {expanded
              ? 'Show less'
              : `Show all ${materials.length} materials (${hiddenCount} more)`}
          </button>
        </div>
      )}
    </section>
  )
}