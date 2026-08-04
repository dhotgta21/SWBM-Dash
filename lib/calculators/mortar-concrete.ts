import type { CalculatorProduct, CalculationResult, MaterialKind, ConcreteMix } from './types'
import { DENSITY, DRY_VOLUME_FACTOR, getMixRatios, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface MortarConcreteInput {
  /** Volume of concrete/mortar needed in cubic metres. */
  volumeM3: number
  /** Concrete or mortar mix type. */
  mix?: ConcreteMix
  /** Override default wastage percentage. */
  wastagePct?: number
}

function detectMaterialKind(product: CalculatorProduct): MaterialKind {
  const name = product.name.toLowerCase()
  const category = (product.category ?? '').toLowerCase()

  // Check the product name first so "Building Sand" and "Ballast Aggregate"
  // are not misclassified as cement just because they sit in the
  // "Aggregates & Cement" category.
  if (name.includes('cement')) return 'cement'
  if (name.includes('sand')) return 'sand'
  if (
    name.includes('aggregate') ||
    name.includes('shingle') ||
    name.includes('ballast') ||
    name.includes('mot')
  ) {
    return 'aggregate'
  }

  // Fall back to category only when the name is ambiguous.
  if (category.includes('cement') && name.includes('cement')) return 'cement'
  if (category.includes('sand')) return 'sand'

  return 'unknown'
}

export function calculateMortarConcrete(
  product: CalculatorProduct,
  input: MortarConcreteInput
): CalculationResult {
  const volumeM3 = safeNumber(input.volumeM3, 0)
  const mix = input.mix ?? 'mortar_1_4'
  const wastagePct = safeNumber(input.wastagePct ?? product.wastagePct, 0)
  const kind = detectMaterialKind(product)

  if (volumeM3 <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct: 0,
      wastageQuantity: 0,
      explanation: 'Enter the volume of concrete or mortar required in cubic metres.',
    }
  }

  const ratios = getMixRatios(mix)
  const totalParts = ratios.cement + ratios.sand + ratios.aggregate
  const dryVolume = volumeM3 * DRY_VOLUME_FACTOR

  let kg = 0
  let label = ''
  let unit = product.unit

  switch (kind) {
    case 'cement': {
      kg = (ratios.cement / totalParts) * dryVolume * DENSITY.cement
      label = 'cement'
      unit = 'BAG'
      break
    }
    case 'sand': {
      kg = (ratios.sand / totalParts) * dryVolume * DENSITY.sand
      label = 'sand'
      unit = 'TON'
      break
    }
    case 'aggregate': {
      kg = (ratios.aggregate / totalParts) * dryVolume * DENSITY.aggregate
      label = 'aggregate'
      unit = 'TON'
      break
    }
    default: {
      return {
        quantity: 0,
        rawQuantity: 0,
        wastagePct: 0,
        wastageQuantity: 0,
        explanation: 'Could not determine whether this product is cement, sand or aggregate. Check the product name or category.',
      }
    }
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
      explanation: `${toTwoDecimals(volumeM3)} m³ ${mix} mix needs ${toTwoDecimals(
        kg
      )} kg of ${label} → ${quantity} × ${bagSizeKg} kg ${unit.toLowerCase()}(s) (${toTwoDecimals(
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
    explanation: `${toTwoDecimals(volumeM3)} m³ ${mix} mix needs ${toTwoDecimals(
      kg
    )} kg of ${label} → ${quantity} ${unit.toLowerCase()}(s) (${toTwoDecimals(
      wastagePct
    )}% wastage).`,
  }
}
