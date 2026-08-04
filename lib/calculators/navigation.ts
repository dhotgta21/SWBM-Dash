// lib/calculators/navigation.ts
// Cross-linking helpers that connect product categories to material
// calculators and vice versa. Keeps the link logic in one place so category
// names can change without hunting through page files.

import type { CalculatorType } from './types'

export const CALCULATOR_TYPE_LABELS: Record<CalculatorType, string> = {
  BRICK_WALL: 'Brick & block wall calculator',
  MORTAR_CONCRETE: 'Mortar & concrete calculator',
  SHEET_MATERIALS: 'Sheet materials calculator',
  AGGREGATES: 'Aggregates & sub-base calculator',
  SCREED: 'Screed calculator',
  PLASTERING: 'Plastering & board calculator',
  INSULATION: 'Insulation calculator',
  ROOFING: 'Roofing calculator',
  TIMBER: 'Timber & studwork calculator',
  STEEL_LINTEL: 'Steel & lintel selector',
}

export function calculatorHref(type: CalculatorType): string {
  return `/quote/calculators/${type.toLowerCase()}`
}

export const VALID_CALCULATOR_TYPES: readonly CalculatorType[] = [
  'BRICK_WALL',
  'MORTAR_CONCRETE',
  'SHEET_MATERIALS',
  'AGGREGATES',
  'SCREED',
  'PLASTERING',
  'INSULATION',
  'ROOFING',
  'TIMBER',
  'STEEL_LINTEL',
]

export function isCalculatorType(value: string): value is CalculatorType {
  return (VALID_CALCULATOR_TYPES as readonly string[]).includes(value)
}

/**
 * Return the calculator types most relevant to a given product category.
 * Uses keyword matching so it survives small changes to category naming.
 */
export function getCalculatorsForCategory(categoryName: string): CalculatorType[] {
  const c = categoryName.toLowerCase()
  const matches = new Set<CalculatorType>()

  if (c.includes('brick') || c.includes('block')) {
    matches.add('BRICK_WALL')
    matches.add('MORTAR_CONCRETE')
  }
  if (
    c.includes('aggregate') ||
    c.includes('sand') ||
    c.includes('ballast') ||
    c.includes('gravel') ||
    c.includes('shingle') ||
    c.includes('mot')
  ) {
    matches.add('AGGREGATES')
    matches.add('MORTAR_CONCRETE')
  }
  if (c.includes('screed') || c.includes('floor screed')) {
    matches.add('SCREED')
    matches.add('MORTAR_CONCRETE')
  }
  if (
    c.includes('timber') ||
    c.includes('sheet') ||
    c.includes('plywood') ||
    c.includes('osb') ||
    c.includes('chipboard') ||
    c.includes('mdf')
  ) {
    matches.add('SHEET_MATERIALS')
    matches.add('TIMBER')
  }
  if (c.includes('plaster') || c.includes('render') || c.includes('plasterboard')) {
    matches.add('PLASTERING')
  }
  if (c.includes('insulation')) {
    matches.add('INSULATION')
  }
  if (c.includes('roof') || c.includes('felt') || c.includes('gutter') || c.includes('trim')) {
    matches.add('ROOFING')
  }
  if (c.includes('steel') || c.includes('lintel')) {
    matches.add('STEEL_LINTEL')
  }

  return Array.from(matches)
}

export interface CategoryLink {
  readonly name: string
  readonly slug: string
}

/**
 * Return the categories that are relevant to a given calculator type.
 */
export function getCategoriesForCalculator(
  type: CalculatorType,
  categories: readonly CategoryLink[]
): CategoryLink[] {
  return categories.filter((c) => getCalculatorsForCategory(c.name).includes(type))
}
