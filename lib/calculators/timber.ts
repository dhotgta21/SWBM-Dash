import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface TimberInput {
  /** Wall length in metres. */
  length: number
  /** Wall height in metres. */
  height: number
  /** Stud spacing in millimetres. */
  studSpacingMm?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

const DEFAULT_STUD_SPACING_MM = 600
const DEFAULT_TIMBER_LENGTH_M = 4.8

function isBatten(product: CalculatorProduct): boolean {
  return product.name.toLowerCase().includes('batten')
}

export function calculateTimber(
  product: CalculatorProduct,
  input: TimberInput
): CalculationResult {
  const wallLength = safeNumber(input.length, 0)
  const wallHeight = safeNumber(input.height, 0)
  const studSpacingM = mmToM(safeNumber(input.studSpacingMm, DEFAULT_STUD_SPACING_MM))
  const wastagePct = safeNumber(input.wastagePct ?? product.wastagePct, 0)

  if (wallLength <= 0 || wallHeight <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct: 0,
      wastageQuantity: 0,
      explanation: 'Enter the wall length and height to calculate timber quantities.',
    }
  }

  if (isBatten(product)) {
    // Battens run horizontally; estimate one row per metre of wall height.
    const rows = Math.ceil(wallHeight)
    const totalLengthM = rows * wallLength
    const pieceLengthM = product.lengthMm && product.lengthMm > 0 ? mmToM(product.lengthMm) : DEFAULT_TIMBER_LENGTH_M
    const rawPieces = totalLengthM / pieceLengthM
    const { quantity, wastageQuantity } = computeWastageBreakdown(rawPieces, wastagePct)
    return {
      quantity,
      rawQuantity: Math.ceil(rawPieces),
      wastagePct,
      wastageQuantity,
      explanation: `${rows} rows of battens across ${toTwoDecimals(
        wallLength
      )} m = ${toTwoDecimals(totalLengthM)} m total ÷ ${pieceLengthM} m per piece = ${toTwoDecimals(
        rawPieces
      )} pieces with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} piece(s).`,
    }
  }

  // Studwork: studs + top and bottom plates.
  const studCount = Math.ceil(wallLength / studSpacingM) + 1
  const studsLengthM = studCount * wallHeight
  const platesLengthM = wallLength * 2
  const totalLengthM = studsLengthM + platesLengthM
  const pieceLengthM = product.lengthMm && product.lengthMm > 0 ? mmToM(product.lengthMm) : DEFAULT_TIMBER_LENGTH_M
  const rawPieces = totalLengthM / pieceLengthM
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawPieces, wastagePct)

  return {
    quantity,
    rawQuantity: Math.ceil(rawPieces),
    wastagePct,
    wastageQuantity,
    explanation: `${studCount} studs (${toTwoDecimals(
      studsLengthM
    )} m) + top/bottom plates (${toTwoDecimals(
      platesLengthM
    )} m) = ${toTwoDecimals(totalLengthM)} m total ÷ ${pieceLengthM} m per piece = ${toTwoDecimals(
      rawPieces
    )} pieces with ${toTwoDecimals(wastagePct)}% wastage → ${quantity} piece(s).`,
  }
}
