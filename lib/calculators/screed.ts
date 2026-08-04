import type { CalculatorProduct, CalculationResult } from './types'
import { DENSITY, DRY_VOLUME_FACTOR, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface ScreedInput {
  /** Floor area in square metres. */
  areaM2: number
  /** Screed thickness in millimetres. */
  thicknessMm: number
  /** Mix ratio by volume. */
  mix?: '1:3' | '1:4'
  /** Override default wastage percentage. */
  wastagePct?: number
}

function detectMaterialKind(product: CalculatorProduct): 'cement' | 'sand' | 'unknown' {
  const name = product.name.toLowerCase()
  if (name.includes('cement')) return 'cement'
  if (name.includes('sand')) return 'sand'
  return 'unknown'
}

export function calculateScreed(
  product: CalculatorProduct,
  input: ScreedInput
): CalculationResult {
  const areaM2 = safeNumber(input.areaM2, 0)
  const thicknessMm = safeNumber(input.thicknessMm, 0)
  const mix = input.mix ?? '1:3'
  const wastagePct = safeNumber(input.wastagePct ?? product.wastagePct, 0)
  const kind = detectMaterialKind(product)

  if (areaM2 <= 0 || thicknessMm <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct: 0,
      wastageQuantity: 0,
      explanation: 'Enter the floor area and screed thickness to calculate quantities.',
    }
  }

  if (kind === 'unknown') {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct: 0,
      wastageQuantity: 0,
      explanation: 'This calculator only works for cement or sand products.',
    }
  }

  const wetVolumeM3 = areaM2 * (thicknessMm / 1000)
  const dryVolumeM3 = wetVolumeM3 * DRY_VOLUME_FACTOR
  const [cementPart, sandPart] = mix.split(':').map((n) => parseInt(n, 10))
  const totalParts = cementPart + sandPart

  let kg = 0
  if (kind === 'cement') {
    kg = (cementPart / totalParts) * dryVolumeM3 * DENSITY.cement
  } else {
    kg = (sandPart / totalParts) * dryVolumeM3 * DENSITY.sand
  }

  if (kind === 'cement') {
    const bagSizeKg = product.unitWeightKg ?? 25
    const rawBags = kg / bagSizeKg
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawBags, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawBags),
      wastagePct,
      wastageQuantity,
      explanation: `${toTwoDecimals(areaM2)} m² × ${thicknessMm} mm screed (${mix}) needs ${toTwoDecimals(
        kg
      )} kg of cement → ${quantity} × ${bagSizeKg} kg bag(s) (${toTwoDecimals(
        wastagePct
      )}% wastage).`,
    }
  }

  const tonnes = kg / 1000
  const { quantity, wastageQuantity } = computeWastageBreakdown(tonnes, wastagePct)
  return {
    quantity,
    rawQuantity: Math.ceil(tonnes),
    wastagePct,
    wastageQuantity,
    explanation: `${toTwoDecimals(areaM2)} m² × ${thicknessMm} mm screed (${mix}) needs ${toTwoDecimals(
      kg
    )} kg of sand → ${quantity} tonne(s) (${toTwoDecimals(wastagePct)}% wastage).`,
  }
}
