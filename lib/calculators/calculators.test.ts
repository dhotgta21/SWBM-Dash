import { describe, it, expect } from 'vitest'
import {
  calculateBrickWall,
  calculateMortarConcrete,
  calculateSheetMaterials,
  calculateAggregates,
  calculateScreed,
  calculatePlastering,
  calculateInsulation,
  calculateRoofing,
  calculateTimber,
  calculateSteelLintel,
} from './index'
import type { CalculatorProduct } from './types'

function makeProduct(overrides: Partial<CalculatorProduct> = {}): CalculatorProduct {
  return {
    id: 'test-id',
    code: 'TEST-001',
    name: 'Test Product',
    unit: 'EA',
    category: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    thicknessMm: null,
    coverageM2PerUnit: null,
    coverageLinearMPerUnit: null,
    unitWeightKg: null,
    packSize: null,
    wastagePct: null,
    calculatorType: null,
    ...overrides,
  }
}

describe('calculateBrickWall', () => {
  it('calculates standard bricks for a single-skin wall', () => {
    const product = makeProduct({
      name: 'Standard Brick',
      category: 'Bricks',
      lengthMm: 215,
      heightMm: 65,
      widthMm: 102.5,
      wastagePct: 0,
    })
    const result = calculateBrickWall(product, { length: 5, height: 2.4, jointThicknessMm: 10, wastagePct: 0 })
    // 12 m² / ((225mm * 75mm) / 1e6) = 12 / 0.016875 ≈ 711.11 → 712
    expect(result.quantity).toBe(712)
    expect(result.explanation).toContain('712')
  })

  it('applies wastage and rounds up', () => {
    const product = makeProduct({
      name: 'Standard Brick',
      category: 'Bricks',
      lengthMm: 215,
      heightMm: 65,
      widthMm: 102.5,
      wastagePct: 10,
    })
    const result = calculateBrickWall(product, { length: 1, height: 1 })
    // ~59.26 + 10% = 65.18 → 66
    expect(result.quantity).toBe(66)
  })

  it('detects blocks from category and uses block dimensions', () => {
    const product = makeProduct({
      name: 'Dense Block',
      category: 'Blocks',
      lengthMm: 440,
      heightMm: 215,
      widthMm: 100,
      wastagePct: 0,
    })
    const result = calculateBrickWall(product, { length: 10, height: 2.7, jointThicknessMm: 10, wastagePct: 0 })
    // 27 m² / ((450mm * 225mm) / 1e6) = 27 / 0.10125 ≈ 266.7 → 267
    expect(result.quantity).toBe(267)
  })

  it('returns zero for missing dimensions', () => {
    const product = makeProduct({ name: 'Brick', category: 'Bricks' })
    const result = calculateBrickWall(product, { length: 0, height: 0 })
    expect(result.quantity).toBe(0)
  })
})

describe('calculateSheetMaterials', () => {
  it('calculates 8x4 sheets without wastage', () => {
    const product = makeProduct({
      name: 'OSB3 8x4',
      category: 'Sheet Materials',
      lengthMm: 2440,
      widthMm: 1220,
      wastagePct: 0,
    })
    const result = calculateSheetMaterials(product, { areaM2: 12, wastagePct: 0 })
    // 12 / (2.44 * 1.22) = 12 / 2.9768 ≈ 4.03 → 5
    expect(result.quantity).toBe(5)
  })

  it('applies default 10% wastage', () => {
    const product = makeProduct({
      name: 'Plywood',
      category: 'Sheet Materials',
      lengthMm: 2440,
      widthMm: 1220,
    })
    const result = calculateSheetMaterials(product, { areaM2: 10 })
    // 10 / 2.9768 = 3.36; +10% = 3.69 → 4
    expect(result.quantity).toBe(4)
  })

  it('returns zero when area is not entered', () => {
    const product = makeProduct({ name: 'Plywood', category: 'Sheet Materials' })
    const result = calculateSheetMaterials(product, { areaM2: 0 })
    expect(result.quantity).toBe(0)
  })
})

describe('calculateMortarConcrete', () => {
  it('calculates cement bags for mortar', () => {
    const product = makeProduct({
      name: 'General Purpose Cement',
      category: 'Aggregates & Cement',
      unitWeightKg: 25,
      unit: 'BAG',
    })
    const result = calculateMortarConcrete(product, { volumeM3: 1, mix: 'mortar_1_4' })
    // dry vol = 1.54; cement = 1/5 * 1.54 * 1440 = 443.5 kg; /25 = 17.74 → 18
    expect(result.quantity).toBe(18)
    expect(result.explanation).toContain('18')
  })

  it('calculates sand tonnes for concrete C20', () => {
    const product = makeProduct({
      name: 'Building Sand',
      category: 'Aggregates & Cement',
      unit: 'TON',
    })
    const result = calculateMortarConcrete(product, { volumeM3: 2, mix: 'c20' })
    // dry vol = 3.08; sand = 1.5/5.5 * 3.08 * 1600 = 1344 kg; /1000 = 1.344 → 2
    expect(result.quantity).toBe(2)
  })

  it('calculates aggregate tonnes', () => {
    const product = makeProduct({
      name: '20mm Ballast Aggregate',
      category: 'Aggregates & Cement',
      unit: 'TON',
    })
    const result = calculateMortarConcrete(product, { volumeM3: 1, mix: 'c20' })
    // aggregate = 3/5.5 * 1.54 * 1500 = 1260 kg; /1000 = 1.26 → 2
    expect(result.quantity).toBe(2)
  })

  it('returns zero for missing volume', () => {
    const product = makeProduct({ name: 'Cement', category: 'Aggregates & Cement' })
    const result = calculateMortarConcrete(product, { volumeM3: 0 })
    expect(result.quantity).toBe(0)
  })

  it('returns zero when material kind cannot be detected', () => {
    const product = makeProduct({ name: 'Mystery Product', category: 'Tools' })
    const result = calculateMortarConcrete(product, { volumeM3: 1 })
    expect(result.quantity).toBe(0)
  })

  it('applies wastage to cement bags', () => {
    const product = makeProduct({
      name: 'General Purpose Cement',
      category: 'Aggregates & Cement',
      unitWeightKg: 25,
      unit: 'BAG',
    })
    const result = calculateMortarConcrete(product, { volumeM3: 1, mix: 'mortar_1_4', wastagePct: 10 })
    // raw bags = 17.74 → 18; +10% = 19.8 → 20
    expect(result.quantity).toBe(20)
  })
})

describe('calculateAggregates', () => {
  it('calculates MOT Type 1 in tonnes', () => {
    const product = makeProduct({
      name: 'MOT Type 1 Aggregate',
      category: 'Aggregates & Cement',
      unit: 'TON',
    })
    const result = calculateAggregates(product, { areaM2: 20, depthMm: 100, wastagePct: 0 })
    // volume = 2 m³; weight = 2 * 2000 = 4000 kg = 4 tonnes
    expect(result.quantity).toBe(4)
  })

  it('returns zero when area or depth is missing', () => {
    const product = makeProduct({ name: 'Shingle', category: 'Aggregates & Cement' })
    const result = calculateAggregates(product, { areaM2: 0, depthMm: 0 })
    expect(result.quantity).toBe(0)
  })

  it('calculates bagged aggregate in whole kilograms', () => {
    const product = makeProduct({
      name: 'MOT Type 1 Aggregate',
      category: 'Aggregates & Cement',
      unit: 'KG',
    })
    const result = calculateAggregates(product, { areaM2: 10, depthMm: 100, wastagePct: 0 })
    // volume = 1 m³; weight = 1 * 2000 = 2000 kg
    expect(result.quantity).toBe(2000)
    expect(result.rawQuantity).toBe(2000)
  })

  it('rounds tonnes to two decimals instead of whole tonnes', () => {
    const product = makeProduct({
      name: 'MOT Type 1 Aggregate',
      category: 'Aggregates & Cement',
      unit: 'TON',
    })
    const result = calculateAggregates(product, { areaM2: 10, depthMm: 50, wastagePct: 5 })
    // volume = 0.5 m³; weight = 1000 kg = 1 tonne; +5% = 1.05 tonnes
    expect(result.quantity).toBe(1.05)
    expect(result.rawQuantity).toBe(1)
  })
})

describe('calculateScreed', () => {
  it('calculates cement bags for 1:3 screed', () => {
    const product = makeProduct({
      name: 'General Purpose Cement',
      category: 'Aggregates & Cement',
      unitWeightKg: 25,
      unit: 'BAG',
    })
    const result = calculateScreed(product, { areaM2: 10, thicknessMm: 50, mix: '1:3' })
    // wet volume = 0.5 m³; dry volume = 0.77 m³; cement = 1/4 * 0.77 * 1440 = 277 kg; /25 = 11.1 → 12
    expect(result.quantity).toBe(12)
  })

  it('calculates sand tonnes for 1:4 screed', () => {
    const product = makeProduct({
      name: 'Building Sand',
      category: 'Aggregates & Cement',
      unit: 'TON',
    })
    const result = calculateScreed(product, { areaM2: 20, thicknessMm: 50, mix: '1:4' })
    // volume = 1 m³; sand = 4/5 * 1 * 1600 = 1280 kg = 1.28 tonnes → 2
    expect(result.quantity).toBe(2)
  })

  it('applies wastage to screed cement', () => {
    const product = makeProduct({
      name: 'General Purpose Cement',
      category: 'Aggregates & Cement',
      unitWeightKg: 25,
      unit: 'BAG',
    })
    const result = calculateScreed(product, { areaM2: 10, thicknessMm: 50, mix: '1:3', wastagePct: 10 })
    // raw bags = 11.1; +10% = 12.2 → 13
    expect(result.quantity).toBe(13)
  })
})

describe('calculatePlastering', () => {
  it('calculates plasterboard sheets', () => {
    const product = makeProduct({
      name: 'Standard Plasterboard',
      category: 'Plasterboard',
      lengthMm: 2400,
      widthMm: 1200,
      unit: 'SHEET',
    })
    const result = calculatePlastering(product, { areaM2: 24, wastagePct: 0 })
    // 24 / (2.4 * 1.2) = 8.33 → 9
    expect(result.quantity).toBe(9)
  })

  it('calculates plaster bags by coverage', () => {
    const product = makeProduct({
      name: 'MultiFinish Plaster',
      category: 'Plaster',
      coverageM2PerUnit: 10,
      unit: 'BAG',
    })
    const result = calculatePlastering(product, { areaM2: 30, coats: 2, wastagePct: 0 })
    // 60 / 10 = 6
    expect(result.quantity).toBe(6)
  })

  it('clamps zero coats to one coat', () => {
    const product = makeProduct({
      name: 'MultiFinish Plaster',
      category: 'Plaster',
      coverageM2PerUnit: 10,
      unit: 'BAG',
    })
    const result = calculatePlastering(product, { areaM2: 10, coats: 0, wastagePct: 0 })
    expect(result.quantity).toBe(1)
  })
})

describe('calculateInsulation', () => {
  it('calculates insulation boards', () => {
    const product = makeProduct({
      name: 'PIR Insulation Board',
      category: 'PIR Insulation',
      lengthMm: 1200,
      widthMm: 600,
      unit: 'SHEET',
    })
    const result = calculateInsulation(product, { areaM2: 12, wastagePct: 0 })
    // 12 / (1.2 * 0.6) = 16.67 → 17
    expect(result.quantity).toBe(17)
  })

  it('calculates loft rolls by coverage', () => {
    const product = makeProduct({
      name: 'Loft Roll',
      category: 'Cavity Insulation',
      coverageM2PerUnit: 12,
      unit: 'ROLL',
    })
    const result = calculateInsulation(product, { areaM2: 36, wastagePct: 0 })
    expect(result.quantity).toBe(3)
  })
})

describe('calculateRoofing', () => {
  it('calculates felt rolls', () => {
    const product = makeProduct({
      name: 'Torch on Roofing Felt',
      category: 'Roofing',
      coverageM2PerUnit: 15,
      unit: 'ROLL',
    })
    const result = calculateRoofing(product, { areaM2: 45, pitchFactor: 1.15, wastagePct: 0 })
    // 45 * 1.15 / 15 = 3.45 → 4
    expect(result.quantity).toBe(4)
  })

  it('calculates guttering by perimeter', () => {
    const product = makeProduct({
      name: 'Half Round Guttering',
      category: 'Roofing',
      lengthMm: 3000,
      unit: 'M',
    })
    const result = calculateRoofing(product, { areaM2: 0, perimeterM: 18, wastagePct: 0 })
    // 18 / 3 = 6
    expect(result.quantity).toBe(6)
  })

  it('calculates resin by litres', () => {
    const product = makeProduct({
      name: 'GRP Pro Roofing Resin',
      category: 'Roofing',
      coverageM2PerUnit: 2,
      unit: 'LTR',
    })
    const result = calculateRoofing(product, { areaM2: 20, pitchFactor: 1, wastagePct: 0 })
    // 20 / 2 = 10
    expect(result.quantity).toBe(10)
  })
})

describe('calculateTimber', () => {
  it('calculates C24 timber pieces for studwork', () => {
    const product = makeProduct({
      name: 'C24 Timber',
      category: 'Timber',
      lengthMm: 4800,
      unit: 'M',
    })
    const result = calculateTimber(product, { length: 5, height: 2.4, studSpacingMm: 600 })
    // studs = roundUp(5/0.6)+1 = 10, length = 24m; plates = 10m; total = 34m; pieces = roundUp(34/4.8) = 8
    expect(result.quantity).toBe(8)
  })

  it('calculates battens', () => {
    const product = makeProduct({
      name: 'BS Treated Battens',
      category: 'Timber',
      lengthMm: 4800,
      unit: 'M',
    })
    const result = calculateTimber(product, { length: 4, height: 2.5 })
    // rows = 3, total = 12m, pieces = roundUp(12/4.8) = 3
    expect(result.quantity).toBe(3)
  })

  it('falls back to a default piece length when product length is zero', () => {
    const product = makeProduct({
      name: 'C24 Timber',
      category: 'Timber',
      lengthMm: 0,
      unit: 'M',
    })
    const result = calculateTimber(product, { length: 5, height: 2.4, studSpacingMm: 600 })
    // same studwork calc with 4.8 m default pieces → still 8 pieces
    expect(result.quantity).toBe(8)
    expect(Number.isFinite(result.quantity)).toBe(true)
  })
})

describe('calculateSteelLintel', () => {
  it('recommends a lintel length for a steel cavity lintel', () => {
    const product = makeProduct({
      name: 'Standard 100mm Cavity Steel Lintel',
      category: 'Steel & Lintels',
      unit: 'EA',
    })
    const result = calculateSteelLintel(product, { openingWidthMm: 1200 })
    expect(result.quantity).toBe(1)
    expect(result.explanation).toContain('1500 mm')
  })

  it('uses shorter bearing for concrete lintels', () => {
    const product = makeProduct({
      name: '140x100 Concrete Lintel',
      category: 'Steel & Lintels',
      unit: 'EA',
    })
    const result = calculateSteelLintel(product, { openingWidthMm: 1200 })
    expect(result.explanation).toContain('1400 mm')
  })

  it('recommends multiple lintels when the product is shorter than required', () => {
    const product = makeProduct({
      name: 'Standard 100mm Cavity Steel Lintel',
      category: 'Steel & Lintels',
      unit: 'EA',
      lengthMm: 1000,
    })
    const result = calculateSteelLintel(product, { openingWidthMm: 1200 })
    // required = 1500 mm; product = 1000 mm; raw = 1.5 → 2
    expect(result.quantity).toBe(2)
  })
})
