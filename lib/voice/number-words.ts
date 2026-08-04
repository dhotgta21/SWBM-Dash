/**
 * Number-word -> digit conversion for British English invoice creation.
 *
 * Handles small numbers ("one"-"nineteen"), tens ("twenty", "thirty" ...),
 * compounds ("twenty one"), halves / quarters, the special "dozen", and
 * common fraction idioms ("half a tonne" / "a ton and a half").
 *
 * The parser is deliberately conservative: it returns null for shapes it
 * does not understand, so the caller can fall back to digit parsing or
 * ask the user to disambiguate. It is NOT a general-purpose English
 * number parser.
 */

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
}

/**
 * Tokenise a phrase that may contain a number word. Returns the numeric
 * value, the matched slice, and how many tokens it consumed.
 *
 * Returns null when no number word is present at index `i`.
 */
function parseNumberWordFrom(tokens: string[], i: number): { value: number; tokensUsed: number } | null {
  const tok = tokens[i]
  if (!tok) return null

  // "a dozen" / "one and a half" — handled before the bare-unit path so it
  // does not collide with bare "one".
  if (tok === 'a' || tok === 'an') {
    if (tokens[i + 1] === 'dozen') return { value: 12, tokensUsed: 2 }
    if (tokens[i + 1] === 'half') {
      // "a half" with no further context is 0.5; the caller usually pairs
      // this with a unit on either side (e.g. "half a tonne").
      if (i + 2 < tokens.length) return { value: 0.5, tokensUsed: 2 }
    }
    if (tokens[i + 1] === 'quarter') {
      if (i + 2 < tokens.length) return { value: 0.25, tokensUsed: 2 }
    }
    // "a tonne" alone is ambiguous — refuse and let the caller decide.
    return null
  }

  if (tok === 'half') {
    return { value: 0.5, tokensUsed: 1 }
  }

  if (tok === 'quarter') {
    return { value: 0.25, tokensUsed: 1 }
  }

  if (tok === 'dozen') {
    return { value: 12, tokensUsed: 1 }
  }

  if (tok in UNITS) {
    const unit = UNITS[tok]
    // "five hundred", "three thousand"
    const scale = tokens[i + 1]
    if (scale && scale in SCALES) {
      return { value: unit * SCALES[scale], tokensUsed: 2 }
    }
    return { value: unit, tokensUsed: 1 }
  }

  if (tok in TENS) {
    const tens = TENS[tok]
    // "twenty one" / "twenty-one"
    const next = tokens[i + 1]
    if (next && next in UNITS) {
      return { value: tens + UNITS[next], tokensUsed: 2 }
    }
    // "twenty thousand"
    const scale = tokens[i + 1]
    if (scale && scale in SCALES) {
      return { value: tens * SCALES[scale], tokensUsed: 2 }
    }
    return { value: tens, tokensUsed: 1 }
  }

  if (tok in SCALES) {
    // "hundred bags", "thousand bags"
    return { value: SCALES[tok], tokensUsed: 1 }
  }

  return null
}

/**
 * Try to interpret a numeric string as either a digit-shape number
 * ("1000", "1,000", "5.5") or a multi-word number phrase
 * ("a dozen" / "twenty one" / "twenty thousand"). Returns the first
 * parsable number, or null when nothing matches.
 */
export function parseNumberToken(input: string): number | null {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  if (!s) return null

  // Digit-only path: 5 / 5.5 / 1,000.
  const cleaned = s.replace(/[,_]/g, '')
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const v = Number(cleaned)
    return Number.isFinite(v) ? v : null
  }

  // Word phrase: tokenise and run the word parser from offset 0.
  const tokens = s.split(/\s+/).filter(Boolean)
  const parsed = parseNumberWordFrom(tokens, 0)
  // If the parser used the whole input, accept; otherwise reject so we
  // don't misread "five bags" as 5.
  if (!parsed) return null
  if (parsed.tokensUsed !== tokens.length) return null
  return parsed.value
}

/**
 * Scan a tokenised phrase for the FIRST number (digit or word). Used by the
 * quantity/price extractors when they don't already have a captured number.
 *
 * Returns { value, tokenCount, rawText } describing the span, or null.
 */
export function findFirstNumberInTokens(
  tokens: string[]
): { value: number; tokenCount: number; rawText: string; index: number } | null {
  for (let i = 0; i < tokens.length; i++) {
    const digitMatch = /^([\d,]+(\.\d+)?)$/.test(tokens[i])
    if (digitMatch) {
      const v = Number(tokens[i].replace(/[,_]/g, ''))
      if (Number.isFinite(v)) {
        return { value: v, tokenCount: 1, rawText: tokens[i], index: i }
      }
    }
    const wordMatch = parseNumberWordFrom(tokens.map((t) => t.toLowerCase()), i)
    if (wordMatch) {
      const rawText = tokens.slice(i, i + wordMatch.tokensUsed).join(' ')
      return {
        value: wordMatch.value,
        tokenCount: wordMatch.tokensUsed,
        rawText,
        index: i,
      }
    }
  }
  return null
}

/**
 * Scan tokenised phrase for the LAST number (used for prices after we've
 * already taken the leading quantity).
 */
export function findLastNumberInTokens(
  tokens: string[]
): { value: number; tokenCount: number; rawText: string; index: number } | null {
  let found: { value: number; tokenCount: number; rawText: string; index: number } | null = null
  for (let i = 0; i < tokens.length; i++) {
    const digitMatch = /^([\d,]+(\.\d+)?)$/.test(tokens[i])
    if (digitMatch) {
      const v = Number(tokens[i].replace(/[,_]/g, ''))
      if (Number.isFinite(v)) {
        found = { value: v, tokenCount: 1, rawText: tokens[i], index: i }
      }
      continue
    }
    const wordMatch = parseNumberWordFrom(tokens.map((t) => t.toLowerCase()), i)
    if (wordMatch) {
      const rawText = tokens.slice(i, i + wordMatch.tokensUsed).join(' ')
      // Don't replace a confirmed digit with a word — prefer the digit when
      // both appear, otherwise the word is a useful fallback.
      if (!found || found.rawText !== tokens[i]) {
        found = {
          value: wordMatch.value,
          tokenCount: wordMatch.tokensUsed,
          rawText,
          index: i,
        }
      }
    }
  }
  return found
}

/**
 * Try to extract a leading number from a token that may have trailing letters,
 * e.g. "20p" → 20, "1kg" → 1, "50mm" → 50, "£15" → 15.
 *
 * Returns null if the token does not start with a digit or £+digit.
 * This is intentionally conservative: it only recognises a simple leading
 * numeric prefix, not full arithmetic.
 */
export function parseLeadingNumberFromToken(token: string): {
  value: number
  rawText: string
} | null {
  if (!token) return null

  // Strip a leading £ so we can also handle "£15each".
  const withoutSymbol = token.startsWith('£') ? token.slice(1) : token
  const match = withoutSymbol.match(/^(\d+(?:\.\d+)?)(.*)$/)
  if (!match) return null

  const rawNum = match[1]
  const v = Number(rawNum.replace(/[,_]/g, ''))
  if (!Number.isFinite(v)) return null

  return {
    value: v,
    rawText: token.startsWith('£') ? `£${rawNum}` : rawNum,
  }
}
