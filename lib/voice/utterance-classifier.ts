/**
 * Utterance classifier — turns short utterances into YES / NO / EDIT /
 * UNKNOWN verdicts.
 *
 * Used by the UI confirmation gate so the assistant never calls the LLM
 * for the simple "yes" / "no" follow-up that the operator gives after
 * reading back a captured detail.
 *
 * Decision order:
 *   1. If the utterance contains a numeric slot / product name override,
 *      classify as EDIT (the operator is correcting a detail, not
 *      confirming).
 *   2. If the utterance matches one of the YES lexicon phrases, return YES.
 *   3. If the utterance matches one of the NO lexicon phrases, return NO.
 *   4. Otherwise return UNKNOWN — the caller should fall through to the LLM.
 */

export type UtteranceVerdict = 'yes' | 'no' | 'edit' | 'unknown'

const YES_PHRASES: string[] = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'aye',
  'sure',
  'ok',
  'okay',
  'confirm',
  'do it',
  'go ahead',
  'go on',
  "that's right",
  'thats right',
  'correct',
  'right',
  'agreed',
  'fine',
  'good',
]

const NO_PHRASES: string[] = [
  'no',
  'nope',
  'nah',
  'nay',
  'negative',
  'cancel',
  'stop',
  "that's wrong",
  'thats wrong',
  'incorrect',
  'never mind',
  'forget it',
  'scratch that',
  'reset',
]

/**
 * Classify an utterance. The caller passes the text the user just
 * produced, and a flag indicating whether there is any pending intent
 * for YES / NO to be applied to.
 */
export function classifyUtterance(
  text: string,
  options: { hasPendingIntent: boolean } = { hasPendingIntent: true }
): UtteranceVerdict {
  const norm = normaliseUtterance(text)
  if (!norm) return 'unknown'

  if (!options.hasPendingIntent) {
    return 'unknown'
  }

  if (isEditUtterance(norm)) return 'edit'

  // YES / NO: require exact match against the lexicon so we never
  // accidentally classify a stray "right" as YES — "I want the right
  // sand" should reach the LLM.
  if (YES_PHRASES.includes(norm)) return 'yes'
  if (NO_PHRASES.includes(norm)) return 'no'

  // Common compound YES/NO: "yes please", "yeah go on" — accept when
  // the utterance STARTS with a YES token and has no other content
  // beyond a small set of pleasantries.
  if (startsWithYes(norm)) return 'yes'
  if (startsWithNo(norm)) return 'no'

  return 'unknown'
}

/** "yes please" / "yep do it" / "yeah go on" — pleasantries allowed. */
const PLEASANTRIES = new Set([
  'please',
  'do',
  'go',
  'on',
  'it',
  'thanks',
  'thank',
  'you',
  'ahead',
])

function startsWithYes(norm: string): boolean {
  const head = norm.split(/\s+/)[0]
  if (!['yes', 'yeah', 'yep', 'yup', 'aye', 'sure', 'ok', 'okay'].includes(head)) return false
  const rest = norm.split(/\s+/).slice(1)
  return rest.every((t) => PLEASANTRIES.has(t) || YES_PHRASES.includes(t))
}

function startsWithNo(norm: string): boolean {
  const head = norm.split(/\s+/)[0]
  if (!['no', 'nope', 'nah', 'nay'].includes(head)) return false
  // Reject "no actually 12 bags" — that's an EDIT, which we already
  // check for above. Also reject "no wait" — that should be sent to LLM.
  const rest = norm.split(/\s+/).slice(1)
  if (rest.length === 0) return true
  const firstRest = rest[0]
  if (PLEASANTRIES.has(firstRest) || ['not', 'never', 'dont', "don't"].includes(firstRest)) {
    // "no not that one" / "no never mind" — these read as NO.
    return rest.every((t) => PLEASANTRIES.has(t) || NO_PHRASES.includes(t))
  }
  return false
}

/**
 * True when the utterance looks like an edit instruction. Heuristic:
 * contains a numeric slot, a number-word, or a product-name override
 * marker ("actually", "i meant", "no wait", "change it to", etc.).
 */
const EDIT_MARKERS = [
  'actually',
  'i meant',
  'i mean',
  'change it to',
  'change to',
  'make it',
  'i meant',
  'wrong',
  'correct it',
  'not that',
  'rather',
  'instead',
]

function isEditUtterance(norm: string): boolean {
  if (EDIT_MARKERS.some((m) => norm.includes(m))) return true

  // Any digit-shape token or number-word token → almost certainly an
  // edit (quantity / price / etc.).
  const tokens = norm.split(/\s+/)
  if (tokens.some((t) => /^\d+(\.\d+)?$/.test(t))) return true

  const numberWords = new Set([
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
    'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty',
    'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
    'thousand', 'dozen', 'half', 'quarter',
  ])
  if (tokens.some((t) => numberWords.has(t))) return true

  return false
}

export function normaliseUtterance(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
