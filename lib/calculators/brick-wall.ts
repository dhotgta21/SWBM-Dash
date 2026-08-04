import type { CalculatorProduct, CalculationResult } from './types'
import { mmToM, computeWastageBreakdown, safeNumber, toTwoDecimals } from './utils'

export interface BrickWallInput {
  /** Wall length in metres. */
  length: number
  /** Wall height in metres. */
  height: number
  /** Mortar joint thickness in millimetres. */
  jointThicknessMm?: number
  /** Override default wastage percentage. */
  wastagePct?: number
}

const DEFAULT_BRICK = { lengthMm: 215, heightMm: 65, widthMm: 102.5 }
const DEFAULT_BLOCK = { lengthMm: 440, heightMm: 215, widthMm: 100 }
const DEFAULT_JOINT_MM = 10

function isBlockProduct(product: CalculatorProduct): boolean {
  if (product.category?.toLowerCase().includes('block')) return true
  if (product.name.toLowerCase().includes('block')) return true
  // If width is set and >= 100 mm and height >= 100 mm, treat as block-like.
  if (
    product.widthMm != null &&
    product.widthMm >= 100 &&
    product.heightMm != null &&
    product.heightMm >= 100
  ) {
    return true
  }
  return false
}

function getPieceDimensions(product: CalculatorProduct) {
  if (isBlockProduct(product)) {
    return {
      lengthMm: product.lengthMm ?? DEFAULT_BLOCK.lengthMm,
      heightMm: product.heightMm ?? DEFAULT_BLOCK.heightMm,
      isBlock: true,
    }
  }
  return {
    lengthMm: product.lengthMm ?? DEFAULT_BRICK.lengthMm,
    heightMm: product.heightMm ?? DEFAULT_BRICK.heightMm,
    isBlock: false,
  }
}

export function calculateBrickWall(
  product: CalculatorProduct,
  input: BrickWallInput
): CalculationResult {
  const length = safeNumber(input.length, 0)
  const height = safeNumber(input.height, 0)
  const jointMm = safeNumber(input.jointThicknessMm, DEFAULT_JOINT_MM)
  const wastagePct = safeNumber(
    input.wastagePct ?? product.wastagePct,
    product.wastagePct ?? 5
  )

  if (length <= 0 || height <= 0) {
    return {
      quantity: 0,
      rawQuantity: 0,
      wastagePct,
      wastageQuantity: 0,
      explanation: 'Enter a wall length and height to calculate the quantity.',
    }
  }

  const wallArea = length * height
  const { lengthMm, heightMm, isBlock } = getPieceDimensions(product)
  const pieceLengthM = mmToM(lengthMm + jointMm)
  const pieceHeightM = mmToM(heightMm + jointMm)
  const pieceArea = pieceLengthM * pieceHeightM
  const piecesPerM2 = 1 / pieceArea
  const rawQuantity = wallArea * piecesPerM2
  const { quantity, wastageQuantity } = computeWastageBreakdown(rawQuantity, wastagePct)

  const pieceLabel = isBlock ? 'block' : 'brick'

  return {
    quantity,
    rawQuantity: Math.ceil(rawQuantity),
    wastagePct,
    wastageQuantity,
    explanation: `Wall area ${toTwoDecimals(wallArea)} m² ÷ ${toTwoDecimals(
      pieceArea * 10000
    )} cm² per ${pieceLabel} = ${toTwoDecimals(rawQuantity)} ${pieceLabel}s with ${toTwoDecimals(
      wastagePct
    )}% wastage → ${quantity} ${pieceLabel}s.`,
  }
}
