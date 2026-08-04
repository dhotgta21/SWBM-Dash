// app/tools/tile-calculator/TileCalculator.tsx
// Tile calculator: wall or floor area to tile count with wastage.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TileLayoutVisual } from '@/components/tools/TileLayoutVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

export function TileCalculator() {
  const [areaLength, setAreaLength] = useState<string>('3')
  const [areaWidth, setAreaWidth] = useState<string>('2')
  const [tileLength, setTileLength] = useState<string>('300')
  const [tileWidth, setTileWidth] = useState<string>('300')
  const [wastage, setWastage] = useState<string>('10')

  const result = useMemo(() => {
    const area = (parseFloat(areaLength) || 0) * (parseFloat(areaWidth) || 0)
    const tl = (parseFloat(tileLength) || 0) / 1000
    const tw = (parseFloat(tileWidth) || 0) / 1000
    const w = parseFloat(wastage) || 0

    let tiles = 0
    let boxes = 0
    const boxSize = 5 // assume 5 tiles per box as rough estimate

    if (tl > 0 && tw > 0) {
      const tileArea = tl * tw
      tiles = Math.ceil(area / tileArea)
      tiles = Math.ceil(tiles * (1 + w / 100))
      boxes = Math.ceil(tiles / boxSize)
    }

    return { area, tiles, boxes }
  }, [areaLength, areaWidth, tileLength, tileWidth, wastage])

  const aL = parseFloat(areaLength) || 0
  const aW = parseFloat(areaWidth) || 0
  const tL = (parseFloat(tileLength) || 0) / 1000
  const tW = (parseFloat(tileWidth) || 0) / 1000
  const showVisual = aL > 0 && aW > 0 && tL > 0 && tW > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="area-length">Area length (m)</Label>
          <Input
            id="area-length"
            type="number"
            value={areaLength}
            onChange={(e) => setAreaLength(e.target.value)}
            className="mt-2"
            placeholder="e.g. 3"
          />
        </div>
        <div>
          <Label htmlFor="area-width">Area width (m)</Label>
          <Input
            id="area-width"
            type="number"
            value={areaWidth}
            onChange={(e) => setAreaWidth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 2"
          />
        </div>

        <div>
          <Label htmlFor="tile-length">Tile length (mm)</Label>
          <Input
            id="tile-length"
            type="number"
            value={tileLength}
            onChange={(e) => setTileLength(e.target.value)}
            className="mt-2"
            placeholder="e.g. 300"
          />
        </div>
        <div>
          <Label htmlFor="tile-width">Tile width (mm)</Label>
          <Input
            id="tile-width"
            type="number"
            value={tileWidth}
            onChange={(e) => setTileWidth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 300"
          />
        </div>

        <div className="sm:col-span-2">
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
          <TileLayoutVisual
            areaLength={aL}
            areaWidth={aW}
            tileLength={tL}
            tileWidth={tW}
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Area to tile</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {formatNumber(result.area)} m²
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Tiles needed</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {result.tiles}
          </p>
        </div>
        <div className="rounded-xl bg-muted/50 p-4 text-center">
          <p className="text-sm text-muted-foreground">Approx. boxes (5 per box)</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
            {result.boxes}
          </p>
        </div>
      </div>
    </div>
  )
}