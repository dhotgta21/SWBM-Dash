// components/seo/JsonLd.tsx
// Renders a <script type="application/ld+json"> block with the per-request
// CSP nonce injected by proxy.ts. Must be used inside a dynamically rendered
// route (using this component calls headers(), which opts the route out of
// static generation).

import { headers } from 'next/headers'

interface JsonLdProps {
  readonly data: unknown
  readonly id?: string
}

function safeJsonLdStringify(value: unknown): string {
  // Escape < to prevent closing the script tag in case JSON contains HTML.
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export async function JsonLd({ data, id }: JsonLdProps) {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    // suppressHydrationWarning: the per-request CSP nonce is read from
    // request headers and stamped on the SSR'd <script>. React 19's
    // re-render of this tree (e.g. during the RSC payload hydration pass)
    // can compute a different value because the nonce lives outside the
    // captured render snapshot, so the virtual DOM and the SSR HTML
    // disagree on the `nonce` attribute. The browser CSP check happens
    // during initial HTML parse — long before hydration — so the value
    // on the DOM is the one that matters. See Vercel/next.js#63749
    // and #77952.
    <script
      id={id}
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(data) }}
      suppressHydrationWarning
    />
  )
}
