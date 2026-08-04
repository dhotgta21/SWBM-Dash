// lib/errors.ts
// Map raw Supabase / Postgres error messages to user-safe strings.
//
// We deliberately collapse the original messages because they can leak
// schema details (column names, constraint names, FK relationships) to
// an attacker who can probe the API. The operator can still see the
// real error via the server console logs — we just don't ship it to
// the client.
//
// If you need to add a new mapping, prefer the SQLSTATE class
// (Postgres returns `code` as a 5-char SQLSTATE; common ones below).
// Anything not matched returns a generic "Save failed" message.

type SupabaseError = {
  message?: string
  code?: string
  details?: string
  hint?: string
}

/**
 * Returns a UI-safe string for any Supabase / PostgREST error. The
 * original `error` is also logged at warn level so ops can still see
 * it server-side.
 */
export function safeActionError(
  context: string,
  error: SupabaseError | null | undefined,
  fallback = 'Something went wrong. Please try again.'
): string {
  if (!error) return fallback
  const code = error.code
  const msg = (error.message || '').toString()

  // 23505 unique_violation
  if (code === '23505' || /duplicate key|already exists/i.test(msg)) {
    return 'That record already exists. Please use a unique value.'
  }
  // 23503 foreign_key_violation
  if (code === '23503' || /foreign key/i.test(msg)) {
    return 'That change references a record that no longer exists.'
  }
  // 23514 check_violation
  if (code === '23514' || /check constraint/i.test(msg)) {
    return 'The values entered are not allowed (e.g. a negative amount or a payment that exceeds the invoice total).'
  }
  // 23502 not_null_violation
  if (code === '23502' || /null value in column/i.test(msg)) {
    return 'A required field is missing.'
  }
  // 42501 insufficient_privilege
  if (code === '42501' || /permission denied/i.test(msg)) {
    return 'You are not authorised to perform that action.'
  }
  // P0002 no_data_found
  if (code === 'P0002' || /not found/i.test(msg)) {
    return 'That record was not found.'
  }
  // 42601 syntax_error — often a stale function return type after a schema
  // change (e.g. the update_invoice_with_items RPC needs recreating).
  if (code === '42601' || /subquery must return only one column/i.test(msg)) {
    return 'Database schema is out of sync. Please apply the latest Supabase migrations and refresh the page.'
  }
  // 42883 undefined_function — the RPC/function has not been created yet.
  if (code === '42883' || /function .* does not exist/i.test(msg)) {
    return 'Database schema is out of sync. Please apply the latest Supabase migrations and refresh the page.'
  }

  // Auth-specific
  if (code === 'invalid_credentials') return 'Invalid email or password.'
  if (code === 'email_not_confirmed') {
    return 'Please confirm your email address before signing in.'
  }
  if (code === 'user_not_found') return 'No account found with that email.'
  if (code === 'over_request_rate_limit') {
    return 'Too many attempts. Please try again later.'
  }
  if (code === 'otp_expired' || code === 'invalid_token') {
    return 'This link has expired or already been used. Please request a new one.'
  }

  // Log the real one so ops can see it; the client only sees the fallback.
  console.warn(`safeActionError(${context}):`, code, msg, error.details, error.hint)

  // In development, surface the raw error so developers can diagnose schema
  // drift and RPC issues without digging through server logs.
  if (process.env.NODE_ENV === 'development') {
    return `${fallback} [${code ?? 'no code'}] ${msg || ''}`.trim()
  }

  return fallback
}
