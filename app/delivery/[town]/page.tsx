// app/delivery/[town]/page.tsx
// 301 redirect from the legacy /delivery/[town] URL to the canonical
// /locations/[town] page. Visitors and any external links using the
// "delivery {town}" URL form are forwarded to the right page, and
// PageRank from the old URL passes through to the new one.

import { permanentRedirect } from 'next/navigation'

interface PageProps {
  readonly params: Promise<{ town: string }>
}

export default async function DeliveryTownRedirect({ params }: PageProps) {
  const { town: townSlug } = await params
  // permanentRedirect issues a 308 (Next.js's "permanent" status), which
  // preserves the request method and is the modern equivalent of 301 for
  // route moves. We don't touch query strings — they get forwarded.
  permanentRedirect(`/locations/${townSlug}`)
}

// No metadata needed — this is a server-only redirect.
export const dynamic = 'force-dynamic'
