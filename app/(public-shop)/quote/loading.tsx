// app/(public-shop)/quote/loading.tsx
// Suspense fallback for the quote landing page. Kept here (and NOT in a
// route-group level loading.tsx) so /quote/[slug] and /quote/calculators/[type]
// — both of which call notFound() for unknown categories/types — bypass the
// Suspense boundary and return a proper HTTP 404 instead of 200 + noindex.
// See: https://github.com/vercel/next.js/discussions/76501

export default function QuoteLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading quote builder…</div>
    </div>
  )
}
