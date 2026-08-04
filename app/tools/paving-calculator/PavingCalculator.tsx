// app/tools/paving-calculator/PavingCalculator.tsx
// Paving / patio calculator: slabs, sub-base and bedding sand.

'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PavingLayoutVisual } from '@/components/tools/PavingLayoutVisual'

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  return value.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

export function PavingCalculator() {
  const [length, setLength] = useState<string>('4')
  const [width, setWidth] = useState<string>('3')
  const [slabLength, setSlabLength] = useState<string>('600')
  const [slabWidth, setSlabWidth] = useState<string>('600')
  const [joint, setJoint] = useState<string>('10')
  const [wastage, setWastage] = useState<string>('10')
  const [subBaseDepth, setSubBaseDepth] = useState<string>('100')
  const [beddingDepth, setBeddingDepth] = useState<string>('50')

  const result = useMemo(() => {
    const area = (parseFloat(length) || 0) * (parseFloat(width) || 0)
    const sl = (parseFloat(slabLength) || 0) / 1000
    const sw = (parseFloat(slabWidth) || 0) / 1000
    const j = (parseFloat(joint) || 0) / 1000
    const w = parseFloat(wastage) || 0

    let slabCount = 0
    if (sl > 0 && sw > 0) {
      const effectiveLength = sl + j
      const effectiveWidth = sw + j
      slabCount = Math.ceil(area / (effectiveLength * effectiveWidth))
      slabCount = Math.ceil(slabCount * (1 + w / 100))
    }

    const subBase = area * ((parseFloat(subBaseDepth) || 0) / 1000)
    const bedding = area * ((parseFloat(beddingDepth) || 0) / 1000)

    return { area, slabCount, subBase, bedding }
  }, [length, width, slabLength, slabWidth, joint, wastage, subBaseDepth, beddingDepth])

  const aL = parseFloat(length) || 0
  const aW = parseFloat(width) || 0
  const sL = (parseFloat(slabLength) || 0) / 1000
  const sW = (parseFloat(slabWidth) || 0) / 1000
  const jt = (parseFloat(joint) || 0) / 1000
  const subD = (parseFloat(subBaseDepth) || 0) / 1000
  const bedD = (parseFloat(beddingDepth) || 0) / 1000
  const showVisual = aL > 0 && aW > 0 && sL > 0 && sW > 0

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor="area-length">Area length (m)</Label>
          <Input
            id="area-length"
            type="number"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className="mt-2"
            placeholder="e.g. 4"
          />
        </div>
        <div>
          <Label htmlFor="area-width">Area width (m)</Label>
          <Input
            id="area-width"
            type="number"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 3"
          />
        </div>

        <div>
          <Label htmlFor="slab-length">Slab length (mm)</Label>
          <Input
            id="slab-length"
            type="number"
            value={slabLength}
            onChange={(e) => setSlabLength(e.target.value)}
            className="mt-2"
            placeholder="e.g. 600"
          />
        </div>
        <div>
          <Label htmlFor="slab-width">Slab width (mm)</Label>
          <Input
            id="slab-width"
            type="number"
            value={slabWidth}
            onChange={(e) => setSlabWidth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 600"
          />
        </div>

        <div>
          <Label htmlFor="joint">Joint width (mm)</Label>
          <Input
            id="joint"
            type="number"
            value={joint}
            onChange={(e) => setJoint(e.target.value)}
            className="mt-2"
            placeholder="e.g. 10"
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
            placeholder="e.g. 10"
          />
        </div>

        <div>
          <Label htmlFor="sub-base">Sub-base depth (mm)</Label>
          <Input
            id="sub-base"
            type="number"
            value={subBaseDepth}
            onChange={(e) => setSubBaseDepth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 100"
          />
        </div>
        <div>
          <Label htmlFor="bedding">Bedding sand depth (mm)</Label>
          <Input
            id="bedding"
            type="number"
            value={beddingDepth}
            onChange={(e) => setBeddingDepth(e.target.value)}
            className="mt-2"
            placeholder="e.g. 50"
          />
        </div>
      </div>

      {showVisual && (
        <div className="mt-8 rounded-xl border border-border bg-background/40 p-4">
          <PavingLayoutVisual
            length={aL}
            width={aW}
            slabLength={sL}
            slabWidth={sW}
            joint={jt}
            subBaseDepth={subD}
            beddingDepth={bedD}
          />
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ResultCard label="Patio area" value={`${formatNumber(result.area)} m²`} />
        <ResultCard label="Slabs needed" value={`${result.slabCount} slabs`} />
        <ResultCard label="Sub-base (MOT Type 1)" value={`${formatNumber(result.subBase)} m³`} />
        <ResultCard label="Bedding sand" value={`${formatNumber(result.bedding)} m³`} />
      </div>
    </div>
  )
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{value}</p>
    </div>
  )
}