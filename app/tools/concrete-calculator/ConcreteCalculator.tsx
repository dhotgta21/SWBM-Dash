// app/tools/concrete-calculator/ConcreteCalculator.tsx
// Simple concrete volume calculator for slabs, footings and cylinders.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConcreteShapeVisual, type ConcreteShape } from '@/components/tools/ConcreteShapeVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

export function ConcreteCalculator() {
  const [shape, setShape] = useState<ConcreteShape>('slab')
  const [length, setLength] = useState<string>('5')
  const [width, setWidth] = useState<string>('4')
  const [depth, setDepth] = useState<string>('0.15')
  const [diameter, setDiameter] = useState<string>('0.3')
  const [wastage, setWastage] = useState<string>('5')

  const result = useMemo(() => {
    const w = parseFloat(wastage) || 0
    if (shape === 'slab' || shape === 'footing') {
      const l = parseFloat(length) || 0
      const wd = parseFloat(width) || 0
      const d = parseFloat(depth) || 0
      const gross = l * wd * d
      return gross * (1 + w / 100)
    }
    const d = parseFloat(diameter) || 0
    const depthVal = parseFloat(depth) || 0
    const radius = d / 2
    const gross = Math.PI * radius * radius * depthVal
    return gross * (1 + w / 100)
  }, [shape, length, width, depth, diameter, wastage])

  const shapeTabs: { value: ConcreteShape; label: string }[] = [
    { value: 'slab', label: 'Slab' },
    { value: 'footing', label: 'Strip footing' },
    { value: 'cylinder', label: 'Column' },
  ]

  const numLength = parseFloat(length) || 0
  const numWidth = parseFloat(width) || 0
  const numDepth = parseFloat(depth) || 0
  const numDiameter = parseFloat(diameter) || 0

  const showVisual =
    (shape === 'cylinder' && numDiameter > 0 && numDepth > 0) ||
    ((shape === 'slab' || shape === 'footing') && numLength > 0 && numDepth > 0 && (shape === 'footing' || numWidth > 0))

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap gap-2">
        {shapeTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setShape(tab.value)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              shape === tab.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {(shape === 'slab' || shape === 'footing') && (
          <>
            <div>
              <Label htmlFor="length">Length (m)</Label>
              <Input
                id="length"
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="mt-2"
                placeholder="e.g. 5"
              />
            </div>
            <div>
              <Label htmlFor="width">Width (m)</Label>
              <Input
                id="width"
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="mt-2"
                placeholder="e.g. 4"
              />
            </div>
          </>
        )}

        {shape === 'cylinder' && (
          <div>
            <Label htmlFor="diameter">Diameter (m)</Label>
            <Input
              id="diameter"
              type="number"
              value={diameter}
              onChange={(e) => setDiameter(e.target.value)}
              className="mt-2"
              placeholder="e.g. 0.3"
            />
          </div>
        )}

        <div>
          <Label htmlFor="depth">
            {shape === 'cylinder' ? 'Height (m)' : 'Depth (m)'}
          </Label>
          <Input
            id="depth"
            type="number"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 0.15"
          />
        </div>

        <div>
          <Label htmlFor="wastage">Wastage (%)</Label>
          <Input
            id="wastage"
            type="number"
            value={wastage}
            onChange={(e) => setWastage(e.target.value)}
            className="mt-2"
            placeholder="e.g. 5"
          />
        </div>
      </div>

      {showVisual && (
        <div className="mt-8 rounded-xl border border-border bg-background/40 p-4">
          <ConcreteShapeVisual
            shape={shape}
            length={numLength}
            width={numWidth}
            depth={numDepth}
            diameter={numDiameter}
          />
        </div>
      )}

      <div className="mt-8 rounded-xl bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Concrete needed</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {formatNumber(result)} m³
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Includes {wastage || '0'}% wastage allowance.
        </p>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          Tip: ready-mix concrete is usually ordered in whole cubic metres. Round
          up to the nearest m³ when calling for a quote.
        </p>
      </div>
    </div>
  )
}