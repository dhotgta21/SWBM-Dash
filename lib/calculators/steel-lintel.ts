import type { CalculatorProduct, CalculationResult } from './types'
import { computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface SteelLintelInput {
  /** Opening width in millimetres. */
  openingWidthMm: number
  /** Cavity or wall thickness in millimetres. */
  wallThicknessMm?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

const DEFAULT_BEARING_MM = 150

function isConcreteLintel(product: CalculatorProduct): boolean {
  return product.name.toLowerCase().includes('concrete')
}

export function calculateSteelLintel(
  product: CalculatorProduct,
  input: SteelLintelInput
): CalculationResult {
  const openingMm = safeNumber(input.openingWidthMm, 0)
  const wastagePct = safeNumber(input.wastagePct ?? product.wastagePct, 0)
  const bearingMm = isConcreteLintel(product) ? 100 : DEFAULT_BEARING_MM

  if (openingMm <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct: 0,
      wastageQuantity: 0,
      explanation: 'Enter the opening width in millimetres to select a lintel length.',
    }
  }

  const lintelLengthMm = openingMm + bearingMm * 2
  const lintelLengthM = lintelLengthMm / 1000
  const lintelLengthForCount = product.lengthMm ?? lintelLengthMm
  const rawLintels = lintelLengthMm / lintelLengthForCount
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawLintels, wastagePct)

  return {
    quantity,
    rawQuantity: Math.ceil(rawLintels),
    wastagePct,
    wastageQuantity,
    explanation: `Opening ${openingMm} mm + ${bearingMm} mm bearing each end = ${lintelLengthMm} mm (${toTwoDecimals(
      lintelLengthM
    )} m) lintel required. ${toTwoDecimals(rawLintels)} lintel(s) with ${toTwoDecimals(
      wastagePct
    )}% wastage → ${quantity} lintel(s).`,
  }
}
