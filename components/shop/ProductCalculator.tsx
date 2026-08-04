'use client'

import { useState, useMemo, useEffect, useId } from 'react'
import { Calculator, ChevronDown, Info } from 'lucide-react'
import type { PublicProduct } from '@/lib/public-products'
import { VALID_CALCULATOR_TYPES } from '@/lib/calculators/navigation'
import {
  type CalculatorType,
  type CalculationResult,
  type BrickWallInput,
  type MortarConcreteInput,
  type SheetMaterialsInput,
  type AggregatesInput,
  type ScreedInput,
  type PlasteringInput,
  type InsulationInput,
  type RoofingInput,
  type TimberInput,
  type SteelLintelInput,
  calculateBrickWall,
  calculateMortarConcrete,
  calculateSheetMaterials,
  calculateAggregates,
  calculateScreed,
  calculatePlastering,
  calculateInsulation,
  calculateRoofing,
  calculateTimber,
  calculateSteelLintel,
  toTwoDecimals,
} from '@/lib/calculators'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddToCartButton } from './AddToCartButton'

interface ProductCalculatorProps {
  product: PublicProduct
  /**
   * When provided, the calculator notifies the parent of quantity changes
   * instead of rendering its own Add to quote button.
   */
  onQuantityChange?: (quantity: number) => void
  /**
   * Render the form directly without the collapsible header. Used when the
   * calculator is displayed as a standalone tool rather than embedded in a
   * product card.
   */
  inline?: boolean
}

const MIX_OPTIONS = [
  { value: 'mortar_1_4', label: 'Mortar 1:4' },
  { value: 'screed_1_3', label: 'Screed 1:3' },
  { value: 'c15', label: 'Concrete C15' },
  { value: 'c20', label: 'Concrete C20' },
  { value: 'c25', label: 'Concrete C25' },
]

const SCREED_MIX_OPTIONS = [
  { value: '1:3', label: '1:3' },
  { value: '1:4', label: '1:4' },
]

const PITCH_OPTIONS = [
  { value: '1', label: 'Flat / low pitch' },
  { value: '1.05', label: 'Low pitch (1.05×)' },
  { value: '1.15', label: 'Medium pitch (1.15×)' },
  { value: '1.25', label: 'Steep pitch (1.25×)' },
]

function normalizeCalculatorType(value: string | null | undefined): CalculatorType | null {
  if (!value) return null
  const upper = value.toUpperCase()
  return (VALID_CALCULATOR_TYPES as readonly string[]).includes(upper)
    ? (upper as CalculatorType)
    : null
}

function parseWastage(value: string): number {
  const parsed = parseFloat(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}

function getDefaultWastagePct(type: CalculatorType): number {
  switch (type) {
    case 'BRICK_WALL':
      return 5
    case 'SHEET_MATERIALS':
      return 10
    case 'AGGREGATES':
      return 5
    case 'PLASTERING':
      return 10
    case 'INSULATION':
      return 5
    case 'ROOFING':
      return 10
    case 'TIMBER':
      return 5
    case 'MORTAR_CONCRETE':
      return 5
    case 'SCREED':
      return 5
    case 'STEEL_LINTEL':
      return 5
    default:
      return 0
  }
}

function useWastageState(product: PublicProduct, type: CalculatorType) {
  return useState(() => String(product.wastagePct ?? getDefaultWastagePct(type)))
}

export function ProductCalculator({ product, onQuantityChange, inline }: ProductCalculatorProps) {
  const calculatorType = normalizeCalculatorType(product.calculatorType)

  if (!calculatorType) return null

  if (inline) {
    return (
      <CalculatorForm
        product={product}
        calculatorType={calculatorType}
        onQuantityChange={onQuantityChange}
      />
    )
  }

  return (
    <CollapsibleProductCalculator
      product={product}
      calculatorType={calculatorType}
      onQuantityChange={onQuantityChange}
    />
  )
}

function CollapsibleProductCalculator({
  product,
  calculatorType,
  onQuantityChange,
}: {
  product: PublicProduct
  calculatorType: CalculatorType
  onQuantityChange?: (quantity: number) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Calculate how much you need</h3>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <CalculatorForm
          product={product}
          calculatorType={calculatorType}
          onQuantityChange={onQuantityChange}
        />
      )}
    </div>
  )
}

function CalculatorForm({
  product,
  calculatorType,
  onQuantityChange,
}: {
  product: PublicProduct
  calculatorType: CalculatorType
  onQuantityChange?: (quantity: number) => void
}) {
  switch (calculatorType) {
    case 'BRICK_WALL':
      return <BrickWallCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'MORTAR_CONCRETE':
      return <MortarConcreteCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'SHEET_MATERIALS':
      return <SheetMaterialsCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'AGGREGATES':
      return <AggregatesCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'SCREED':
      return <ScreedCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'PLASTERING':
      return <PlasteringCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'INSULATION':
      return <InsulationCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'ROOFING':
      return <RoofingCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'TIMBER':
      return <TimberCalculator product={product} onQuantityChange={onQuantityChange} />
    case 'STEEL_LINTEL':
      return <SteelLintelCalculator product={product} onQuantityChange={onQuantityChange} />
    default:
      return null
  }
}

function BrickWallCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [length, setLength] = useState('')
  const [height, setHeight] = useState('')
  const [joint, setJoint] = useState('10')
  const [wastage, setWastage] = useWastageState(product, 'BRICK_WALL')

  const result = useMemo(() => {
    const input: BrickWallInput = {
      length: parseFloat(length) || 0,
      height: parseFloat(height) || 0,
      jointThicknessMm: parseFloat(joint) || 10,
      wastagePct: parseWastage(wastage),
    }
    return calculateBrickWall(product, input)
  }, [length, height, joint, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label="Wall length (m)" value={length} onChange={setLength} placeholder="5" />
        <NumberField label="Wall height (m)" value={height} onChange={setHeight} placeholder="2.4" />
      </div>
      <NumberField label="Mortar joint (mm)" value={joint} onChange={setJoint} />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function MortarConcreteCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [volume, setVolume] = useState('')
  const [mix, setMix] = useState('mortar_1_4')
  const [wastage, setWastage] = useWastageState(product, 'MORTAR_CONCRETE')

  const result = useMemo(() => {
    const input: MortarConcreteInput = {
      volumeM3: parseFloat(volume) || 0,
      mix: mix as MortarConcreteInput['mix'],
      wastagePct: parseWastage(wastage),
    }
    return calculateMortarConcrete(product, input)
  }, [volume, mix, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Volume needed (m³)" value={volume} onChange={setVolume} placeholder="1.5" />
      <SelectField label="Mix type" value={mix} onChange={setMix} options={MIX_OPTIONS} />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function SheetMaterialsCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [wastage, setWastage] = useWastageState(product, 'SHEET_MATERIALS')

  const result = useMemo(() => {
    const input: SheetMaterialsInput = {
      areaM2: parseFloat(area) || 0,
      wastagePct: parseWastage(wastage),
    }
    return calculateSheetMaterials(product, input)
  }, [area, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Area to cover (m²)" value={area} onChange={setArea} placeholder="12" />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function AggregatesCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [depth, setDepth] = useState('')
  const [wastage, setWastage] = useWastageState(product, 'AGGREGATES')

  const result = useMemo(() => {
    const input: AggregatesInput = {
      areaM2: parseFloat(area) || 0,
      depthMm: parseFloat(depth) || 0,
      wastagePct: parseWastage(wastage),
    }
    return calculateAggregates(product, input)
  }, [area, depth, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Area (m²)" value={area} onChange={setArea} placeholder="20" />
      <NumberField label="Depth (mm)" value={depth} onChange={setDepth} placeholder="100" />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function ScreedCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [thickness, setThickness] = useState('')
  const [mix, setMix] = useState('1:3')
  const [wastage, setWastage] = useWastageState(product, 'SCREED')

  const result = useMemo(() => {
    const input: ScreedInput = {
      areaM2: parseFloat(area) || 0,
      thicknessMm: parseFloat(thickness) || 0,
      mix: mix as ScreedInput['mix'],
      wastagePct: parseWastage(wastage),
    }
    return calculateScreed(product, input)
  }, [area, thickness, mix, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Floor area (m²)" value={area} onChange={setArea} placeholder="15" />
      <NumberField label="Screed thickness (mm)" value={thickness} onChange={setThickness} placeholder="50" />
      <SelectField label="Mix ratio" value={mix} onChange={setMix} options={SCREED_MIX_OPTIONS} />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function PlasteringCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [coats, setCoats] = useState('1')
  const [wastage, setWastage] = useWastageState(product, 'PLASTERING')

  const result = useMemo(() => {
    const input: PlasteringInput = {
      areaM2: parseFloat(area) || 0,
      coats: parseFloat(coats) || 1,
      wastagePct: parseWastage(wastage),
    }
    return calculatePlastering(product, input)
  }, [area, coats, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Area (m²)" value={area} onChange={setArea} placeholder="25" />
      <NumberField label="Number of coats" value={coats} onChange={setCoats} />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function InsulationCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [wastage, setWastage] = useWastageState(product, 'INSULATION')

  const result = useMemo(() => {
    const input: InsulationInput = {
      areaM2: parseFloat(area) || 0,
      wastagePct: parseWastage(wastage),
    }
    return calculateInsulation(product, input)
  }, [area, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Area to insulate (m²)" value={area} onChange={setArea} placeholder="30" />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function RoofingCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [area, setArea] = useState('')
  const [pitch, setPitch] = useState('1')
  const [perimeter, setPerimeter] = useState('')
  const [wastage, setWastage] = useWastageState(product, 'ROOFING')

  const result = useMemo(() => {
    const input: RoofingInput = {
      areaM2: parseFloat(area) || 0,
      pitchFactor: parseFloat(pitch) || 1,
      perimeterM: parseFloat(perimeter) || 0,
      wastagePct: parseWastage(wastage),
    }
    return calculateRoofing(product, input)
  }, [area, pitch, perimeter, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Roof area (m²)" value={area} onChange={setArea} placeholder="40" />
      <SelectField label="Roof pitch" value={pitch} onChange={setPitch} options={PITCH_OPTIONS} />
      <NumberField label="Perimeter / run length (m)" value={perimeter} onChange={setPerimeter} placeholder="25" />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function TimberCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [length, setLength] = useState('')
  const [height, setHeight] = useState('')
  const [spacing, setSpacing] = useState('600')
  const [wastage, setWastage] = useWastageState(product, 'TIMBER')

  const result = useMemo(() => {
    const input: TimberInput = {
      length: parseFloat(length) || 0,
      height: parseFloat(height) || 0,
      studSpacingMm: parseFloat(spacing) || 600,
      wastagePct: parseWastage(wastage),
    }
    return calculateTimber(product, input)
  }, [length, height, spacing, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Wall length (m)" value={length} onChange={setLength} placeholder="5" />
      <NumberField label="Wall height (m)" value={height} onChange={setHeight} placeholder="2.4" />
      <NumberField label="Stud spacing (mm)" value={spacing} onChange={setSpacing} />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function SteelLintelCalculator({
  product,
  onQuantityChange,
}: {
  product: PublicProduct
  onQuantityChange?: (quantity: number) => void
}) {
  const [opening, setOpening] = useState('')
  const [wastage, setWastage] = useWastageState(product, 'STEEL_LINTEL')

  const result = useMemo(() => {
    const input: SteelLintelInput = {
      openingWidthMm: parseFloat(opening) || 0,
      wastagePct: parseWastage(wastage),
    }
    return calculateSteelLintel(product, input)
  }, [opening, wastage, product])

  useCalculatorQuantity(result.quantity, onQuantityChange)

  return (
    <div className="mt-3 space-y-3">
      <NumberField label="Opening width (mm)" value={opening} onChange={setOpening} placeholder="1200" />
      <WastageField value={wastage} onChange={setWastage} />
      <ResultBar result={result} />
      {!onQuantityChange && <AddButton product={product} quantity={result.quantity} />}
    </div>
  )
}

function useCalculatorQuantity(quantity: number, onQuantityChange?: (quantity: number) => void) {
  useEffect(() => {
    if (quantity > 0) {
      onQuantityChange?.(quantity)
    }
  }, [quantity, onQuantityChange])
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function WastageField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        Wastage (%)
      </Label>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24"
        />
        <span className="text-xs text-muted-foreground">Added on top of the raw quantity.</span>
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select id={id} value={value} onChange={(v) => onChange(v)} options={options} />
    </div>
  )
}

function ResultBar({ result }: { result: CalculationResult }) {
  if (result.quantity <= 0) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {result.explanation}
      </p>
    )
  }

  const rawWidth = result.quantity > 0 ? (result.rawQuantity / result.quantity) * 100 : 0
  const wastageWidth = result.quantity > 0 ? (result.wastageQuantity / result.quantity) * 100 : 0

  return (
    <div className="rounded-md bg-background p-3 space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold text-foreground">{toTwoDecimals(result.quantity)}</span>
          <span className="text-sm text-muted-foreground mb-1">required</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">Total: {toTwoDecimals(result.quantity)}</span>
      </div>

      {(result.rawQuantity > 0 || result.wastageQuantity > 0) && (
        <div className="space-y-2">
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-primary" style={{ width: `${Math.max(0, Math.min(100, rawWidth))}%` }} />
            <div className="bg-orange-400" style={{ width: `${Math.max(0, Math.min(100, wastageWidth))}%` }} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <div>
              <span className="block text-xs text-muted-foreground">Raw material</span>
              <span className="font-medium text-foreground">{toTwoDecimals(result.rawQuantity)}</span>
            </div>
            <div className="text-right">
              <span className="block text-xs text-muted-foreground">Wastage</span>
              <span className="font-medium text-foreground">
                {toTwoDecimals(result.wastageQuantity)} ({result.wastagePct}%)
              </span>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{result.explanation}</p>
    </div>
  )
}

function AddButton({ product, quantity }: { product: PublicProduct; quantity: number }) {
  if (quantity <= 0) return null

  return (
    <AddToCartButton
      productId={product.id}
      code={product.code}
      name={product.name}
      unit={product.unit}
      price={product.priceFrom}
      quantity={quantity}
    />
  )
}
