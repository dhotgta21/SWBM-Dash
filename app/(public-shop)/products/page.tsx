// app/(public-shop)/products/page.tsx
// Public /products root. The canonical product list lives at /catalogue,
// so this page permanently redirects there to keep the URL space clean
// and avoid duplicating the catalogue under two paths.

import { permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ProductsIndexPage() {
  permanentRedirect('/catalogue')
}
