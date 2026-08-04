// app/tools/plaster-calculator/PlasterCalculator.tsx
// Plaster, render and plasterboard quantity calculator.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlasterWallVisual, type PlasterFinish } from '@/components/tools/PlasterWallVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

const FINISH_OPTIONS: { value: PlasterFinish; label: string; coverageM2: number; unit: string }[] = [
  { value: 'skim', label: 'Skim coat only', coverageM2: 10, unit: 'bag' },
  { value: 'two_coat', label: 'Two-coat plaster', coverageM2: 5, unit: 'bag' },
  { value: 'render', label: 'Render base coat', coverageM2: 8, unit: 'bag' },
  { value: 'board', label: 'Plasterboard sheets', coverageM2: 2.88, unit: 'sheet' },
]

export function PlasterCalculator() {
  const [area, setArea] = useState<string>('20')
  const [finish, setFinish] = useState<PlasterFinish>('skim')
  const [wastage, setWastage] = useState<string>('10')

  const result = useMemo(() => {
    const a = parseFloat(area) || 0
    const w = parseFloat(wastage) || 0
    const option = FINISH_OPTIONS.find((o) => o.value === finish) ?? FINISH_OPTIONS[0]

    if (a <= 0 || option.coverageM2 <= 0) {
      return { quantity: 0, unit: option.unit }
    }

    const gross = a / option.coverageM2
    const quantity = Math.ceil(gross * (1 + w / 100))
    return { quantity, unit: option.unit }
  }, [area, finish, wastage])

  const numArea = parseFloat(area) || 0
  const showVisual = numArea > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="area">Area to cover (m²)</Label>
          <Input
            id="area"
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-2"
            placeholder="e.g. 20"
          />
        </div>

        <div>
          <Label htmlFor="finish">Finish type</Label>
          <select
            id="finish"
            value={finish}
            onChange={(e) => setFinish(e.target.value as PlasterFinish)}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FINISH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="wastage">Wastage (%)</Label>
          <Input
            id="wastage"
            type="number"
            value={wastage}
            onChange={(e) => setWastage(e.target.value)}
            className="mt-2"
            placeholder="e.g. 10"
          />
        </div>
      </div>

      {showVisual && (
        <div className="mt-8 rounded-xl border border-border bg-background/40 p-4">
          <PlasterWallVisual area={numArea} finish={finish} />
        </div>
      )}

      <div className="mt-8 rounded-xl bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Quantity needed</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {formatNumber(result.quantity)} {result.unit}s
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Includes {wastage || '0'}% wastage allowance.
        </p>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          Tip: coverage is approximate. Check the product specification for the
          exact coverage of your chosen plaster, render or board.
        </p>
      </div>
    </div>
  )
}