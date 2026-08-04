/**
 * Shared search sanitisation and filter builders.
 *
 * Goals:
 * - Escape/strip characters that have special meaning in Postgres filters or
 *   regular expressions so users cannot accidentally widen or break a query.
 * - Keep user intent where possible (escape rather than delete wildcards).
 * - Provide consistent word-prefix behaviour for product names and prefix
 *   behaviour for client names.
 * - Support natural-language product queries by stripping quantities, units
 *   and stop words.
 */

/** Words that carry no product meaning. */
const PRODUCT_STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'with', 'and', 'or', 'to', 'in', 'on', 'at', 'by', 'is', 'are',
  'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'need', 'needed', 'want', 'wanted', 'like', 'please',
  'give', 'me', 'i', 'we', 'you', 'they', 'it', 'this', 'that', 'these', 'those', 'my', 'our',
  'your', 'their', 'its', 'some', 'any', 'all', 'both', 'each', 'every', 'few', 'more', 'most',
  'much', 'many', 'other', 'another', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'now', 'then', 'here', 'there', 'when', 'where', 'why', 'how', 'what', 'which', 'who',
  'whom', 'whose', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'per',
])

/** Spoken number words that should not become search terms. */
const PRODUCT_NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'hundreds', 'thousand', 'thousands', 'dozen', 'half', 'quarter',
])

/** Price-related words that should not become search terms. */
const PRODUCT_PRICE_WORDS = new Set([
  'quid', 'pound', 'pounds', 'pence', 'penny', 'fiver', 'tenner',
])

/** Quantities and units that should not be treated as product keywords. */
const PRODUCT_UNIT_WORDS = new Set([
  'bag', 'bags', 'pack', 'packs', 'packet', 'packets', 'box', 'boxes', 'bottle', 'bottles', 'tin',
  'tins', 'can', 'cans', 'container', 'containers', 'pallet', 'pallets', 'bundle', 'bundles',
  'roll', 'rolls', 'each', 'ea', 'pair', 'pairs', 'dozen', 'dozens', 'hundred', 'hundreds',
  'sheet', 'sheets', 'length', 'lengths', 'piece', 'pieces', 'block', 'blocks',
  'thousand', 'thousands', 'lot', 'lots', 'tonne', 'tonnes', 'ton', 'tons', 'kilogram',
  'kilograms', 'kg', 'kilo', 'kilos', 'gram', 'grams', 'g', 'meter', 'meters', 'metre', 'metres',
  'liter', 'liters', 'litre', 'litres', 'gallon', 'gallons', 'pint', 'pints', 'yard', 'yards',
  'foot', 'feet', 'ft', 'inch', 'inches', 'in', 'square', 'sq', 'cubic', 'cu', 'm2', 'm3',
  'millimetre', 'millimetres', 'millimeter', 'millimeters', 'centimetre', 'centimetres',
  'centimeter', 'centimeters', 'ml', 'cl', 'dl',
])

/**
 * Strip quantity/unit noise from a spoken or typed product query and return
 * the significant product terms. Pure numbers, stop words and measurement
 * words are removed.
 *
 * Examples:
 *   "50 bags of gravel" -> ["gravel"]
 *   "20mm shingle"      -> ["20mm", "shingle"]
 *   "T 30 gravel 50"    -> ["gravel"]
 */
export function extractProductSearchTerms(query: string): string[] {
  const normalised = query
    .toLowerCase()
    // Keep dimension patterns like 4x2, 4.5, 20mm intact by turning surrounding
    // punctuation into spaces without destroying the alphanumeric token.
    .replace(/[^\p{L}\p{N}.x\-]/gu, ' ')
  const words = normalised.split(/\s+/).filter(Boolean)

  const terms = new Set<string>()
  for (const word of words) {
    if (word.length < 2) continue
    if (/^\d+$/.test(word)) continue
    if (PRODUCT_STOP_WORDS.has(word)) continue
    if (PRODUCT_UNIT_WORDS.has(word)) continue
    if (PRODUCT_NUMBER_WORDS.has(word)) continue
    if (PRODUCT_PRICE_WORDS.has(word)) continue
    terms.add(word)
  }

  return Array.from(terms)
}

/**
 * Build a PostgREST filter that requires every extracted term to match at
 * least one of name, code, category, description or brand. The result is an
 * AND of ORs that can be passed to `.or()`, e.g.:
 *   and(or(name.ilike.%gravel%,code.ilike.%gravel%,...),or(name.ilike.%20mm%,code.ilike.%20mm%,...))
 */
export function buildSmartProductSearchFilter(terms: string[]): string {
  const usable = terms.map(sanitizeLikeTerm).filter(Boolean)
  if (usable.length === 0) return ''

  const termFilters = usable.map((term) => {
    const fields = [
      `name.ilike.%${term}%`,
      `code.ilike.%${term}%`,
      `category.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `brand.ilike.%${term}%`,
    ]
    return `or(${fields.join(',')})`
  })

  return `and(${termFilters.join(',')})`
}

/** Characters that would break a PostgREST `.or()` filter string. */
const POSTGREST_SYNTAX_CHARS = /[(),]/g

/**
 * Escape a term for safe use inside an `ILIKE` pattern.
 * Backslash, `%` and `_` are escaped; PostgREST syntax chars are removed.
 */
export function sanitizeLikeTerm(term: string): string {
  return (
    term
      // Escape backslashes first so later escapes stay literal.
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_')
      .replace(POSTGREST_SYNTAX_CHARS, '')
      .trim()
  )
}

/** Regex metacharacters that must be escaped in a POSIX regex value. */
const REGEX_METACHARACTERS = /[\\^$.|?*+()[\]{}]/g

/**
 * Escape a term for safe use inside a Postgres `~*` (regex) pattern.
 * Commas are removed because they are still interpreted as `.or()` separators.
 */
export function sanitizeRegexTerm(term: string): string {
  return term.replace(REGEX_METACHARACTERS, '\\$&').replace(/,/g, '').trim()
}

/**
 * Build the `.or()` filter string used for product searches.
 *
 * The query is split on whitespace and every token must match somewhere on the
 * product. A token matches when it is a word-prefix in the product name (the
 * start of the name or the start of a word) or a substring of the product code.
 * Tokens are combined with AND, so "30mm gravel" only returns products that
 * match both "30mm" and "gravel". Matching is case-insensitive.
 *
 * Example: "shi gr" matches "10 mm Shingle" and "20 mm Gravel".
 */
export function buildProductSearchFilter(query: string): string {
  const tokens = query.split(/\s+/).map((t) => t.trim()).filter(Boolean)

  const tokenFilters = tokens
    .map((token) => {
      const likeTerm = sanitizeLikeTerm(token)
      const regexTerm = sanitizeRegexTerm(token)
      if (!likeTerm && !regexTerm) return ''
      if (!regexTerm) return `code.ilike.%${likeTerm}%`
      if (!likeTerm) {
        return (
          `name.imatch.^${regexTerm},` +
          `name.imatch.[[:space:][:punct:]]${regexTerm}`
        )
      }
      // Use `imatch` (PostgREST operator for `~*`, case-insensitive regex) rather
      // than `iregex`, which this project's PostgREST version does not recognise.
      return (
        `name.imatch.^${regexTerm},` +
        `name.imatch.[[:space:][:punct:]]${regexTerm},` +
        `code.ilike.%${likeTerm}%`
      )
    })
    .filter(Boolean)

  if (tokenFilters.length === 0) return ''
  if (tokenFilters.length === 1) return tokenFilters[0]
  return `and(${tokenFilters.join(',')})`
}

/**
 * Build the `.or()` filter string used for client searches.
 * Names and company use prefix matching; account/phone/email keep substring
 * matching because staff often search for a fragment of those values.
 */
export function buildClientSearchFilter(term: string): string {
  const t = sanitizeLikeTerm(term)
  if (!t) return ''
  return (
    `first_name.ilike.${t}%,last_name.ilike.${t}%,company_name.ilike.${t}%,` +
    `account_number.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`
  )
}

/**
 * Client-side product match for in-memory lists (catalogue, SEO editor, etc.).
 *
 * The query is split on whitespace and every token must match somewhere on the
 * product: the product name starts with the token, a word in the name starts
 * with the token, or the product code contains the token. Matching is
 * case-insensitive.
 */
export function productMatchesSearch(
  product: { name: string; code?: string | null },
  query: string
): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  const name = product.name.toLowerCase()
  const code = (product.code ?? '').toLowerCase()

  return tokens.every((token) => {
    if (name.startsWith(token)) return true

    const escaped = sanitizeRegexTerm(token)
    if (!escaped) return false
    const wordBoundaryRe = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}`, 'iu')
    if (wordBoundaryRe.test(name)) return true

    return code.includes(token)
  })
}

/**
 * Client-side client match for in-memory lists.
 * Matches first/last/company prefix and account/phone/email substring.
 */
export function clientMatchesSearch(
  client: {
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    account_number?: string | null
    phone?: string | null
    email?: string | null
  },
  query: string
): boolean {
  const q = sanitizeLikeTerm(query).toLowerCase()
  if (!q) return true

  const first = (client.first_name ?? '').toLowerCase()
  const last = (client.last_name ?? '').toLowerCase()
  const company = (client.company_name ?? '').toLowerCase()

  if (first.startsWith(q) || last.startsWith(q) || company.startsWith(q)) return true

  const account = (client.account_number ?? '').toLowerCase()
  const phone = (client.phone ?? '').toLowerCase()
  const email = (client.email ?? '').toLowerCase()

  return account.includes(q) || phone.includes(q) || email.includes(q)
}
