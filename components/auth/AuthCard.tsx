// components/auth/AuthCard.tsx
// The "form card" used by every auth surface (sign-in, admin
// sign-in, register, reset/update password, invite set-password).
//
// What this wrapper adds on top of the bare <Card> primitive:
//
//   1. A floating top accent bar in the brand's information →
//      primary gradient. The bar lives just outside the card
//      border so it reads as a ribbon, not a chunky stripe, and
//      it visually mirrors the "blue → red" gradient used in
//      the landing page's primary CTAs and the dashboard's
//      status pills.
//
//   2. Two soft corner glows (info top-right, primary
//      bottom-left) that sit *inside* the card. They echo the
//      ambient glows in the surrounding AuthShell but at a
//      tighter, more contained radius, so the card itself feels
//      like a small lit object on the page.
//
//   3. A heavier shadow than the default Card — `shadow-2xl
//      shadow-slate-900/10` lifts it off the gradient
//      background.
//
//   4. A subtle fade-in via `animate-dashboard-fade` so the
//      card appears the same way the dashboard's content does.
//
// The children stay the existing <CardHeader> / <CardContent>
// structure so per-page copy doesn't have to change.

import * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function AuthCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="relative">
      {/* Top accent ribbon. Lives just outside the top border so the
          card edge stays clean, and is rounded so the ends look like
          a small label rather than a chunky stripe. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1 left-8 right-8 z-10 h-1.5 rounded-full bg-gradient-to-r from-info via-primary to-primary-hover shadow-md shadow-primary/30"
      />
      <Card
        className={cn(
          'relative overflow-hidden border border-border/80 bg-card/95 shadow-2xl shadow-slate-900/10 backdrop-blur-sm',
          className
        )}
      >
        {/* Inside the card. Two soft glows, one in each top corner
            pair, to suggest the card itself is a lit surface on the
            page. Kept very low opacity (info/8, primary/8) so they
            don't compete with the form contents. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-info/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -bottom-24 h-56 w-56 rounded-full bg-primary/8 blur-3xl"
        />
        <div className="relative">{children}</div>
      </Card>
    </div>
  )
}
