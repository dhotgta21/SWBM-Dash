// app/tools/coverage-calculator/CoverageCalculator.tsx
// Coverage calculator for paint, render, primer and sealant.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { CoverageVisual } from '@/components/tools/CoverageVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

const PRESETS = [
  { value: 'emulsion', label: 'Emulsion paint', coverage: 12, unit: 'L' },
  { value: 'masonry', label: 'Masonry paint', coverage: 5, unit: 'L' },
  { value: 'primer', label: 'Primer / sealer', coverage: 10, unit: 'L' },
  { value: 'render', label: 'Render (bag)', coverage: 8, unit: 'bag' },
  { value: 'adhesive', label: 'Tile adhesive', coverage: 5, unit: 'kg' },
  { value: 'grout', label: 'Tile grout', coverage: 3, unit: 'kg' },
  { value: 'custom', label: 'Custom coverage', coverage: 10, unit: 'L' },
]

export function CoverageCalculator() {
  const [preset, setPreset] = useState<string>('emulsion')
  const [area, setArea] = useState<string>('30')
  const [coverage, setCoverage] = useState<string>('12')
  const [coats, setCoats] = useState<string>('2')
  const [unitSize, setUnitSize] = useState<string>('5')

  const result = useMemo(() => {
    const a = parseFloat(area) || 0
    const c = parseFloat(coverage) || 0
    const ct = parseFloat(coats) || 1
    const size = parseFloat(unitSize) || 1

    if (c <= 0) return { total: 0, units: 0, unitLabel: 'units' }

    const totalMaterial = (a * ct) / c
    const units = Math.ceil(totalMaterial / size)

    const selected = PRESETS.find((p) => p.value === preset)
    return { total: totalMaterial, units, unitLabel: selected?.unit ?? 'L' }
  }, [preset, area, coverage, coats, unitSize])

  const handlePresetChange = (value: string) => {
    setPreset(value)
    const selected = PRESETS.find((p) => p.value === value)
    if (selected && value !== 'custom') {
      setCoverage(String(selected.coverage))
      setUnitSize(selected.unit === 'bag' ? '25' : selected.unit === 'kg' ? '20' : '5')
    }
  }

  const numArea = parseFloat(area) || 0
  const numCoverage = parseFloat(coverage) || 0
  const numCoats = parseFloat(coats) || 0
  const numUnitSize = parseFloat(unitSize) || 0
  const showVisual = numArea > 0 && numCoverage > 0 && numUnitSize > 0 && result.units > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div>
        <Label htmlFor="material">Material</Label>
        <Select
          id="material"
          value={preset}
          onChange={handlePresetChange}
          options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          className="mt-2"
        />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="area">Area to cover (m²)</Label>
          <Input
            id="area"
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-2"
            placeholder="e.g. 30"
          />
        </div>
        <div>
          <Label htmlFor="coats">Number of coats</Label>
          <Input
            id="coats"
            type="number"
            value={coats}
            onChange={(e) => setCoats(e.target.value)}
            className="mt-2"
            placeholder="e.g. 2"
          />
        </div>
        <div>
          <Label htmlFor="coverage">Coverage per unit (m²)</Label>
          <Input
            id="coverage"
            type="number"
            value={coverage}
            onChange={(e) => {
              setCoverage(e.target.value)
              setPreset('custom')
            }}
            className="mt-2"
            placeholder="e.g. 12"
          />
        </div>
        <div>
          <Label htmlFor="unit-size">Unit size (L / kg / bag)</Label>
          <Input
            id="unit-size"
            type="number"
            value={unitSize}
            onChange={(e) => setUnitSize(e.target.value)}
            className="mt-2"
            placeholder="e.g. 5"
          />
        </div>
      </div>

      {showVisual && (
        <div className="mt-8 rounded-xl border border-border bg-background/40 p-4">
          <CoverageVisual
            area={numArea}
            coveragePerUnit={numCoverage}
            coats={numCoats}
            unitSize={numUnitSize}
            totalMaterial={result.total}
            containers={result.units}
            unitLabel={result.unitLabel}
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Total material needed</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {formatNumber(result.total)} {result.unitLabel}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Containers to buy</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {result.units} × {unitSize || '0'} {result.unitLabel}
          </p>
        </div>
      </div>
    </div>
  )
}