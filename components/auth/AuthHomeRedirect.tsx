// components/auth/AuthHomeRedirect.tsx
// Invisible client-side bootstrap that runs after the home page hydrates.
// If a Supabase session is present, look up the role and send the user
// to the right dashboard. If not (or if anything fails), do nothing —
// the marketing page stays.
//
// Why client-side and not server-side?
//   The home page is statically rendered (ISR, `revalidate = 3600`).
//   Reading cookies / validating the Supabase session on the server
//   would force the route into dynamic mode, defeating the cache.
//
// Tradeoff: logged-in visitors see the marketing page flash for ~50ms
// before being redirected. That's acceptable here — the redirect is a
// pure convenience, not a security boundary (the dashboard does its
// own auth). Anonymous visitors (the vast majority) never see any
// extra render work.

'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Dashboard route constants — kept here so this component can be lifted
// into another client surface later without dragging the whole
// homepage dependency tree.
const DASHBOARD_FOR_OPS = '/invoices?view=due'
const PORTAL_FOR_CLIENTS = '/portal'
const PICKER_DASHBOARD = '/picker'
const DRIVER_DASHBOARD = '/driver'

export function AuthHomeRedirect() {
  const router = useRouter()
  // Guard against a second navigation triggering during the first.
  const dispatchedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    ;(async () => {
      try {
        const { data } = await supabase.auth.getUser()
        if (cancelled || dispatchedRef.current) return
        const user = data.user
        if (!user) return

        // Resolve role. Fall back to the operator dashboard if the
        // profile lookup fails — never block on this.
        let role: string | null = null
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
          role = profile?.role ?? null
        } catch {
          role = null
        }

        dispatchedRef.current = true
        router.replace(
          role === 'client'
            ? PORTAL_FOR_CLIENTS
            : role === 'picker'
              ? PICKER_DASHBOARD
              : role === 'driver'
                ? DRIVER_DASHBOARD
                : DASHBOARD_FOR_OPS
        )
      } catch {
        // Best-effort. Anonymous / offline / expired session — leave the
        // user on the marketing page.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  return null
}
