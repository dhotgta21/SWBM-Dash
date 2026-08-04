import type { CalculatorProduct, CalculationResult } from './types'
import { applyWastage, roundUpToDecimals, safeNumber, toTwoDecimals } from './utils'

export interface AggregatesInput {
  /** Area to cover in square metres. */
  areaM2: number
  /** Required depth in millimetres. */
  depthMm: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

/** Default material densities in kg/m³. */
const DEFAULT_DENSITY_KG_M3: Record<string, number> = {
  'mot type 1': 2000,
  'motone': 2000,
  'shingle': 1700,
  'ballast': 1750,
  'sand': 1600,
}

function detectDensity(product: CalculatorProduct): number {
  const text = `${product.name} ${product.category ?? ''}`.toLowerCase()
  for (const [keyword, density] of Object.entries(DEFAULT_DENSITY_KG_M3)) {
    if (text.includes(keyword)) return density
  }
  return 1600
}

export function calculateAggregates(
  product: CalculatorProduct,
  input: AggregatesInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
  const depthMm = safeNumber(input.depthMm, 0)
  const wastagePct = safeNumber(
    input.wastagePct ?? product.wastagePct,
    product.wastagePct ?? 5
  )

  if (areaM2 <= 0 || depthMm <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct,
      wastageQuantity: 0,
      explanation: 'Enter the area and depth to calculate the weight required.',
    }
  }

  const volumeM3 = areaM2 * (depthMm / 1000)
  const density = detectDensity(product)
  const weightKg = volumeM3 * density

  const unit = product.unit.toUpperCase()
  let rawValue: number
  let explanation: string

  if (unit === 'KG') {
    rawValue = weightKg
    explanation = `${toTwoDecimals(areaM2)} m² × ${depthMm} mm = ${toTwoDecimals(
      volumeM3
    )} m³ × ${density} kg/m³ = ${toTwoDecimals(weightKg)} kg`
  } else {
    // Default to tonnes for TON, EA, BAG, etc.
    rawValue = weightKg / 1000
    explanation = `${toTwoDecimals(areaM2)} m² × ${depthMm} mm = ${toTwoDecimals(
      volumeM3
    )} m³ × ${density} kg/m³ = ${toTwoDecimals(rawValue)} tonnes`
  }

  const isWeightKg = unit === 'KG'
  const rawQuantity = isWeightKg ? Math.ceil(rawValue) : roundUpToDecimals(rawValue, 2)
  const quantity = isWeightKg
    ? Math.ceil(applyWastage(rawValue, wastagePct))
    : roundUpToDecimals(applyWastage(rawValue, wastagePct), 2)
  const wastageQuantity = Math.max(0, quantity - rawQuantity)
  const unitLabel = isWeightKg ? 'kg' : 'tonne(s)'

  return {
    quantity,
    rawQuantity,
    wastagePct,
    wastageQuantity,
    explanation: `${explanation} with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} ${unitLabel}.`,
  }
}
