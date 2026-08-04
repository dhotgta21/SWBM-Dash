export function mmToM(mm: number): number {
  return mm / 1000
}

export function roundUp(value: number): number {
  return Math.max(0, Math.ceil(value))
}

export function roundUpToDecimals(value: number, decimals: number): number {
  if (!Number.isFinite(decimals) || decimals < 0) return roundUp(value)
  const factor = Math.pow(10, decimals)
  return Math.max(0, Math.ceil(value * factor) / factor)
}

export function applyWastage(quantity: number, wastagePct: number): number {
  if (!Number.isFinite(wastagePct) || wastagePct <= 0) return quantity
  return quantity * (1 + wastagePct / 100)
}

export function roundUpWithWastage(quantity: number, wastagePct: number): number {
  return roundUp(applyWastage(quantity, wastagePct))
}

export interface WastageBreakdown {
  rawQuantity: number
  quantity: number
  wastageQuantity: number
}

export function computeWastageBreakdown(rawQuantity: number, wastagePct: number): WastageBreakdown {
  const quantity = roundUpWithWastage(rawQuantity, wastagePct)
  return {
    rawQuantity: roundUp(rawQuantity),
    quantity,
    wastageQuantity: Math.max(0, quantity - roundUp(rawQuantity)),
  }
}

export function safeNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function toOneDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

export function toTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100
}

/** Density constants used across calculators (kg/m³). */
export const DENSITY = {
  cement: 1440,
  sand: 1600,
  aggregate: 1500,
  ballast: 1600,
  mortar: 2100,
} as const

/** Standard concrete mix ratios by dry volume. */
export function getMixRatios(mix: 'mortar_1_4' | 'c15' | 'c20' | 'c25' | 'screed_1_3'): {
  cement: number
  sand: number
  aggregate: number
} {
  switch (mix) {
    case 'mortar_1_4':
      return { cement: 1, sand: 4, aggregate: 0 }
    case 'screed_1_3':
      return { cement: 1, sand: 3, aggregate: 0 }
    case 'c15':
      return { cement: 1, sand: 2, aggregate: 4 }
    case 'c20':
      return { cement: 1, sand: 1.5, aggregate: 3 }
    case 'c25':
      return { cement: 1, sand: 1, aggregate: 2 }
    default:
      return { cement: 1, sand: 4, aggregate: 0 }
  }
}

/** Dry volume factor: wet concrete volume is ~35 % smaller than dry ingredients. */
export const DRY_VOLUME_FACTOR = 1.54
