/**
 * withQueryRetry — run a Supabase query and retry once on a transient
 * failure, logging either way.
 *
 * Several document-render paths (invoice PDF, public share page, email)
 * load supporting rows like company_settings and company_bank_details and
 * historically ignored the result's `error`. A transient PostgREST/pooler
 * failure then produced a document silently missing the company address or
 * bank details, and nothing was logged — the classic "sometimes it's blank"
 * bug. Wrapping the query in this helper retries transient failures once
 * (status 0 / 429 / 5xx) and always logs a labelled error when the query
 * ultimately failed, so silent blanks show up in the server logs.
 *
 * Mirrors the retry policy already used for the public catalogue in
 * lib/public-products.ts.
 */

interface RetryableResult {
  status?: number
  error: unknown
}

function isRetryable(result: RetryableResult): boolean {
  const status = typeof result.status === 'number' ? result.status : 0
  // 0 = network/fetch failure before a response, 429 = rate limited,
  // 5xx = PostgREST/pooler/edge errors. Anything else (4xx) is a real
  // query problem that a retry will not fix.
  return status === 0 || status === 429 || status >= 500
}

export async function withQueryRetry<T extends RetryableResult>(
  label: string,
  queryFn: () => PromiseLike<T>
): Promise<T> {
  let result = await queryFn()

  if (result.error && isRetryable(result)) {
    console.error(`[query-retry] ${label}: transient failure, retrying once:`, result.error)
    await new Promise((resolve) => setTimeout(resolve, 300))
    result = await queryFn()
  }

  if (result.error) {
    console.error(`[query-retry] ${label}: query failed:`, result.error)
  }

  return result
}
