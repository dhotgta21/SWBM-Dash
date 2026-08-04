/**
 * Product intent extractor.
 *
 * Parses a freeform utterance into one or more ParsedIntent slots, ready to
 * be passed to the LLM as structured intent(s) instead of a raw transcript.
 *
 * Handles British English number words ("thirteen bags of cement"),
 * UK price idioms ("at £15 each", "fifteen quid", "for a fiver"),
 * measurement units (bag, tonne, m, m², m3, sheet, etc.),
 * multi-product utterances split on "and" / ",", and boundary cases
 * ("20mm gravel" is a single product token, not "20 + mm + gravel").
 *
 * Output is intentionally minimal: we never invent data we don't see.
 * Missing slots stay missing so the LLM can ask only for what's actually
 * outstanding.
 */

import {
  findFirstNumberInTokens,
  parseLeadingNumberFromToken,
  parseNumberToken,
} from './number-words'

export type IntentConfidence = 'high' | 'medium' | 'low'

export interface QuantitySlot {
  value: number
  unit?: string
  raw: string
}

export interface PriceSlot {
  value: number
  raw: string
}

export interface ProductSlot {
  name: string
  raw: string
}

export interface ParsedIntent {
  /** Captured quantity, if any. */
  quantity?: QuantitySlot
  /** Captured product, if any. */
  product?: ProductSlot
  /** Captured unit price (per item), if any. */
  price?: PriceSlot
  /**
   * Slots the caller still needs to ask about. Order matters: we ask in
   * this order so the prompts feel natural (price → product → quantity).
   */
  missing: ('quantity' | 'product' | 'price')[]
  /** Heuristic confidence of the parse. */
  confidence: IntentConfidence
}

export interface ProductIntentParseResult {
  /** Original utterance, sanitised. */
  rawText: string
  /** One or more parsed intents (multi-product → multiple entries). */
  intents: ParsedIntent[]
}

/** Lowercase, trim, collapse whitespace, normalise a few punctuation marks. */
export function normaliseUtterance(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'") // smart quotes
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split a multi-product utterance into fragments. Each fragment is fed
 * through extractSingleIntent independently.
 *
 * Heuristic:
 *   - Punctuation commas almost always split products
 *     ("13 bags cement, 5 tonnes gravel").
 *   - " and " / " plus " / " also " almost always split when followed by a
 *     new quantity ("cement and 5 tonnes gravel").
 *   - We deliberately do NOT split bare "and" inside a single phrase
 *     ("10 by 4 treated timber").
 *
 * The fragments preserve the ORIGINAL casing — extraction does its own
 * lowercasing internally.
 */
export function splitMultiProduct(input: string): string[] {
  const raw = (input ?? '').trim()
  if (!raw) return []
  const lower = raw.toLowerCase()

  const commas = raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
  if (commas.length > 1) return commas

  // Split the lowercased copy at quantity-leading "and" / "plus" / "also",
  // then map each lowercase fragment back to the corresponding original-
  // case substring so the product name keeps its casing.
  const re =
    /(?<!\bpound\b|\bpounds\b|\bquid\b)\s+(?:and|plus|also)\s+(?=(?:\d+\b|half|dozen|a\s|an\s|\banother\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b))/g
  const fragments = lower.split(re).filter((s) => s.trim() !== '')
  if (fragments.length <= 1) return [raw]

  // Walk `raw` consuming text as we find each fragment.
  const out: string[] = []
  let cursor = 0
  for (const frag of fragments) {
    const trimmed = frag.trim()
    const idx = lower.indexOf(trimmed, cursor)
    if (idx === -1) {
      out.push(trimmed)
      continue
    }
    const slice = raw.slice(idx, idx + trimmed.length).trim()
    out.push(slice)
    cursor = idx + trimmed.length
  }
  return out
}

// Unit normalisation. Anything not in this map is treated as a generic
// product-name word.
const PENCE_WORDS = new Set(['p', 'pence', 'penny', 'pennies', 'pee', 'ph'])
const POUND_WORDS = new Set(['pound', 'pounds', 'quid'])

/**
 * Common acoustic mis-hearings for building-material keywords.
 *
 * Speech recognition often confuses material terms with everyday homophones
 * ("bricks" → "breaks", "timber" → "timbre", "steel" → "steal"). We
 * normalise the transcript before slot extraction so the parser and the
 * downstream product search see the canonical material word.
 *
 * The map is alias → canonical. Aliases are matched as whole tokens only.
 */
const ACOUSTIC_MATERIAL_ALIASES: Record<string, string> = {
  // Bricks / blocks — the most common confusion from the screenshot.
  break: 'brick',
  breaks: 'bricks',
  brake: 'brick',
  brakes: 'bricks',
  blok: 'block',
  bloks: 'blocks',
  bloke: 'block',
  blokes: 'blocks',

  // Timber & sheet materials
  timbre: 'timber',
  ply: 'plywood',
  'ply wood': 'plywood',

  // Metals
  steal: 'steel',
  steals: 'steel',

  // Roofing / drainage
  titles: 'tiles',
  tyles: 'tiles',
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace acoustically-confused material words with their canonical form. */
function applyAcousticMaterialAliases(input: string): string {
  if (!input) return input
  const sortedKeys = Object.keys(ACOUSTIC_MATERIAL_ALIASES).sort(
    (a, b) => b.length - a.length
  )
  if (sortedKeys.length === 0) return input
  const pattern = new RegExp(
    '(?<!\\S)(' + sortedKeys.map(escapeRegExp).join('|') + ')(?=\\s|$|[.,!?;:])',
    'gi'
  )
  return input.replace(pattern, (match) => ACOUSTIC_MATERIAL_ALIASES[match.toLowerCase()] ?? match)
}

const UNIT_TO_NORMAL: Record<string, string> = {
  bag: 'bag',
  bags: 'bag',
  tonne: 'tonne',
  tonnes: 'tonne',
  ton: 'tonne',
  tons: 'tonne',
  t: 'tonne', // as a stand-alone letter T usually means "tonne"
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  metre: 'm',
  metres: 'm',
  meter: 'm',
  meters: 'm',
  m: 'm',
  mt: 'm', // spoken "metre"
  millimetre: 'mm',
  millimetres: 'mm',
  millimeter: 'mm',
  millimeters: 'mm',
  mm: 'mm',
  cm: 'cm',
  foot: 'ft',
  feet: 'ft',
  ft: 'ft',
  inch: 'in',
  inches: 'in',
  square: 'sq', // joined with next unit, e.g. "square metre"
  sq: 'sq',
  cube: 'cu',
  cubic: 'cu',
  cu: 'cu',
  sheet: 'sheet',
  sheets: 'sheet',
  length: 'length',
  lengths: 'length',
  piece: 'piece',
  pieces: 'piece',
  ea: 'each',
  each: 'each',
  roll: 'roll',
  rolls: 'roll',
  block: 'block',
  blocks: 'block',
  pack: 'pack',
  packs: 'pack',
  box: 'box',
  boxes: 'box',
  packet: 'packet',
  packets: 'packet',
  pallet: 'pallet',
  pallets: 'pallet',
  bundle: 'bundle',
  bundles: 'bundle',
  litre: 'litre',
  litres: 'litre',
  liter: 'litre',
  liters: 'litre',
  l: 'litre',
}

// Dimension units stay with the product name (e.g. "20mm gravel", "4x2 timber")
// rather than becoming a quantity unit. They are still normalised when they do
// appear as a unit token so the raw token is preserved in the product name.
const DIMENSION_UNITS = new Set([
  'm',
  'mm',
  'cm',
  'mt',
  'metre',
  'metres',
  'meter',
  'meters',
  'millimetre',
  'millimetres',
  'millimeter',
  'millimeters',
  'foot',
  'feet',
  'ft',
  'inch',
  'inches',
  'in',
  'square',
  'sq',
  'cube',
  'cubic',
  'cu',
])

function isDimensionUnit(unit: string | undefined): boolean {
  return unit != null && DIMENSION_UNITS.has(unit)
}

interface PriceCapture {
  price: PriceSlot
  /** Token range consumed by the price expression. */
  range: { start: number; end: number }
}

/**
 * Try to capture a price from a token list. Returns null when no price
 * idiom is recognised.
 *
 * Recognises:
 *   - "at £15 each", "at £15.99 per bag"
 *   - "for £15", "for fifteen quid a bag"
 *   - "fifteen quid a bag"
 *   - "for tenner each", "tenner" → 10
 *   - "for a fiver" → 5
 *   - "for a tenner" → 10
 *   - "cost £15", "priced at 15", "charge 15"
 *   - "£15 each", "£15"
 *
 * A price is only captured when one of the price-marker tokens is present
 * (£, "quid", "fiver", "tenner", "at", "for", "price", "priced",
 * "charge", "cost"). Without a marker we treat the first number as a
 * quantity instead, so "13 bags of cement" never becomes a £13 price.
 */
const PRICE_FILLER = new Set(['that', 'is', 'was', 'its', 'it', 'the', 'a', 'an', 'of'])

function skipPriceFillers(tokens: string[], start: number): number {
  let i = start
  while (i < tokens.length && PRICE_FILLER.has(tokens[i]!.toLowerCase())) {
    i++
  }
  return i
}

function capturePrice(tokens: string[]): PriceCapture | null {
  if (!containsPriceMarker(tokens)) return null

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'at' || tokens[i] === '@') {
      const inner = capturePriceBare(tokens.slice(i + 1), false)
      if (inner)
        return {
          price: inner.price,
          range: { start: i + 1 + inner.range.start, end: i + 1 + inner.range.end },
        }
    }
    if (
      tokens[i] === 'price' ||
      tokens[i] === 'priced' ||
      tokens[i] === 'charge' ||
      tokens[i] === 'cost'
    ) {
      const afterMarker = skipPriceFillers(tokens, i + 1)
      if (tokens[afterMarker] === 'at') {
        const inner = capturePriceBare(tokens.slice(afterMarker + 1), false)
        if (inner)
          return {
            price: inner.price,
            range: { start: afterMarker + 1 + inner.range.start, end: afterMarker + 1 + inner.range.end },
          }
      }
      // Use capturePriceBare so it can find the actual price expression later
      // in the phrase (e.g. "price that 20p" where fillers sit between).
      const inner = capturePriceBare(tokens.slice(afterMarker), false)
      if (inner)
        return {
          price: inner.price,
          range: { start: afterMarker + inner.range.start, end: afterMarker + inner.range.end },
        }
    }
    if (tokens[i] === 'for' || tokens[i] === 'per') {
      const inner = capturePriceBare(tokens.slice(i + 1), false)
      if (inner)
        return {
          price: inner.price,
          range: { start: i + 1 + inner.range.start, end: i + 1 + inner.range.end },
        }
    }
  }
  const bare = capturePriceBare(tokens, true)
  if (bare) return { price: bare.price, range: bare.range }
  return null
}

/** True when any token looks like a price marker. */
function containsPriceMarker(tokens: string[]): boolean {
  if (tokens.some((t) => t.includes('£') || t.includes('@'))) return true
  if (tokens.some((t) => ['quid', 'fiver', 'tenner'].includes(t))) return true
  if (tokens.some((t) => isPriceUnitWord(t))) return true
  if (tokens.some((t) => ['at', 'price', 'priced', 'charge', 'cost', 'for', 'per'].includes(t))) return true

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] ?? ''
    // Glued pence token, e.g. "50p" / "20pee" / "30ph".
    const glued = parseLeadingNumberFromToken(t)
    if (glued) {
      const suffix = t.slice(glued.rawText.length).toLowerCase()
      if (isPenceWord(suffix)) return true
    }

    // Number followed by a price unit ("15 quid") or by a trailing pence
    // amount ("twelve fifty" / "twelve and fifty").
    const num = parseNumberToken(t)
    if (num !== null) {
      const next = tokens[i + 1]
      const afterNext = tokens[i + 2]
      if (next && isPriceUnitWord(next)) return true
      if (next === 'and' && afterNext && isPriceUnitWord(afterNext)) return true
      const nextNum = next ? parseNumberToken(next) : null
      if (nextNum !== null && nextNum < 100) return true
      if (next === 'and' && afterNext) {
        const afterAndNum = parseNumberToken(afterNext)
        if (afterAndNum !== null && afterAndNum < 100) return true
      }
    }
  }

  return false
}

function capturePriceBare(
  tokens: string[],
  requireMarker: boolean = false
): { price: PriceSlot; range: { start: number; end: number } } | null {
  // If the caller requires a marker, any price marker anywhere in the phrase
  // counts (e.g. "15 per bag" has the marker "per" even though the token
  // "15" itself does not carry it).
  const phraseHasMarker = !requireMarker || containsPriceMarker(tokens)

  for (let i = 0; i < tokens.length; i++) {
    // check slang first
    if (tokens[i] === 'fiver') {
      return { price: { value: 5, raw: 'a fiver' }, range: { start: i, end: i + 1 } }
    }
    if (tokens[i] === 'tenner') {
      return { price: { value: 10, raw: 'a tenner' }, range: { start: i, end: i + 1 } }
    }
    if (tokens[i] === 'a' && tokens[i + 1] === 'fiver') {
      return { price: { value: 5, raw: 'a fiver' }, range: { start: i, end: i + 2 } }
    }
    if (tokens[i] === 'a' && tokens[i + 1] === 'tenner') {
      return { price: { value: 10, raw: 'a tenner' }, range: { start: i, end: i + 2 } }
    }

    // Try glued tokens like "£15", "£15each", "20p", "50pence".
    const glued = parseLeadingNumberFromToken(tokens[i] ?? '')
    const wordNum = glued ? null : parseNumberToken(tokens[i] ?? '')
    if (glued || wordNum !== null) {
      let end = i + 1
      let value = glued ? glued.value : wordNum!
      let raw = glued ? glued.rawText : (tokens[i] ?? '')
      let hasMarker = (tokens[i]?.includes('£') ?? false) || isPriceUnitWord(tokens[i + 1])
      let penceConsumed = false

      // Suffix after the numeric part of the same token, e.g. "20p" → pence.
      if (glued) {
        const suffix = (tokens[i] ?? '').slice(raw.length).toLowerCase()
        if (isPenceWord(suffix)) {
          hasMarker = true
          value = value / 100
          raw = `${raw}${suffix}`
          penceConsumed = true
        }
      }

      // Check following tokens for pounds/pence words (e.g. "fifteen quid").
      const nextToken = tokens[end]
      if (!penceConsumed && nextToken && isPoundWord(nextToken)) {
        hasMarker = true
        let penceStart = end + 1
        if (tokens[penceStart] === 'and') penceStart += 1
        const penceNum = findFirstNumberInTokens(tokens.slice(penceStart))
        if (penceNum && penceNum.index === 0 && penceNum.value < 100) {
          value = value + penceNum.value / 100
          const joiner = tokens.slice(end + 1, penceStart).join(' ')
          raw = `${raw} ${nextToken}${joiner ? ' ' + joiner : ''} ${penceNum.rawText}`
          end = penceStart + penceNum.tokenCount
          penceConsumed = true
        } else {
          raw = `${raw} ${nextToken}`
          end += 1
        }
      } else if (!penceConsumed) {
        // Direct pounds + pence, e.g. "twelve fifty" or "twelve and fifty".
        let penceStart = end
        if (tokens[penceStart] === 'and') penceStart += 1
        const penceNum = findFirstNumberInTokens(tokens.slice(penceStart))
        if (penceNum && penceNum.index === 0 && penceNum.value < 100) {
          hasMarker = true
          value = value + penceNum.value / 100
          const joiner = tokens.slice(end, penceStart).join(' ')
          raw = `${raw}${joiner ? ' ' + joiner : ''} ${penceNum.rawText}`
          end = penceStart + penceNum.tokenCount
          penceConsumed = true
        }
      }

      // Check for trailing pence word in the next token (e.g. "fifty pence").
      const trailingToken = tokens[end]
      if (!penceConsumed && trailingToken && isPenceWord(trailingToken)) {
        hasMarker = true
        value = value / 100
        raw = `${raw} ${trailingToken}`
        end += 1
      }

      if (requireMarker && !hasMarker && !phraseHasMarker) {
        continue
      }

      return {
        price: { value, raw },
        range: { start: i, end },
      }
    }
  }

  return null
}

function isPenceWord(token: string | undefined): boolean {
  if (!token) return false
  return PENCE_WORDS.has(token.toLowerCase())
}

function isPoundWord(token: string | undefined): boolean {
  if (!token) return false
  return POUND_WORDS.has(token.toLowerCase())
}

function isPriceUnitWord(token: string | undefined): boolean {
  return isPenceWord(token) || isPoundWord(token)
}

/**
 * Extract a quantity + unit from a phrase. The quantity is always the
 * earliest number when no price marker is present, or the earliest number
 * before any price marker.
 *
 * Dimensions (e.g. "20mm", "4x2") stay with the product name rather than
 * becoming a quantity. Packaging units (bag, pallet, kg) become quantity units.
 */
interface QuantityCapture {
  quantity: QuantitySlot
  range: { start: number; end: number }
}

function captureQuantity(
  tokens: string[],
  priceRange?: { start: number; end: number }
): QuantityCapture | null {
  // Search before the price span (if any) so we don't double-count.
  const ceiling = priceRange?.start ?? tokens.length
  const slice = tokens.slice(0, ceiling)

  // Try a strict number first (digit or word).
  const num = findFirstNumberInTokens(slice)
  const tokenCount = num?.tokenCount ?? 0

  // If no strict number, look for "a <unit>" → quantity 1.
  if (!num) {
    for (let i = 0; i < ceiling; i++) {
      if ((tokens[i] === 'a' || tokens[i] === 'an') && tokens[i + 1] && tokens[i + 1] in UNIT_TO_NORMAL) {
        const unitToken = tokens[i + 1]
        const unit = UNIT_TO_NORMAL[unitToken]
        if (isDimensionUnit(unit)) return null
        return {
          quantity: {
            value: 1,
            unit,
            raw: `a ${unitToken}`,
          },
          range: { start: i, end: i + 2 },
        }
      }
    }
  }

  // If still no number, look for glued number+unit tokens like "1kg", "50mm".
  if (!num) {
    for (let i = 0; i < ceiling; i++) {
      const glued = parseLeadingNumberFromToken(tokens[i] ?? '')
      if (!glued) continue
      const suffix = (tokens[i] ?? '').slice(glued.rawText.length).toLowerCase()
      if (suffix && suffix in UNIT_TO_NORMAL) {
        const unit = UNIT_TO_NORMAL[suffix]
        if (isDimensionUnit(unit)) return null
        return {
          quantity: {
            value: glued.value,
            unit,
            raw: tokens[i] ?? '',
          },
          range: { start: i, end: i + 1 },
        }
      }
    }
  }

  if (!num) return null

  // Price pattern: "fifteen quid a bag" — the number belongs to the price,
  // not the quantity. Do not consume it here.
  const tokenAfterNum = tokens[num.index + tokenCount]
  if (tokenAfterNum && isPriceUnitWord(tokenAfterNum)) {
    return null
  }

  // Specification pattern: "MOT type 1", "grade 4" — keep number with product.
  const tokenBeforeNum = tokens[num.index - 1]
  if (tokenBeforeNum && ['type', 'grade', 'class', 'no', 'number'].includes(tokenBeforeNum.toLowerCase())) {
    return null
  }

  // Dimension pattern: "8 by 4 plywood" / "six by two c24 timber" — keep the
  // whole pattern in the product name. Check both digit and word numbers after "by".
  const nextToken = tokens[num.index + tokenCount]
  const afterNext = tokens[num.index + tokenCount + 1]
  if (nextToken === 'by' && afterNext) {
    const afterNum =
      parseLeadingNumberFromToken(afterNext) ??
      (parseNumberToken(afterNext) !== null ? { value: parseNumberToken(afterNext)!, rawText: afterNext } : null)
    if (afterNum) {
      return null
    }
  }

  // Look for a unit token immediately after the number.
  let unit: string | undefined
  const unitTokenIndex = num.index + tokenCount
  const unitToken = tokens[unitTokenIndex]
  let hasUnit = false
  if (unitToken && unitToken in UNIT_TO_NORMAL) {
    unit = UNIT_TO_NORMAL[unitToken]
    hasUnit = true
  }

  // Special: "half a bag" / "quarter a tonne" — the unit may be one token
  // further after "a" or "of".
  let rawUnitToken = unitToken
  let endIndex = num.index + tokenCount
  if (hasUnit) {
    endIndex = unitTokenIndex + 1
  }
  if ((num.value === 0.5 || num.value === 0.25) && !unit) {
    const afterUnitToken = tokens[unitTokenIndex + 1]
    if ((unitToken === 'a' || unitToken === 'of') && afterUnitToken && afterUnitToken in UNIT_TO_NORMAL) {
      unit = UNIT_TO_NORMAL[afterUnitToken]
      rawUnitToken = `${unitToken} ${afterUnitToken}`
      endIndex = unitTokenIndex + 2
      hasUnit = true
    }
  }

  // Compound dimension units: "square metre", "cubic metre", "sq m".
  if (unit && (unit === 'sq' || unit === 'cu') && tokens[unitTokenIndex + 1]) {
    const nextUnitToken = tokens[unitTokenIndex + 1]
    if (nextUnitToken in UNIT_TO_NORMAL && isDimensionUnit(UNIT_TO_NORMAL[nextUnitToken])) {
      rawUnitToken = `${unitToken} ${nextUnitToken}`
      endIndex = unitTokenIndex + 2
    }
  }

  if (unit && isDimensionUnit(unit)) {
    // Dimension descriptors normally stay with the product (e.g. "20mm gravel"),
    // but they become the quantity unit when the user clearly states an amount
    // of product ("five metres of timber") or the phrase is just a quantity
    // with no product ("five square metres").
    const isQuantity = endIndex >= ceiling || tokens[endIndex] === 'of'
    if (!isQuantity) {
      return null
    }
  }

  return {
    quantity: {
      value: num.value,
      unit,
      raw: num.rawText + (unit ? ` ${rawUnitToken}` : ''),
    },
    range: { start: num.index, end: endIndex },
  }
}

/**
 * Try to capture a product name. We treat everything outside the
 * number/price/unit ranges as the candidate product, then clean it up.
 */
const FILLER = new Set([
  'at',
  '@',
  'each',
  'per',
  'of',
  'for',
  'a',
  'an',
  'the',
  'price',
  'priced',
  'charge',
  'cost',
  'and',
  'them',
  'that',
  'is',
  'was',
  'its',
  'it',
])

// Preserve "on" after these words so compound product names like "torch on"
// are not truncated.
const PRESERVE_ON_AFTER = new Set(['torch'])

const LEADING_FILLER = new Set([
  'i',
  'we',
  'need',
  'want',
  'like',
  'would',
  'give',
  'me',
  'us',
  'add',
  'put',
  'can',
  'have',
  'could',
  'you',
  'get',
  'please',
  'bring',
  'send',
])

// Spoken yes/no responses that leak into the start of an utterance when the
// operator is in a hands-free confirmation flow. Strip them so "yes yes 30
// bags" does not become a product named "yes yes bags".
const LEADING_RESPONSE_WORDS = new Set([
  'yes',
  'yeah',
  'yep',
  'yup',
  'aye',
  'sure',
  'ok',
  'okay',
  'correct',
  'right',
  'agreed',
  'fine',
  'good',
  'no',
  'nope',
  'nah',
  'nay',
])

const TRAILING_FILLER = new Set([
  'please',
  'on',
  'it',
  'for',
  'me',
  'us',
  'now',
  'today',
  'thanks',
  'thank',
  'you',
])

// Strip common trailing conversational fillers before slot extraction so they
// do not leak into price/quantity parsing (e.g. "for me" is not a price marker).
const TRAILING_PHRASES: RegExp[] = [
  /\s+on\s+it\s*$/i,
  /\s+for\s+(?:me|us|you|him|her|them)\s*$/i,
  /\s+please\s*$/i,
  /\s+thanks?\s*$/i,
  /\s+thank\s+you\s*$/i,
]

function stripTrailingFillers(input: string): string {
  let s = input
  for (const re of TRAILING_PHRASES) {
    s = s.replace(re, '')
  }
  return s.trim()
}

function captureProduct(tokens: string[], consumed: Set<number>): ProductSlot | null {
  // Reconstruct the tokens that were NOT consumed.
  const remaining: { token: string; lower: string }[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue
    const tok = tokens[i]
    remaining.push({ token: tok, lower: tok.toLowerCase() })
  }

  // Strip leading fillers from the start of the product name.
  while (remaining.length > 0) {
    const head = remaining[0].lower
    if (FILLER.has(head) || LEADING_FILLER.has(head) || LEADING_RESPONSE_WORDS.has(head)) {
      remaining.shift()
    } else {
      break
    }
  }

  // Strip trailing fillers from the end of the product name.
  while (remaining.length > 0) {
    const tail = remaining[remaining.length - 1].lower
    const prev = remaining.length >= 2 ? remaining[remaining.length - 2].lower : null

    // Preserve compound terms like "torch on".
    if (tail === 'on' && prev && PRESERVE_ON_AFTER.has(prev)) {
      break
    }

    // Strip "on it" as a compound trailing phrase.
    if (tail === 'it' && prev === 'on') {
      remaining.pop()
      remaining.pop()
      continue
    }

    if (FILLER.has(tail) || TRAILING_FILLER.has(tail)) {
      remaining.pop()
    } else {
      break
    }
  }

  if (remaining.length === 0) return null

  const joined = remaining.map((r) => r.token).join(' ').trim()
  if (!joined) return null
  return { name: joined, raw: joined }
}

/**
 * Extract a single ParsedIntent from a phrase that has already been split
 * (no "and" / commas). Tokenises on the lowered form for matching, but
 * reconstructs the product name from the original text so case is kept.
 */
export function extractSingleIntent(input: string): ParsedIntent {
  const original = applyAcousticMaterialAliases(stripTrailingFillers((input ?? '').trim()))
  const lookup = original.toLowerCase()
  const tokens = tokenise(lookup)
  const originalTokens = tokenise(original)

  const priceCapture = capturePrice(tokens)
  const consumed = new Set<number>()
  if (priceCapture) {
    for (let i = priceCapture.range.start; i < priceCapture.range.end; i++) consumed.add(i)
  }

  const quantityCapture = captureQuantity(tokens, priceCapture?.range)
  if (quantityCapture) {
    for (let i = quantityCapture.range.start; i < quantityCapture.range.end; i++) consumed.add(i)
  }

  const product = captureProduct(originalTokens, consumed)
  const quantity = quantityCapture?.quantity

  const missing: ParsedIntent['missing'] = []
  if (!quantity) missing.push('quantity')
  if (!product) missing.push('product')
  if (!priceCapture) missing.push('price')

  const confidence: IntentConfidence =
    !missing.length ? 'high' : missing.length === 1 ? 'medium' : 'low'

  const result: ParsedIntent = { missing, confidence }
  if (quantity) result.quantity = quantity
  if (product) result.product = product
  if (priceCapture) result.price = priceCapture.price
  return result
}

/**
 * Tokenise a normalised utterance into a flat array. Preserves decimal
 * digits inside number tokens (5.5 / 1,000 / 15.99) and glues £ to the
 * following digit.
 */
function tokenise(s: string): string[] {
  // Split on whitespace + sentence punctuation; decimals stay glued.
  const split = s.split(/[\s?!,;:]+/).filter(Boolean)
  const out: string[] = []
  for (let tok of split) {
    // Strip surrounding punctuation that survived the split (e.g. trailing
    // "." on "total."). Leave internal "." alone.
    tok = tok.replace(/^[^\w£]+|[^\w£]+$/g, '')
    if (!tok) continue
    // Glue £ to the following digit if a stray space appeared.
    tok = tok.replace(/£\s+(\d)/g, '£$1')
    // Normalise British pence acoustics so "pee" / "ph" are treated as pence.
    const lower = tok.toLowerCase()
    if (lower === 'pee') tok = 'p'
    else if (lower === 'ph') tok = 'pence'
    else if (lower === 'penny' || lower === 'pennies') tok = 'pence'
    out.push(tok)
  }
  return out
}

/**
 * Public entry point. Returns one or more ParsedIntent slots from a raw
 * utterance.
 */
export function extractProductIntent(input: string): ProductIntentParseResult {
  const rawText = (input ?? '').trim()
  if (!rawText) return { rawText: '', intents: [] }
  const normalised = normaliseUtterance(rawText).toLowerCase()
  const fragments = splitMultiProduct(rawText)
  const intents = fragments.map((f) => extractSingleIntent(f))
  return { rawText: normalised, intents }
}

/**
 * Merge slot values from `next` into `previous` ONLY when `previous` was
 * missing that slot. Existing slots in `previous` are preserved.
 *
 * Use case: the operator captured "13 bags of cement" and then said
 * "£15 each" to fill in the missing price. Without this merge, the second
 * utterance would be re-parsed as a fresh intent with no product — and
 * the LLM would ask "what product?". With the merge, we keep the
 * existing product/quantity and just stamp on the new price.
 *
 * The returned intent has its `missing` and `confidence` recomputed.
 */
export function mergeProductIntentSlots(
  previous: ParsedIntent,
  next: ParsedIntent
): ParsedIntent {
  const merged: ParsedIntent = {
    ...previous,
    missing: [...previous.missing],
  }
  let filled = 0
  if (!previous.quantity && next.quantity) {
    merged.quantity = next.quantity
    merged.missing = merged.missing.filter((m) => m !== 'quantity')
    filled += 1
  }
  if (!previous.product && next.product) {
    merged.product = next.product
    merged.missing = merged.missing.filter((m) => m !== 'product')
    filled += 1
  }
  if (!previous.price && next.price) {
    merged.price = next.price
    merged.missing = merged.missing.filter((m) => m !== 'price')
    filled += 1
  }
  merged.confidence =
    merged.missing.length === 0
      ? 'high'
      : merged.missing.length < previous.missing.length
        ? 'medium'
        : previous.confidence
  // If no slot was filled and nothing was added, return the merged
  // object as-is (it is a strict superset of `previous`).
  void filled
  return merged
}
