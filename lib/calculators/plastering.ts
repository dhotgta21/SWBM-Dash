import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface PlasteringInput {
  /** Area to plaster or board in square metres. */
  areaM2: number
  /** Number of coats (for wet plaster products). */
  coats?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

const DEFAULT_PLASTER_COVERAGE_M2_PER_BAG = 10

function isBoardProduct(product: CalculatorProduct): boolean {
  const text = `${product.name} ${product.category ?? ''}`.toLowerCase()
  return text.includes('board') || text.includes('plasterboard')
}

export function calculatePlastering(
  product: CalculatorProduct,
  input: PlasteringInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
  const coats = Math.max(1, safeNumber(input.coats, 1))
  const wastagePct = safeNumber(
    input.wastagePct ?? product.wastagePct,
    product.wastagePct ?? 10
  )

  if (areaM2 <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct,
      wastageQuantity: 0,
      explanation: 'Enter the wall or ceiling area to calculate the quantity needed.',
    }
  }

  if (isBoardProduct(product)) {
    const lengthMm = product.lengthMm ?? 2400
    const widthMm = product.widthMm ?? 1200
    const sheetArea = mmToM(lengthMm) * mmToM(widthMm)
    const rawSheets = areaM2 / sheetArea
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawSheets, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawSheets),
      wastagePct,
      wastageQuantity,
      explanation: `${toTwoDecimals(areaM2)} m² ÷ ${toTwoDecimals(
        sheetArea
      )} m² per board = ${toTwoDecimals(rawSheets)} boards with ${toTwoDecimals(
        wastagePct
      )}% wastage → ${quantity} boards.`,
    }
  }

  // Wet plaster / finishing plaster: coverage per bag.
  const coveragePerBag = product.coverageM2PerUnit ?? DEFAULT_PLASTER_COVERAGE_M2_PER_BAG
  const totalArea = areaM2 * coats
  const rawBags = totalArea / coveragePerBag
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawBags, wastagePct)
  return {
    quantity,
    rawQuantity: Math.ceil(rawBags),
    wastagePct,
    wastageQuantity,
    explanation: `${toTwoDecimals(areaM2)} m² × ${coats} coat(s) ÷ ${coveragePerBag} m² per bag = ${toTwoDecimals(
      rawBags
    )} bags with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} bag(s).`,
  }
}
