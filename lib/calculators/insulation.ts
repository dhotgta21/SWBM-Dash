import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface InsulationInput {
  /** Area to insulate in square metres. */
  areaM2: number
  /** Joist or stud spacing in millimetres (used for roll products). */
  spacingMm?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

function isRollProduct(product: CalculatorProduct): boolean {
  const text = `${product.name} ${product.category ?? ''}`.toLowerCase()
  return text.includes('roll') || text.includes('slab')
}

export function calculateInsulation(
  product: CalculatorProduct,
  input: InsulationInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
  const wastagePct = safeNumber(
    input.wastagePct ?? product.wastagePct,
    product.wastagePct ?? 5
  )

  if (areaM2 <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct,
      wastageQuantity: 0,
      explanation: 'Enter the area you need to insulate in square metres.',
    }
  }

  if (isRollProduct(product)) {
    // Roll/slab coverage per unit takes priority.
    if (product.coverageM2PerUnit != null && product.coverageM2PerUnit > 0) {
      const rawRolls = areaM2 / product.coverageM2PerUnit
      const { quantity, wastageQuantity } = computeWastageBreakdown(rawRolls, wastagePct)
      return {
        quantity,
        rawQuantity: Math.ceil(rawRolls),
        wastagePct,
        wastageQuantity,
        explanation: `${toTwoDecimals(areaM2)} m² ÷ ${toTwoDecimals(
          product.coverageM2PerUnit
        )} m² per roll = ${toTwoDecimals(rawRolls)} rolls with ${toTwoDecimals(
          wastagePct
        )}% wastage → ${quantity} roll(s).`,
      }
    }

    // Otherwise derive from width and a standard 6 m roll length.
    const widthM = mmToM(product.widthMm ?? 400)
    const rollLengthM = product.lengthMm ? mmToM(product.lengthMm) : 6
    const coveragePerRoll = widthM * rollLengthM
    const rawRolls = areaM2 / coveragePerRoll
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawRolls, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawRolls),
      wastagePct,
      wastageQuantity,
      explanation: `${toTwoDecimals(areaM2)} m² ÷ ${toTwoDecimals(
        coveragePerRoll
      )} m² per roll (${widthM} m × ${rollLengthM} m) = ${toTwoDecimals(
        rawRolls
      )} rolls with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} roll(s).`,
    }
  }

  // Board products.
  const lengthMm = product.lengthMm ?? 1200
  const widthMm = product.widthMm ?? 600
  const boardArea = mmToM(lengthMm) * mmToM(widthMm)
  const rawBoards = areaM2 / boardArea
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawBoards, wastagePct)
  return {
    quantity,
    rawQuantity: Math.ceil(rawBoards),
    wastagePct,
    wastageQuantity,
    explanation: `${toTwoDecimals(areaM2)} m² ÷ ${toTwoDecimals(
      boardArea
    )} m² per board = ${toTwoDecimals(rawBoards)} boards with ${toTwoDecimals(
      wastagePct
    )}% wastage → ${quantity} board(s).`,
  }
}
