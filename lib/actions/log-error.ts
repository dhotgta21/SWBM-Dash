'use server'

/**
 * Logs a client-side error boundary hit to the server console.
 *
 * Next.js strips the real error message from the client in production,
 * but it still logs the full error server-side. Sending the digest and
 * the sanitized message from the boundary makes it easier to correlate
 * the browser error with the server log entry.
 */
export async function logClientError(
  message: string,
  digest?: string,
  stack?: string
) {
  console.error('[client error boundary]', {
    message,
    digest,
    stack,
    timestamp: new Date().toISOString(),
  })
}
