// app/tools/unit-converter/UnitConverter.tsx
// Client-side unit converter logic.

'use client'

import { useState, useMemo } from 'react'
import { ArrowRightLeft, Ruler, Maximize, Box, Weight, Thermometer } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const CATEGORIES = [
  { id: 'length', label: 'Length', icon: Ruler },
  { id: 'area', label: 'Area', icon: Maximize },
  { id: 'volume', label: 'Volume', icon: Box },
  { id: 'weight', label: 'Weight', icon: Weight },
  { id: 'temperature', label: 'Temperature', icon: Thermometer },
] as const

type Category = (typeof CATEGORIES)[number]['id']

const UNITS: Record<
  Category,
  { value: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[]
> = {
  length: [
    { value: 'm', label: 'Metres (m)', toBase: (v) => v, fromBase: (v) => v },
    { value: 'mm', label: 'Millimetres (mm)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { value: 'cm', label: 'Centimetres (cm)', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
    { value: 'ft', label: 'Feet (ft)', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
    { value: 'in', label: 'Inches (in)', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
    { value: 'yd', label: 'Yards (yd)', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
  ],
  area: [
    { value: 'm2', label: 'Square metres (m²)', toBase: (v) => v, fromBase: (v) => v },
    { value: 'ft2', label: 'Square feet (ft²)', toBase: (v) => v * 0.092903, fromBase: (v) => v / 0.092903 },
    { value: 'yd2', label: 'Square yards (yd²)', toBase: (v) => v * 0.836127, fromBase: (v) => v / 0.836127 },
    { value: 'ac', label: 'Acres', toBase: (v) => v * 4046.86, fromBase: (v) => v / 4046.86 },
  ],
  volume: [
    { value: 'm3', label: 'Cubic metres (m³)', toBase: (v) => v, fromBase: (v) => v },
    { value: 'l', label: 'Litres (L)', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
    { value: 'yd3', label: 'Cubic yards (yd³)', toBase: (v) => v * 0.764555, fromBase: (v) => v / 0.764555 },
    { value: 'ft3', label: 'Cubic feet (ft³)', toBase: (v) => v * 0.0283168, fromBase: (v) => v / 0.0283168 },
    { value: 'gal', label: 'UK Gallons', toBase: (v) => v * 0.00454609, fromBase: (v) => v / 0.00454609 },
  ],
  weight: [
    { value: 'kg', label: 'Kilograms (kg)', toBase: (v) => v, fromBase: (v) => v },
    { value: 't', label: 'Tonnes (t)', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    { value: 'lb', label: 'Pounds (lb)', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
    { value: 'st', label: 'Stone (st)', toBase: (v) => v * 6.35029, fromBase: (v) => v / 6.35029 },
    { value: 'bag', label: '25kg bags', toBase: (v) => v * 25, fromBase: (v) => v / 25 },
  ],
  temperature: [
    { value: 'c', label: 'Celsius (°C)', toBase: (v) => v, fromBase: (v) => v },
    { value: 'f', label: 'Fahrenheit (°F)', toBase: (v) => (v - 32) * (5 / 9), fromBase: (v) => v * (9 / 5) + 32 },
  ],
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs < 0.001 || abs >= 1000000) return value.toExponential(4)
  return value.toLocaleString('en-GB', { maximumFractionDigits: 4 })
}

export function UnitConverter() {
  const [category, setCategory] = useState<Category>('length')
  const [amount, setAmount] = useState<string>('1')
  const [fromUnit, setFromUnit] = useState<string>('m')
  const [toUnit, setToUnit] = useState<string>('ft')

  const units = UNITS[category]

  const result = useMemo(() => {
    const value = parseFloat(amount)
    if (!Number.isFinite(value)) return null
    const from = units.find((u) => u.value === fromUnit)
    const to = units.find((u) => u.value === toUnit)
    if (!from || !to) return null
    const base = from.toBase(value)
    return to.fromBase(base)
  }, [amount, fromUnit, toUnit, units])

  const handleCategoryChange = (cat: Category) => {
    setCategory(cat)
    const defaults: Record<Category, [string, string]> = {
      length: ['m', 'ft'],
      area: ['m2', 'ft2'],
      volume: ['m3', 'yd3'],
      weight: ['kg', 't'],
      temperature: ['c', 'f'],
    }
    const [f, t] = defaults[cat]
    setFromUnit(f)
    setToUnit(t)
  }

  const swap = () => {
    setFromUnit(toUnit)
    setToUnit(fromUnit)
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const active = category === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {cat.label}
            </button>
          )
        })}
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-2"
            placeholder="Enter amount"
          />
        </div>

        <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <Label htmlFor="from-unit">From</Label>
            <Select
              id="from-unit"
              value={fromUnit}
              onChange={setFromUnit}
              options={units.map((u) => ({ value: u.value, label: u.label }))}
              className="mt-2"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            aria-label="Swap units"
            className="mx-auto"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>

          <div>
            <Label htmlFor="to-unit">To</Label>
            <Select
              id="to-unit"
              value={toUnit}
              onChange={setToUnit}
              options={units.map((u) => ({ value: u.value, label: u.label }))}
              className="mt-2"
            />
          </div>
        </div>

        <div className="rounded-xl bg-muted/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">Result</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {result === null ? '—' : formatNumber(result)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {amount || '0'} {units.find((u) => u.value === fromUnit)?.label} ={' '}
            {result === null ? '—' : formatNumber(result)}{' '}
            {units.find((u) => u.value === toUnit)?.label}
          </p>
        </div>
      </div>
    </div>
  )
}
