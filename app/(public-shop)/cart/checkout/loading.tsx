// app/(public-shop)/cart/checkout/loading.tsx
// Suspense fallback for the checkout page. Kept here (and NOT in a route-group
// level loading.tsx) so pages in this group that call notFound() — product
// detail, quote category slug, calculator type, invoice share — bypass the
// Suspense boundary and return a proper HTTP 404 instead of 200 + noindex.
// See: https://github.com/vercel/next.js/discussions/76501

export default function CheckoutLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading checkout…</div>
    </div>
  )
}
