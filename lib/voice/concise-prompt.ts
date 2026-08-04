/**
 * Reduce an LLM message to a single short fragment for the bottom action
 * bar. Operators need an at-a-glance label, not a paragraph.
 *
 * Strips verbose openers ("I found", "Is it"), drops inline markdown
 * (so "**Bold lead** Cement" becomes "Bold lead Cement"), keeps only the
 * first sentence, and strips trailing filler words ("yes", "please",
 * "thanks") so the bar reads cleanly. Caps at 36 chars.
 *
 * Returns null when the input has no usable content — the caller should
 * fall back to a hard state-specific prompt.
 */
export function extractConciseHead(raw?: string | null): string | null {
  if (!raw) return null
  const firstLine = raw.split('\n')[0] ?? ''
  // Drop inline markdown markers (bold/italic/code) globally before splitting.
  const noMarkdown = firstLine
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^[*_`#>\-\s]+/, '')
    .trim()
  // Take the first sentence only (split on sentence-end punctuation).
  const sentence = noMarkdown.split(/(?<=[.?!])\s+/)[0] ?? noMarkdown
  const cleaned = sentence
    .replace(
      /^(i found|is it|is this (?:the right )?|right,?\s*so|so,?\s*|okay,?\s*|alright,?\s*|got it,?\s*)/i,
      ''
    )
    // Drop any remaining trailing punctuation FIRST so the filler-word
    // regex below can match words that happen to end a sentence.
    .replace(/[.,;:!?]+\s*$/, '')
    // Drop trailing fragments like ", yes", " yes", "no" so the bar
    // ends on a noun rather than an operator acknowledgement.
    .replace(/,?\s*(please|thanks?|thank\s+you|yes|no)\s*$/i, '')
    .replace(/\*+$/, '')
    .trim()
  if (!cleaned) return null
  return cleaned.length > 36 ? `${cleaned.slice(0, 36)}…` : cleaned
}
