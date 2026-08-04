// app/providers.tsx
//
// Root client-component provider tree. Anything that needs a client component
// (state, effects, refs) to wrap the entire app lives here.
//
// We intentionally do NOT mount React Query at the root: no public-facing
// page uses useQuery / useMutation, and the dashboard / portal route groups
// that do (if any are added later) can opt in via their own layout. Mounting
// QueryClientProvider here would ship @tanstack/react-query to every
// marketing-page visitor for nothing.

import { Toaster } from '@/components/ui/sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
