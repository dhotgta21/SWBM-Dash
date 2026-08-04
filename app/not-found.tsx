// app/not-found.tsx
// Global 404 fallback for unknown routes. Emits noindex so search engines
// don't index non-existent URLs, and gives visitors a clear path back into
// the catalogue or quote flow.

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: { absolute: 'Page not found | Star Hawk b.m.' },
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
        404 — Page not found
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        We couldn&apos;t find the page you were looking for. Head back to the
        catalogue or get a quote.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go home
        </Link>
        <Link
          href="/catalogue"
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Browse catalogue
        </Link>
        <Link
          href="/quote"
          className="inline-flex items-center justify-center rounded-md border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Get a quote
        </Link>
      </div>
    </div>
  )
}
