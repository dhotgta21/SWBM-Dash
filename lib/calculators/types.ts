export type CalculatorType =
  | 'BRICK_WALL'
  | 'MORTAR_CONCRETE'
  | 'SHEET_MATERIALS'
  | 'AGGREGATES'
  | 'SCREED'
  | 'PLASTERING'
  | 'INSULATION'
  | 'ROOFING'
  | 'TIMBER'
  | 'STEEL_LINTEL'

export interface CalculatorProduct {
  id: string
  code: string
  name: string
  unit: string
  category: string | null
  lengthMm: number | null
  widthMm: number | null
  heightMm: number | null
  thicknessMm: number | null
  coverageM2PerUnit: number | null
  coverageLinearMPerUnit: number | null
  unitWeightKg: number | null
  packSize: number | null
  wastagePct: number | null
  calculatorType: string | null
}

export interface CalculationResult {
  /** Primary quantity for the current product, already rounded up with wastage. */
  quantity: number
  /** Quantity before wastage is applied. */
  rawQuantity: number
  /** Wastage percentage used. */
  wastagePct: number
  /** Additional units added for wastage (quantity - rawQuantity). */
  wastageQuantity: number
  /** Human-readable breakdown of the calculation. */
  explanation: string
  /**
   * Optional related materials that the job also needs.
   * These are not added to the cart automatically in Phase 1 but can be
   * surfaced as suggestions.
   */
  relatedItems?: Array<{
    code: string
    name: string
    unit: string
    quantity: number
    explanation: string
  }>
}

export type MaterialKind = 'cement' | 'sand' | 'aggregate' | 'unknown'

export type ConcreteMix = 'mortar_1_4' | 'c15' | 'c20' | 'c25' | 'screed_1_3'
