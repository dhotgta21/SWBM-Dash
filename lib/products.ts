export const COMMON_UNITS = [
  'EA',
  'M',
  'M2',
  'M3',
  'KG',
  'TON',
  'LTR',
  'HM',
  'TH',
  'PK',
  'ROLL',
  'BOX',
] as const

export const COMMON_CATEGORIES = [
  'Aggregates & Cement',
  'Plasterboard',
  'Blocks',
  'Cavity Insulation',
  'Bricks',
  'Timber',
  'PIR Insulation',
  'Sheet Materials',
  'Cement & Additives',
  'Steel & Lintels',
  'Mild Steel',
  'Bright Steel',
  'Stainless Steel',
  'Aluminium',
  'Roofing',
  'Drainage',
  'Tools',
  'Fixings',
  'Miscellaneous',
] as const

/**
 * Explicit category → 3-letter product-code prefix mapping.
 *
 * Do NOT derive this automatically from the category string (e.g. first 3
 * characters) because some prefixes intentionally differ from the literal
 * start of the category name — for example "Steel & Lintels" uses "STL", not
 * "STE". This mapping must stay in sync with the convention used in the
 * existing catalogue data (catalog-plan.json, schema.sql search tags, etc.).
 */
export const CATEGORY_CODE_PREFIXES: Record<string, string> = {
  'Aggregates & Cement': 'AGG',
  'Plasterboard': 'PLA',
  'Blocks': 'BLO',
  'Cavity Insulation': 'CAV',
  'Bricks': 'BRI',
  'Timber': 'TIM',
  'PIR Insulation': 'PIR',
  'Sheet Materials': 'SHE',
  'Cement & Additives': 'CEM',
  'Steel & Lintels': 'STL',
  'Mild Steel': 'MS',
  'Bright Steel': 'BRS',
  'Stainless Steel': 'SST',
  'Aluminium': 'ALU',
  'Roofing': 'ROO',
  'Drainage': 'DRA',
  'Tools': 'TOL',
  'Fixings': 'FIX',
  'Miscellaneous': 'MIS',
}

/**
 * Derive the 3-letter product-code prefix for a category.
 * Falls back to the first 3 upper-cased characters of the category name,
 * and ultimately to "MIS" for unknown/empty categories.
 */
export function getCategoryCodePrefix(category: string): string {
  const normalized = category.trim()
  if (!normalized) return 'MIS'
  return CATEGORY_CODE_PREFIXES[normalized] ?? normalized.substring(0, 3).toUpperCase()
}
