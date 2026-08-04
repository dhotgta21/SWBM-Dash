import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface SheetMaterialsInput {
  /** Area to cover in square metres. */
  areaM2: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

const DEFAULT_SHEET = { lengthMm: 2440, widthMm: 1220 }

function getSheetDimensions(product: CalculatorProduct) {
  return {
    lengthMm: product.lengthMm ?? DEFAULT_SHEET.lengthMm,
    widthMm: product.widthMm ?? DEFAULT_SHEET.widthMm,
  }
}

export function calculateSheetMaterials(
  product: CalculatorProduct,
  input: SheetMaterialsInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
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
      explanation: 'Enter the area you need to cover in square metres.',
    }
  }

  const { lengthMm, widthMm } = getSheetDimensions(product)
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
    )} m² per sheet = ${toTwoDecimals(rawSheets)} sheets with ${toTwoDecimals(
      wastagePct
    )}% wastage → ${quantity} sheets.`,
  }
}
