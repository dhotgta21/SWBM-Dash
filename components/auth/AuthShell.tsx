// components/auth/AuthShell.tsx
// Shared layout wrapper for every unauthenticated surface in the
// app — sign-in, admin sign-in, register, reset-password,
// update-password, and the invite set-password flow.
//
// Why a single shell instead of letting each page compose its own
// layout?
//
//   1. The public marketing site already has a strong visual
//      language — a dark hero photo with a coloured brand
//      statement on top, soft glows, a clean card with a top
//      accent strip, and a compact footer. The sign-in screen is
//      the first impression an operator or client gets of the
//      *product* (as opposed to the marketing site), and it
//      should feel like the same brand — not a separate SaaS
//      template.
//
//   2. The dashboard itself uses blue (`--info` = #2563eb) as a
//      neutral/calm accent (KpiCards, TodaySnapshot's blue glow,
//      partial-payment badges, password-strength meter). The
//      login surfaces inherit this by way of the soft blue glow
//      blob in the top-left and the gradient that runs from
//      info/5 → background → primary/5.
//
//   3. Putting the chrome in one place keeps the per-page forms
//      dead simple: each auth page just renders its <AuthCard>.
//
//   4. The brand-panel image is parameterised via the `image` prop
//      so each auth page can drop in its own cinematic
//      construction-themed photo (yard exterior for /login,
//      warehouse interior for /admin-login, fresh-brick close-up
//      for /reset-password, dawn site for /update-password) without
//      re-implementing the layout. The fallback is the homepage
//      hero so a misconfigured page still renders.
//
// Layout (responsive):
//   • <lg  — single column, mobile brand strip at the top, then
//             the form card, then the footer.
//   • lg+  — split layout: left brand panel (50%) with the
//             per-page hero photo, brand statement and trust
//             signals; right form panel with the card.
//
// Brand-panel vertical rhythm (lg+):
//   The column is `flex flex-col` with three children:
//
//     [logo]                    (top, top-aligned)
//     [flex-1 + justify-center] (absorbs all remaining height,
//                                centres the headline block inside)
//     [trust signals, CTA]      (very bottom)
//
//   Centring the headline block in its own flex-1 area keeps the
//   empty space above the headline and below the CTA equal
//   regardless of viewport height — the panel reads as balanced
//   instead of "image-heavy at the top, text crammed at the
//   bottom". The previous `mt-auto` version stuck the text to the
//   very bottom of the panel, which gave a balanced footer but
//   left a huge band of image at the top.

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Clock, Phone, ShieldCheck, Truck } from 'lucide-react'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { getDefaultCompanyName, getDefaultHomeDescription } from '@/lib/demo/brand'

interface AuthShellProps {
  children: React.ReactNode
  /** Phone number for the "Call the trade counter" CTA. Pulled from
   *  company_settings by the parent layout; falls back to a neutral
   *  default so the page still renders when the DB is unreachable. */
  phone?: string | null
  /** Footer copyright name. */
  companyName?: string
  /** Background image shown on the brand panel (left half on lg+).
   *  Each auth page passes its own cinematic image so /login,
   *  /admin-login, /reset-password, and /update-password all feel
   *  distinct without the panel having to re-render. */
  image?: string
  /** Alt text for the brand panel image. Keep it descriptive so
   *  screen-reader users get a sense of the visual. */
  imageAlt?: string
}

const FALLBACK_PHONE = '01234 567 890'
const FALLBACK_NAME = getDefaultCompanyName()
const FALLBACK_IMAGE = '/hero-1-4kgen.webp'
const FALLBACK_IMAGE_ALT = getDefaultHomeDescription()

export function AuthShell({
  children,
  phone = FALLBACK_PHONE,
  companyName = FALLBACK_NAME,
  image = FALLBACK_IMAGE,
  imageAlt = FALLBACK_IMAGE_ALT,
}: AuthShellProps) {
  const safePhone = (phone || FALLBACK_PHONE).trim() || FALLBACK_PHONE
  const telHref = `tel:${safePhone.replace(/\s+/g, '')}`
  const year = new Date().getFullYear()

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-gradient-to-br from-info/5 via-background to-primary/5">
      {/* Soft glow blobs — match the dashboard interior's
          information-tone glow treatment (TodaySnapshot uses
          bg-info/6 blur-3xl). Kept very low opacity so they read
          as ambient colour, not decoration. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-info/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -bottom-40 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl"
      />
      {/* Subtle dot-grid texture — the same ledger-like background
          the landing page uses. Gives the surface depth without
          competing with the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-dot-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      {/* Mobile brand strip — visible only on smaller viewports
          where the split brand panel is hidden. Keeps the logo
          anchored at the top so the form is recognisably "ours"
          even on a phone. */}
      <div className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8 lg:hidden">
        <Link href="/" aria-label="Back to home">
          <BrandLogo variant="horizontal" />
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Home
        </Link>
      </div>

      {/* Main split area. On lg+ the brand panel and the form
          panel sit side-by-side and share the remaining vertical
          space. On smaller viewports the brand panel is hidden
          and the form fills the column. */}
      <div className="relative flex flex-1 flex-col lg:flex-row">
        {/* Brand panel — mirrors the landing hero's dark photo +
            coloured brand statement. Uses hero-1 so the photo is
            already preloaded by the landing page. */}
        <aside
          aria-label="About Demo Builder Merchant"
          className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:w-1/2 xl:w-[55%]"
        >
          <div className="absolute inset-0">
            <Image
              src={image}
              alt={imageAlt}
              fill
              sizes="(min-width: 1280px) 55vw, (min-width: 1024px) 50vw, 100vw"
              priority
              // Use the higher end of the configured quality ladder
              // (qualities: [75, 90] in next.config.ts). The 4K source
              // WebPs are already high-quality, so we don't want
              // Next.js to re-encode them down to 75 and smear the
              // cinematic detail on the auth panel.
              quality={90}
              className="object-cover object-center"
            />
            {/* Same left-weighted overlay as the landing hero: heavy
                on the text side, fading to clear on the right so the
                yard signage reads through. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(120deg,rgba(15,23,42,0.94)_0%,rgba(15,23,42,0.78)_30%,rgba(15,23,42,0.45)_55%,rgba(15,23,42,0.2)_80%)]"
            />
          </div>

          <div className="relative z-10 flex w-full flex-col p-10 text-white xl:p-14">
            {/* Brand card — opaque white so the logo (dark icon +
                slate wordmark) stays legible against the dark photo.
                A subtle ring + shadow gives it lift without competing
                with the headline further down the panel. */}
            <Link
              href="/"
              aria-label="Back to home"
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs shadow-sm ring-1 ring-black/5 transition-colors hover:bg-secondary"
            >
              <BrandLogo variant="horizontal" />
            </Link>

            {/* Middle block — pill, headline, paragraph. `flex-1
                flex flex-col justify-center` lets this block
                absorb all the leftover vertical space between the
                logo and the trust-signals row, then centre the text
                inside it. Net effect: the gap above the headline
                matches the gap below it, regardless of viewport
                height, so the brand panel reads as balanced rather
                than "image-heavy at the top, text crammed at the
                bottom". Inner `space-y-5` keeps the pill → headline
                → paragraph rhythm tight. */}
            <div className="flex flex-1 flex-col justify-center">
              <div className="space-y-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur sm:text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Est. 2017 · Trade &amp; DIY · Same-Day Delivery
                </span>
                <h2 className="max-w-lg text-4xl font-extrabold leading-[1.05] tracking-tight text-white xl:text-5xl">
                  Builders merchant
                  <br />
                  serving the <span className="text-primary">South East</span>.
                </h2>
                <p className="max-w-md text-sm leading-relaxed text-white/80 xl:text-base">
                  Aggregates, bricks, timber, insulation and fixings — stocked
                  in depth and delivered on our own lorries across Greater
                  London, Berkshire, Buckinghamshire and the home counties.
                </p>
              </div>
            </div>

            {/* Bottom block — trust signals + trade-counter CTA.
                Sits at the very bottom of the panel. The text above
                is centred inside its flex-1 area, so the empty space
                above the headline and below the CTA are equal. */}
            <div className="space-y-4">
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 text-sm text-white/85 sm:grid-cols-3">
                <li className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-primary ring-1 ring-black/5">
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                  Open 7am – 5pm
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-primary ring-1 ring-black/5">
                    <Truck className="h-3.5 w-3.5" />
                  </span>
                  Same-day delivery
                </li>
                <li className="inline-flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-primary ring-1 ring-black/5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  Secure sign-in
                </li>
              </ul>
              <a
                href={telHref}
                className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <Phone className="h-4 w-4" />
                Call the trade counter · {safePhone}
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </aside>

        {/* Form panel — the actual auth card lives here, supplied
            by the per-page content. max-w-md keeps the form at
            a comfortable reading width on every breakpoint. */}
        <main className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-10 xl:p-14">
          <div className="w-full max-w-md animate-dashboard-fade">
            {children}
          </div>
        </main>
      </div>

      {/* Footer — sits beneath the form on every viewport. Kept
          semi-transparent so the gradient bleeds through and the
          footer reads as part of the surface, not a hard band. */}
      <footer className="relative z-10 border-t border-border/60 bg-white/40 px-5 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <p>
            &copy; {year} {companyName}. All rights reserved.
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center gap-x-4 gap-y-1"
          >
            <Link href="/" className="transition-colors hover:text-foreground">
              Home
            </Link>
            <span aria-hidden className="text-border">·</span>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <span aria-hidden className="text-border">·</span>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
