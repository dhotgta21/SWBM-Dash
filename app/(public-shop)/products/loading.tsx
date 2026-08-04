// app/(public-shop)/products/loading.tsx
// Suspense fallback for the products index (paginated list). Kept here (and
// NOT in a route-group level loading.tsx) so /products/[code] — which calls
// notFound() for unknown SKUs — bypasses the Suspense boundary and returns
// a proper HTTP 404 instead of 200 + noindex.
// See: https://github.com/vercel/next.js/discussions/76501

export default function ProductsListLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading products…</div>
    </div>
  )
}
