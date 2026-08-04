// app/(public-shop)/quote/calculators/loading.tsx
// Suspense fallback for the calculator index. Kept here (and NOT in a
// route-group level loading.tsx) so /quote/calculators/[type] — which calls
// notFound() for unknown calculator types — bypasses the Suspense boundary
// and returns a proper HTTP 404 instead of 200 + noindex.
// See: https://github.com/vercel/next.js/discussions/76501

export default function CalculatorsLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading calculators…</div>
    </div>
  )
}
