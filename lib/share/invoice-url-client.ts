// lib/share/invoice-url-client.ts
// Client-side companion to lib/share/invoice-url.ts. The server helper
// refuses to build a URL without an explicit base (so we never silently
// emit a broken link); the client helper can fall back to
// window.location.origin since the browser always knows where it is.

'use client'

import { buildInvoiceShareUrl, type BuildInvoiceShareUrlInput } from './invoice-url'

function clientOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : ''
}

export function buildInvoiceShareUrlClient(token: string): string
export function buildInvoiceShareUrlClient(
  opts: Pick<BuildInvoiceShareUrlInput, 'shareKey' | 'shareToken'>
): string
export function buildInvoiceShareUrlClient(
  input: string | Pick<BuildInvoiceShareUrlInput, 'shareKey' | 'shareToken'>
): string {
  if (typeof input === 'string') {
    return buildInvoiceShareUrl({ token: input, baseUrl: clientOrigin() })
  }
  return buildInvoiceShareUrl({ ...input, baseUrl: clientOrigin() })
}

export function buildDeliveryNoteShareUrlClient(token: string): string
export function buildDeliveryNoteShareUrlClient(
  opts: Pick<BuildInvoiceShareUrlInput, 'shareKey' | 'shareToken'>
): string
export function buildDeliveryNoteShareUrlClient(
  input: string | Pick<BuildInvoiceShareUrlInput, 'shareKey' | 'shareToken'>
): string {
  const url =
    typeof input === 'string'
      ? buildInvoiceShareUrlClient(input)
      : buildInvoiceShareUrlClient(input)
  return `${url}?mode=delivery-note`
}
