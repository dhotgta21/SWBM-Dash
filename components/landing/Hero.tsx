// components/landing/Hero.tsx
// Above-the-fold hero. H1 carries the primary keyword + service-area
// towns so Google can rank this page for "builders merchant" + each
// town in isolation. Single primary CTA to the quote builder and a
// secondary phone link for visitors who prefer to call the trade
// counter.
//
// Background is a 6-image crossfading slideshow curated from the
// same `auth-login-cinematic-*.webp` pool that the auth pages rotate
// through. All shots are 21:9 4K golden-hour construction scenes so
// the marketing site and the operator/client sign-in screens share
// one visual language — a returning operator immediately recognises
// the same cinematic photo treatment on both surfaces.
//
// Why a slideshow instead of the previous looping video?
//
//   - A static-photo slideshow gives the page a curated "branded
//     photo essay" feel that reads as premium, not generic-stock.
//   - Each shot is sharp at 4K so it survives Next.js's image
//     optimization without smearing the cinematic detail.
//   - The 7.5s crossfade is slow enough that the headline copy
//     (which lives on a dark left-weighted overlay) stays legible
//     for the full duration of every slide.
//   - LCP: the first slide renders with `priority` so the LCP
//     element is the same 4K yard-exterior photo we use to
//     preload the homepage elsewhere.
//
// Mechanics:
//   - Client component (the crossfade state needs `useEffect`).
//   - Renders all 6 slides stacked with `fill`. Only the active
//     one is at opacity 100; the rest are at 0. CSS `transition-
//     opacity duration-1500` does the crossfade.
//   - `useEffect` advances the active index every 7.5s.
//   - `prefers-reduced-motion` disables the rotation and pins the
//     page to the first slide (no motion for users who don't want
//     it, per the global rule in app/globals.css).
//   - All slides preloaded via `loading="eager"` so crossfade 2
//     is ready the moment the first transition starts — no
//     visible blank band mid-fade.

'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Phone, MapPin } from 'lucide-react'
import { telHref, mailtoHref } from '@/lib/company'
import { HERO_SLIDES, type AuthImageEntry } from '@/components/auth/AuthPage'
import { HeroLiveCards } from '@/components/landing/LiveTicker'
import { cn } from '@/lib/utils'

interface HeroProps {
  phone: string
  email: string
  /** Optional vertical-pack override for the H1 lead (before emphasis). */
  heroLead?: string
  /** Optional vertical-pack override for the emphasised H1 phrase. */
  heroEmphasis?: string
  /** Optional vertical-pack override for the body paragraph. */
  heroBody?: string
}

const ROTATION_MS = 7500
const FADE_MS = 1500

export function Hero({
  phone,
  email,
  heroLead = 'Builders merchant delivering across',
  heroEmphasis = 'the South East',
  heroBody =
    'Aggregates, bricks, timber, insulation, roofing, drainage and fixings, stocked in depth and priced for trade. Walk in, load up at the trade counter, or have it on your site the same day on our own lorries.',
}: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-slate-900">
      <HeroSlideshow />

      {/* Left-weighted dark overlay: dark on the text side so the
          headline stays legible, then fades to fully transparent by
          ~60% so the golden-hour yard on the right reads as
          bright and active. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.65)_30%,rgba(0,0,0,0.2)_50%,rgba(0,0,0,0)_65%)]"
      />
      {/* Soft bottom lift so the badge + buttons always sit on a
          reliably dark patch, even on short viewports where the text
          overlaps the lighter middle band of the photo. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-[linear-gradient(to_top,rgba(0,0,0,0.55),rgba(0,0,0,0))]"
      />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-28">
        {/* H1 — SEO strategy:
            • Primary keyword "builders merchant" sits at the front of
              the H1 where it carries the most weight with Google.
            • Geographic modifier "the South East" is broad enough to
              capture the regional intent ("builders merchant south
              east", "builders merchant near me" within the region)
              without naming individual towns. Naming only two towns
              (e.g. "Uxbridge & Dartford") actively confused visitors
              who were outside that pair — they assumed we didn't
              deliver to them and bounced. The 935 individual town
              pages at /locations/[town] still handle the long-tail
              "delivery {town}" queries via their own H1 + LocalBusiness
              schema, so we lose nothing on the long tail by going
              broad here.
            • The accent (brand red) lands on "the South East" so the
              visual rhythm of the hero is unchanged from the old
              per-town version.

            Layout: the container is exactly 100vh (min-h-screen) and
            uses justify-center so the whole H1 → live cards → body →
            CTAs → email block sits at the visual centre of the
            viewport instead of being pushed to the top. The pt-20 /
            sm:pt-24 / lg:pt-28 padding above the H1 compensates for
            the fixed floating nav pill, so the visible gap from the
            navbar to the headline matches the visible gap from the
            "Serving builders…" line to the bottom of the viewport.

            Why min-h-screen (not min-h-[70vh]): with 70vh the hero
            was taller than the viewport on shorter laptops, so the
            background image kept rendering below the fold as the
            visitor scrolled. Pinning the hero to 100vh means the
            next section starts the moment the page scrolls. */}
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] sm:text-5xl lg:text-6xl">
          {heroLead}{' '}
          <span className="text-primary">{heroEmphasis}</span>.
        </h1>

        {/* Live yard-status cards — moved from the top bar so they sit
            between the headline and the body copy as rounded cards. */}
        <div className="mt-6">
          <HeroLiveCards />
        </div>

        {/* LOWER BAND — body copy + CTAs in a wider column. The
            container spans the full content area but the text itself
            stays left-aligned and capped at max-w-xl for readability,
            leaving the right side of the band visibly clear so the
            slideshow can carry the eye.

            Gaps below the H1 are deliberately uniform (mt-6 / 24px) so
            the vertical rhythm reads as one cohesive section — the old
            40-56px spacer + 16px paragraph-margin combo made the gap
            between the live cards and the body copy feel detached. */}
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">
          {heroBody}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/quote"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover"
          >
            Get a quote
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={telHref(phone)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-6 py-3.5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
          >
            <Phone className="h-4 w-4" />
            {phone}
          </a>
        </div>

        <p className="mt-4 max-w-xl text-sm text-white/60">
          Or email{' '}
          <a
            href={mailtoHref(email, 'Quote request from website')}
            className="font-medium text-white/90 underline underline-offset-4 hover:text-white"
          >
            {email}
          </a>{' '}
          with your take-off and we&rsquo;ll come back the same business day.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-white/70">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Serving builders and self-builders across England
          </span>
        </div>
      </div>
    </section>
  )
}

/**
 * Crossfading photo slideshow. Renders all 6 slides stacked, with
 * only the active one at opacity 100. Hydration-safe: the initial
 * render (SSR) shows slide 0 at full opacity and the rest at 0,
 * matching the initial client render. The setInterval only starts
 * after `useEffect` mounts on the client, so there's no flash of
 * the wrong slide during hydration.
 *
 * `prefers-reduced-motion` is read via `useSyncExternalStore` (the
 * React 18+ pattern for subscribing to external mutable state)
 * so the slideshow disables its auto-rotation for users who don't
 * want motion — without violating the
 * `react-hooks/set-state-in-effect` rule.
 */
function HeroSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => {
      setActiveIndex((i) => (i + 1) % HERO_SLIDES.length)
    }, ROTATION_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  return (
    <div className="absolute inset-0">
      {HERO_SLIDES.map((slide: AuthImageEntry, i: number) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt=""
          // `alt=""` because the slide is decorative — the headline
          // on top of the slideshow is the page's H1 and the
          // overlay/photo are non-content visuals. The full
          // descriptive alt lives in HERO_SLIDES for the auth page
          // surfaces where the photo IS the content.
          aria-hidden
          fill
          sizes="100vw"
          // LCP: only the first slide is priority. The rest are
          // eager so crossfade 2 is ready the moment the first
          // transition starts — no visible blank band mid-fade.
          priority={i === 0}
          loading={i === 0 ? 'eager' : 'eager'}
          quality={90}
          className={cn(
            'object-cover object-center transition-opacity ease-in-out',
            i === activeIndex ? 'opacity-100' : 'opacity-0'
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
        />
      ))}
    </div>
  )
}

/**
 * Subscribe to `prefers-reduced-motion` via the React 18+
 * `useSyncExternalStore` hook. Server snapshot is `false` so SSR
 * always renders the animated variant; the client effect picks up
 * the user's actual preference on first mount and live-updates
 * when the OS preference changes.
 */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === 'undefined') return () => {}
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      mq.addEventListener('change', callback)
      return () => mq.removeEventListener('change', callback)
    },
    () =>
      typeof window === 'undefined'
        ? false
        : window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  )
}
