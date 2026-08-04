'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logClientError } from '@/lib/actions/log-error'

interface SectionErrorBoundaryProps {
  children: ReactNode
  fallbackTitle?: string
  onError?: (error: Error) => void
}

interface SectionErrorBoundaryState {
  error: Error | null
}

/**
 * Granular error boundary for a section of the page.
 *
 * Catches render errors in its children and shows a localised fallback
 * instead of letting the error bubble up to the route-level boundary.
 * Useful for isolating which async server component is failing.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error) {
    console.error('SectionErrorBoundary caught error:', error)
    this.props.onError?.(error)
    logClientError(error.message, (error as Error & { digest?: string }).digest, error.stack).catch(() => {
      // Ignore logging failures.
    })
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {this.props.fallbackTitle ?? 'Could not load section'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Something went wrong while loading this section. Please try again.
          </p>
          <Button
            size="sm"
            onClick={() => this.setState({ error: null })}
            className="mt-4"
          >
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
