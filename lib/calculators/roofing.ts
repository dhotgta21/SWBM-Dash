import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface RoofingInput {
  /** Roof plan area in square metres. */
  areaM2: number
  /** Roof pitch factor (1.0 = flat, 1.05 = low, 1.15 = medium, 1.25 = steep). */
  pitchFactor?: number
  /** Perimeter or gutter/run length in metres. */
  perimeterM?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

function isLinearProduct(product: CalculatorProduct): boolean {
  const text = `${product.name} ${product.category ?? ''}`.toLowerCase()
  return (
    text.includes('gutter') ||
    text.includes('fascia') ||
    text.includes('trim') ||
    text.includes('dpc') ||
    text.includes('dpm')
  )
}

function isLiquidProduct(product: CalculatorProduct): boolean {
  const text = `${product.name} ${product.category ?? ''}`.toLowerCase()
  return text.includes('resin') || text.includes('top coat') || text.includes('acetone')
}

export function calculateRoofing(
  product: CalculatorProduct,
  input: RoofingInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
  const pitchFactor = safeNumber(input.pitchFactor, 1)
  const perimeterM = safeNumber(input.perimeterM, 0)
  const wastagePct = safeNumber(
    input.wastagePct ?? product.wastagePct,
    product.wastagePct ?? 10
  )

  if (areaM2 <= 0 && perimeterM <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct,
      wastageQuantity: 0,
      explanation: 'Enter the roof area or perimeter to calculate quantities.',
    }
  }

  const adjustedArea = areaM2 * pitchFactor

  if (isLinearProduct(product)) {
    if (perimeterM <= 0) {
      return {
        quantity: 0,
        rawQuantity: 0,
        wastagePct,
        wastageQuantity: 0,
        explanation: 'Enter the perimeter or run length in metres for this product.',
      }
    }
    const coverageM = product.coverageLinearMPerUnit ?? (product.lengthMm ? mmToM(product.lengthMm) : 3)
    const rawQuantity = perimeterM / coverageM
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawQuantity, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawQuantity),
      wastagePct,
      wastageQuantity,
      explanation: `${toTwoDecimals(perimeterM)} m run ÷ ${toTwoDecimals(
        coverageM
      )} m per unit = ${toTwoDecimals(rawQuantity)} units with ${toTwoDecimals(
        wastagePct
      )}% wastage → ${quantity} unit(s).`,
    }
  }

  if (isLiquidProduct(product)) {
    const coverageM2PerL = product.coverageM2PerUnit ?? 2
    const rawLitres = adjustedArea / coverageM2PerL
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawLitres, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawLitres),
      wastagePct,
      wastageQuantity,
      explanation: `${toTwoDecimals(areaM2)} m² × ${pitchFactor} pitch factor ÷ ${coverageM2PerL} m²/litre = ${toTwoDecimals(
        rawLitres
      )} litres with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} litre(s).`,
    }
  }

  // Roll products (felt, matting) default to 10 m² per roll if no coverage set.
  const coverageM2 =
    product.coverageM2PerUnit ??
    (product.lengthMm && product.widthMm
      ? mmToM(product.lengthMm) * mmToM(product.widthMm)
      : 10)
  const rawRolls = adjustedArea / coverageM2
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawRolls, wastagePct)
  return {
    quantity,
    rawQuantity: Math.ceil(rawRolls),
    wastagePct,
    wastageQuantity,
    explanation: `${toTwoDecimals(areaM2)} m² × ${pitchFactor} pitch factor ÷ ${toTwoDecimals(
      coverageM2
    )} m² per roll = ${toTwoDecimals(rawRolls)} rolls with ${toTwoDecimals(
      wastagePct
    )}% wastage → ${quantity} roll(s).`,
  }
}
