// app/tools/mortar-calculator/MortarCalculator.tsx
// Standalone mortar quantity estimator for brick/block laying.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MortarWallVisual } from '@/components/tools/MortarWallVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

type Mode = 'wall' | 'volume'

const MIX_RATIOS: Record<string, { cement: number; sand: number; label: string }> = {
  '1:3': { cement: 1, sand: 3, label: '1:3 (strong)' },
  '1:4': { cement: 1, sand: 4, label: '1:4 (standard)' },
  '1:5': { cement: 1, sand: 5, label: '1:5 (lean)' },
}

const WALL_TYPE_FACTORS: Record<string, number> = {
  brick_single: 0.025,
  brick_cavity: 0.045,
  block_100: 0.017,
  block_140: 0.022,
}

export function MortarCalculator() {
  const [mode, setMode] = useState<Mode>('wall')
  const [length, setLength] = useState<string>('5')
  const [height, setHeight] = useState<string>('2.4')
  const [wallType, setWallType] = useState<string>('brick_single')
  const [volume, setVolume] = useState<string>('1')
  const [mix, setMix] = useState<string>('1:4')
  const [wastage, setWastage] = useState<string>('5')

  const result = useMemo(() => {
    const w = parseFloat(wastage) || 0
    const ratios = MIX_RATIOS[mix] ?? MIX_RATIOS['1:4']

    let mortarM3 = 0
    if (mode === 'wall') {
      const l = parseFloat(length) || 0
      const h = parseFloat(height) || 0
      const factor = WALL_TYPE_FACTORS[wallType] ?? 0.025
      mortarM3 = l * h * factor
    } else {
      mortarM3 = parseFloat(volume) || 0
    }

    if (mortarM3 <= 0) return { mortarM3: 0, cementBags: 0, sandTonne: 0 }

    // Dry volume factor accounts for the reduction in volume when wet.
    const dryVolume = mortarM3 * 1.54
    const totalParts = ratios.cement + ratios.sand

    const cementKg = (ratios.cement / totalParts) * dryVolume * 1440
    const sandKg = (ratios.sand / totalParts) * dryVolume * 1600

    const cementBagsGross = cementKg / 25
    const sandTonneGross = sandKg / 1000

    const cementBags = Math.ceil(cementBagsGross * (1 + w / 100))
    const sandTonne = Math.ceil(sandTonneGross * (1 + w / 100) * 100) / 100

    return { mortarM3, cementBags, sandTonne }
  }, [mode, length, height, wallType, volume, mix, wastage])

  const numLength = parseFloat(length) || 0
  const numHeight = parseFloat(height) || 0
  const numVolume = parseFloat(volume) || 0
  const showVisual =
    (mode === 'wall' && numLength > 0 && numHeight > 0) ||
    (mode === 'volume' && numVolume > 0)

  const mixKey = (mix in MIX_RATIOS ? mix : '1:4') as '1:3' | '1:4' | '1:5'

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap gap-2">
        {[
          { value: 'wall', label: 'From wall size' },
          { value: 'volume', label: 'From volume' },
        ].map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setMode(tab.value as Mode)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              mode === tab.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground hover:bg-muted/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {mode === 'wall' && (
          <>
            <div>
              <Label htmlFor="length">Wall length (m)</Label>
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
              <Label htmlFor="height">Wall height (m)</Label>
              <Input
                id="height"
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="mt-2"
                placeholder="e.g. 2.4"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="wallType">Wall construction</Label>
              <select
                id="wallType"
                value={wallType}
                onChange={(e) => setWallType(e.target.value)}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="brick_single">Single-skin brickwork</option>
                <option value="brick_cavity">Cavity brickwork</option>
                <option value="block_100">100 mm blockwork</option>
                <option value="block_140">140 mm blockwork</option>
              </select>
            </div>
          </>
        )}

        {mode === 'volume' && (
          <div className="sm:col-span-2">
            <Label htmlFor="volume">Mortar volume (m³)</Label>
            <Input
              id="volume"
              type="number"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              className="mt-2"
              placeholder="e.g. 1"
            />
          </div>
        )}

        <div>
          <Label htmlFor="mix">Mortar mix</Label>
          <select
            id="mix"
            value={mix}
            onChange={(e) => setMix(e.target.value)}
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Object.entries(MIX_RATIOS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
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
            placeholder="e.g. 5"
          />
        </div>
      </div>

      {showVisual && (
        <div className="mt-8 rounded-xl border border-border bg-background/40 p-4">
          <MortarWallVisual
            mode={mode}
            length={numLength}
            height={numHeight}
            volume={numVolume}
            mixKey={mixKey}
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/50 p-5 text-center">
          <p className="text-sm text-muted-foreground">Mortar volume</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {formatNumber(result.mortarM3)} m³
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-5 text-center">
          <p className="text-sm text-muted-foreground">Cement (25 kg bags)</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {formatNumber(result.cementBags)}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-5 text-center">
          <p className="text-sm text-muted-foreground">Building sand</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {formatNumber(result.sandTonne)} t
          </p>
        </div>
      </div>

      <div className="mt-6 text-sm text-muted-foreground">
        <p>
          Tip: these figures assume a standard 25 kg cement bag. Round up to whole
          bags and tonne bags when ordering.
        </p>
      </div>
    </div>
  )
}