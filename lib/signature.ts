/**
 * Normalise a signature/verified name so it is consistent everywhere money
 * moves: whitespace runs become a single underscore and case is preserved.
 *
 *   "Andrew Smith"   -> "Andrew_Smith"
 *   "andrew  smith"  -> "andrew_smith"
 *   "  Andrew_Smith " -> "Andrew_Smith"
 *
 * This is a pure, synchronous helper. It intentionally has NO 'use server'
 * directive so it can be imported from both Server Actions and Client
 * Components. (A 'use server' module may only export async functions.)
 */
export function normalizeSignatureName(name: string): string {
  return name.trim().replace(/\s+/g, '_')
}
