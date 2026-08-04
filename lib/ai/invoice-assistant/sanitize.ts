/**
 * Strip control characters and collapse whitespace before user-controlled
 * text enters the LLM prompt or system prompt. This is defence-in-depth
 * against prompt injection via client names, product names, or spoken
 * transcripts.
 *
 * In addition to control-character stripping, common injection idioms
 * (`ignore all previous instructions`, `you are now`, `system prompt`,
 * `reveal instructions`) are defanged to `[redacted]` so the model never
 * receives a literal instruction it might obey. The output is length-
 * capped so the model context window can never be filled by a single
 * hostile record.
 */
export function sanitizePromptText(value: string | null | undefined, maxLen = 500): string {
  if (!value) return ''
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    // Defang common injection patterns
    .replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/gi, '[redacted]')
    .replace(/\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\b/gi, '[redacted]')
    .replace(/\b(system\s*prompt|reveal\s+instructions?|show\s+prompt)\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}

/**
 * Stricter variant for free-form spoken transcripts. Caps the length
 * more aggressively and additionally defangs common "execute this code"
 * idioms that occasionally slip through voice.
 */
export function sanitizeUserUtterance(
  value: string | null | undefined,
  maxLen = 300
): string {
  if (!value) return ''
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ')
    // Strip HTML / script tags entirely — they cannot be obeyed anyway.
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/gi, '[redacted]')
    .replace(/\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be)\b/gi, '[redacted]')
    .replace(/\b(system\s*prompt|reveal\s+instructions?)\b/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned
}
