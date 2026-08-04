// components/landing/LiveTicker.tsx
// Yard-status "we are open right now" indicators for the landing page.
//
// Two exports, both backed by the same time/seeded PRNG helpers below:
//
//   • <LiveTicker />            — the legacy full-bleed top-bar. Kept
//                                 exportable for any route that wants
//                                 it (privacy/terms/returns etc.) but
//                                 no longer mounted on `/`.
//   • <HeroLiveStatus />        — compact, mobile-friendly status strip
//                                 that lives inside the hero "blue area"
//                                 at the top of the marketing page.
//                                 Replaces the old top-bar on `/`.
//
// Data sources are all deterministic from `(dayOfYear, hour)`:
//   • Daily rotating message pool (~25 yard-status strings)
//   • Time-of-day front message ("yard opens 7am", "closed Sunday" etc.)
//   • Trades served today (grows realistically through the day)
//   • Lorries currently out (re-rolled hourly)
//
// Accessibility / motion:
//   • Marquee pauses on hover/focus.
//   • All animations honour prefers-reduced-motion via globals.css.
//   • Hydration safety: anything that touches `Date.now()` is gated
//     behind a `mounted` flag so the SSR markup matches the first
//     client render. No flash, no hydration warnings.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock,
  Hammer,
  Layers,
  MapPin,
  Package,
  Ruler,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ───────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing if we ever wire Vitest here.
// ───────────────────────────────────────────────────────────────────────

interface TickerItem {
  icon: LucideIcon
  text: string
}

/**
 * Mulberry32 — tiny seedable PRNG. We use it so the day's ticker
 * selection, the trades-served starting value, and the lorry count
 * are all deterministic given (dayOfYear, hour). No dependencies.
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return function rand() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0)
  const diff = d.getTime() - start.getTime()
  return Math.floor(diff / 86_400_000)
}

export const TICKER_POOL: TickerItem[] = [
  { icon: Truck, text: '3 lorries currently delivering across the South East' },
  { icon: Truck, text: 'Lorry #2 just left for High Wycombe' },
  { icon: Truck, text: 'Lorry #4 back on the yard · 1hr to turnaround' },
  { icon: Truck, text: 'Crane-offload available on every lorry' },
  { icon: Truck, text: 'Self-serve yard open 7am–5pm' },
  { icon: MapPin, text: 'Same-day delivery to 935+ towns' },
  { icon: MapPin, text: 'Today’s routes cover Berks, Bucks & West London' },
  { icon: Package, text: 'Aggregates by the tonne · off-loaded on site' },
  { icon: Package, text: 'Stocked in depth · 200+ product lines under one roof' },
  { icon: Package, text: '4 bulk bags of Type 1 MOT just landed' },
  { icon: Package, text: 'Bagged cement · 25kg in stock, pallets available' },
  { icon: Ruler, text: 'Free timber & sheet cutting on the trade saw bench' },
  { icon: Ruler, text: 'Cutting list? Drop it off, we’ll work it while you wait' },
  { icon: Zap, text: 'New pallet of insulation in stock' },
  { icon: Zap, text: 'Cement prices held this week' },
  { icon: Zap, text: 'Bricks · 200+ types on the rack' },
  { icon: Hammer, text: 'Trade account? 30-day terms, dedicated counter' },
  { icon: Wrench, text: 'Roofing felt and shingles back in stock' },
  { icon: Layers, text: 'OSB3 sheets · cut to size while you wait' },
  { icon: Package, text: 'Bagged aggregates in stock · 25kg and bulk' },
  { icon: Truck, text: 'Tipper lorry available for loose aggregate drops' },
  { icon: Package, text: 'Drainage · pipe, fittings, soakaway crates' },
  { icon: Layers, text: 'Plywood, MDF, OSB · all thicknesses in stock' },
  { icon: Hammer, text: 'Fixings, nails, screws · full range on the wall' },
  { icon: Zap, text: 'DPC, lintels, wall ties · loaded for collection' },
]

/**
 * Pick a time-of-day message based on the current hour and weekday.
 * Returns a single item that gets prepended to the day's selection
 * so the strip always leads with the most time-relevant signal.
 */
export function getTimeMessage(now: Date, rng: () => number): TickerItem {
  const dayOfWeek = now.getDay()
  const hour = now.getHours()

  if (dayOfWeek === 0) {
    return { icon: Clock, text: 'Closed Sunday · re-open Monday 7am' }
  }
  if (hour < 6) {
    return { icon: Clock, text: 'Yard opens at 7am · first lorry out 7:30am' }
  }
  if (hour >= 17) {
    return { icon: Clock, text: 'Closed for the day · back tomorrow 7am' }
  }
  if (hour >= 15) {
    return {
      icon: Clock,
      text: 'Same-day cut-off 3pm · tomorrow’s slots still open',
    }
  }
  if (hour >= 12) {
    return {
      icon: Clock,
      text: 'Lunch 12–1pm · back on the tools at 1',
    }
  }
  // Open hours 7–12 — vary the lead message per day.
  const openMessages: TickerItem[] = [
    { icon: Clock, text: 'Trade counter open · Mon–Sat 7am–5pm' },
    { icon: Clock, text: 'Same-day cut-off 3pm' },
    { icon: Truck, text: 'First lorry out at 7:30am' },
    { icon: Clock, text: 'Yard open · hot drinks in the cabin' },
  ]
  return openMessages[Math.floor(rng() * openMessages.length)]
}

/**
 * Daily rotating subset. Same calendar day = same selection;
 * tomorrow = a different one. Size is 8–10 items so the marquee
 * reads as "lots going on" without overstaying its welcome.
 */
export function getDailyMessages(now: Date): TickerItem[] {
  const doy = dayOfYear(now)
  const rng = mulberry32(doy * 997 + now.getFullYear() * 31)
  const shuffled = shuffle(TICKER_POOL, rng)
  const count = 8 + Math.floor(rng() * 3)
  const selection = shuffled.slice(0, count)

  const lead = getTimeMessage(now, rng)
  // Avoid duplicating if the pool already happened to include the
  // same text — would look broken in the marquee.
  if (!selection.some((s) => s.text === lead.text)) {
    selection.unshift(lead)
  }
  return selection
}

/**
 * Cumulative trades served today. Grows realistically through the
 * day: 0 at midnight, 8/hr on a normal weekday, slower on Saturdays,
 * nothing on Sundays. The seeded offset gives each day a slightly
 * different starting number so the counter never reads as the same
 * "47" every morning.
 */
export function getTradesServedToday(now: Date): number {
  const dayOfWeek = now.getDay()
  if (dayOfWeek === 0) return 0

  const hour = now.getHours()
  const minute = now.getMinutes()
  const hoursOpen = Math.max(0, Math.min(10, hour - 7 + minute / 60))
  const dayMultiplier = dayOfWeek === 6 ? 0.65 : dayOfWeek === 1 ? 1.15 : 1.0
  const doy = dayOfYear(now)
  const rng = mulberry32(doy * 31 + 1)
  const seedOffset = Math.floor(rng() * 20) - 10 // ±10 trades per day
  return Math.max(0, Math.floor(hoursOpen * 7.5 * dayMultiplier) + seedOffset)
}

/**
 * Lorries currently out delivering. Re-rolled every hour from a
 * seeded RNG so the count varies hour-by-hour but is stable within
 * an hour. 0 when the yard is closed; peaks at 3 mid-morning /
 * mid-afternoon; 1–2 around the open / close.
 */
export function getLorriesOut(now: Date): number {
  const dayOfWeek = now.getDay()
  if (dayOfWeek === 0) return 0

  const hour = now.getHours()
  if (hour < 7 || hour >= 18) return 0

  const doy = dayOfYear(now)
  const rng = mulberry32(doy * 1000 + hour)
  const base = Math.floor(rng() * 4) // 0–3

  if (hour < 9) return Math.min(base, 2)
  if (hour < 12) return base
  if (hour < 14) return Math.max(1, base - 1)
  if (hour < 16) return base
  return Math.min(base, 1)
}

// ───────────────────────────────────────────────────────────────────────
// Legacy full-bleed top bar.
//
// Kept around as an export because the header still has a `topBar`
// slot, and several non-landing routes (privacy / terms / returns)
// historically mounted the bar there. No longer used on `/` —
// replaced by <HeroLiveStatus /> inside the hero section.
// ───────────────────────────────────────────────────────────────────────

function Item({ item }: { item: TickerItem }) {
  const Icon = item.icon
  return (
    <span className="inline-flex items-center gap-2 px-6 text-[12px] font-medium tracking-wide text-white/85">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span>{item.text}</span>
      <span aria-hidden className="ml-4 text-white/25">·</span>
    </span>
  )
}

function Pill({
  icon: Icon,
  value,
  label,
  ariaLabel,
}: {
  icon: LucideIcon
  value: string | number
  label: string
  ariaLabel: string
}) {
  return (
    <span
      aria-label={ariaLabel}
      className="inline-flex shrink-0 items-center gap-1.5 border-l border-white/10 bg-slate-900/80 px-3 py-1.5 text-[11px] tabular-nums text-white/80"
    >
      <Icon className="h-3 w-3 text-primary" aria-hidden />
      <span className="font-semibold text-white">{value}</span>
      <span className="text-white/60">{label}</span>
    </span>
  )
}

export function LiveTicker() {
  // Hydration gate. The server renders a stable shell (no random
  // numbers, no time-based content). After mount we re-render with
  // the current client clock.
  const [mounted, setMounted] = useState(false)

  // The "now" anchor. Stored in state so the midnight-rollover
  // effect can re-render the strip with the new day's selection
  // without a full page reload.
  const [now, setNow] = useState<Date>(() => new Date(0))
  const [tradesServed, setTradesServed] = useState(0)
  const [lorriesOut, setLorriesOut] = useState(0)
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // First client render — populate the time-dependent state with
  // the actual current time and the matching initial values.
  useEffect(() => {
    const t = new Date()
    setNow(t)
    setTradesServed(getTradesServedToday(t))
    setLorriesOut(getLorriesOut(t))
    setMounted(true)
  }, [])

  // Ticking "trades served today" counter. Random 8–18s between
  // ticks so the counter feels organic, not metronomic. Cap at
  // 200 to avoid the strip eventually claiming the yard did 999
  // trades today.
  useEffect(() => {
    if (!mounted) return
    function tick() {
      setTradesServed((prev) => Math.min(prev + 1, 200))
      tickTimerRef.current = setTimeout(tick, 8000 + Math.random() * 10000)
    }
    tickTimerRef.current = setTimeout(tick, 5000 + Math.random() * 4000)
    return () => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current)
    }
  }, [mounted])

  // Daily + hourly refresh. Every minute, check whether the
  // day-of-year or hour has rolled over. If so, re-pick messages
  // and lorry count so a long-lived tab stays accurate.
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      const t = new Date()
      const dayChanged =
        t.getDate() !== now.getDate() || t.getMonth() !== now.getMonth()
      const hourChanged = t.getHours() !== now.getHours()
      if (dayChanged) {
        setNow(t)
        setTradesServed(getTradesServedToday(t))
      } else if (hourChanged) {
        setNow(t)
      }
      if (hourChanged) setLorriesOut(getLorriesOut(t))
    }, 60_000)
    return () => clearInterval(id)
  }, [mounted, now])

  const messages = useMemo(() => (mounted ? getDailyMessages(now) : []), [
    mounted,
    now,
  ])

  return (
    <div
      role="region"
      aria-label="Yard status updates"
      className="relative isolate w-full overflow-hidden border-b border-white/10 bg-slate-950/90 backdrop-blur"
    >
      {/* Brand-red top edge so the ticker reads as part of the same
          accent system as the header pill below it. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
      />

      <div className="flex h-10 items-stretch">
        {/* LIVE badge — pinned to the left, never scrolls. Doubles as
            the accessible label for the region via aria-label. */}
        <div className="flex shrink-0 items-center gap-2 border-r border-white/10 bg-slate-900/80 px-3.5">
          <span className="relative inline-flex h-2 w-2">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-primary animate-live-pulse-ring"
            />
            <span
              aria-hidden
              className="relative inline-flex h-2 w-2 rounded-full bg-primary animate-live-pulse"
            />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">
            Live
          </span>
        </div>

        {/* Marquee viewport. The pause-on-hover trick needs
            animation-play-state toggled on a parent so the keyframes
            keep their timing reference — pausing/restarting from a
            mid-frame would snap the strip back to translateX(0). */}
        <div
          className="group relative flex-1 overflow-hidden"
          onMouseEnter={(e) => {
            const el = e.currentTarget.querySelector<HTMLElement>('[data-ticker-strip]')
            if (el) el.style.animationPlayState = 'paused'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget.querySelector<HTMLElement>('[data-ticker-strip]')
            if (el) el.style.animationPlayState = 'running'
          }}
        >
          {mounted && messages.length > 0 ? (
            <div
              data-ticker-strip
              className="flex w-max animate-ticker-scroll whitespace-nowrap will-change-transform group-hover:[animation-play-state:paused]"
            >
              {/* Duplicate the list so translateX(-50%) lands seamlessly
                  on the second copy and the loop reads as continuous. */}
              {[...messages, ...messages].map((item, i) => (
                <Item key={i} item={item} />
              ))}
            </div>
          ) : (
            // SSR / pre-hydrate fallback. A single static copy of the
            // pool gives the bar measurable height without committing
            // to a specific day (which would hydration-mismatch).
            <div className="flex w-max whitespace-nowrap">
              {TICKER_POOL.slice(0, 4).map((item, i) => (
                <Item key={i} item={item} />
              ))}
            </div>
          )}

          {/* Soft fade-out at the right edge so the next copy doesn't
              pop in at a hard boundary. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-slate-950/90 to-transparent"
          />
        </div>

        {/* Right-side info pills. Live-updated, anchored. The labels
            double as accessible text via aria-label on each pill. */}
        {mounted && (
          <>
            <Pill
              icon={Truck}
              value={lorriesOut}
              label={lorriesOut === 1 ? 'lorry out' : 'lorries out'}
              ariaLabel={`${lorriesOut} ${lorriesOut === 1 ? 'lorry' : 'lorries'} currently out delivering`}
            />
            <Pill
              icon={Zap}
              value={tradesServed}
              label="trades today"
              ariaLabel={`${tradesServed} trades served today`}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// HeroLiveStatus — compact version that lives inside the hero.
//
// Layout strategy:
//   • Mobile  (<sm)   : a single, very compact pill — LIVE pulse, trades
//                       today count, lorries out count, and the current
//                       time-of-day status text. No marquee (the marquee
//                       was the part that looked broken on narrow phones).
//   • ≥sm            : same pill plus the current status text wraps onto
//                       its own line so the pill stays readable.
//   • ≥lg            : a thin marquee of yard-status messages joins the
//                       pill, giving the desktop the same "lots going on"
//                       feel the old top bar had — but tucked safely
//                       inside the hero on a background that already
//                       tolerates long text, instead of fighting with the
//                       header pill above it.
//
// Hydration / SSR:
//   • All time-dependent values flow through the `mounted` gate so the
//     SSR markup is deterministic. The first client render rehydrates to
//     the same shell, then swaps in real numbers one frame later.
// ───────────────────────────────────────────────────────────────────────

// Static LIVE dot — no animation. The pulsing/ring version was the
// only "moving" element left on the hero and it pulled attention
// away from the headline. A solid brand-red dot still reads as "live"
// without animating.
function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('relative inline-flex h-2 w-2 shrink-0', className)}
    >
      <span className="absolute inset-0 rounded-full bg-primary/35" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  )
}

function useLiveStatus() {
  const [mounted, setMounted] = useState(false)
  const [now, setNow] = useState<Date>(() => new Date(0))
  const [tradesServed, setTradesServed] = useState(0)
  const [lorriesOut, setLorriesOut] = useState(0)
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const t = new Date()
    setNow(t)
    setTradesServed(getTradesServedToday(t))
    setLorriesOut(getLorriesOut(t))
    setMounted(true)
  }, [])

  // Trades-served ticker — same 8–18s cadence as the legacy bar so the
  // experience feels identical once you spot it.
  useEffect(() => {
    if (!mounted) return
    function tick() {
      setTradesServed((prev) => Math.min(prev + 1, 200))
      tickTimerRef.current = setTimeout(tick, 8000 + Math.random() * 10000)
    }
    tickTimerRef.current = setTimeout(tick, 5000 + Math.random() * 4000)
    return () => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current)
    }
  }, [mounted])

  // Daily + hourly refresh. Same as the legacy bar so the two stay in
  // lockstep if anyone mounts both somewhere down the line.
  useEffect(() => {
    if (!mounted) return
    const id = setInterval(() => {
      const t = new Date()
      const dayChanged =
        t.getDate() !== now.getDate() || t.getMonth() !== now.getMonth()
      const hourChanged = t.getHours() !== now.getHours()
      if (dayChanged) {
        setNow(t)
        setTradesServed(getTradesServedToday(t))
      } else if (hourChanged) {
        setNow(t)
      }
      if (hourChanged) setLorriesOut(getLorriesOut(t))
    }, 60_000)
    return () => clearInterval(id)
  }, [mounted, now])

  // The lead "what's happening right now" message. Pick a stable
  // version pre-mount so SSR + first client paint match exactly.
  const leadMessage = useMemo(() => {
    if (!mounted) return TICKER_POOL[0]
    const doy = dayOfYear(now)
    const rng = mulberry32(doy * 1301 + 7)
    return getTimeMessage(now, rng)
  }, [mounted, now])

  // The marquee message list (desktop only). Same daily-rotating
  // selection as the legacy bar.
  const messages = useMemo(() => (mounted ? getDailyMessages(now) : []), [
    mounted,
    now,
  ])

  return { mounted, now, lorriesOut, tradesServed, leadMessage, messages }
}

interface HeroLiveStatusProps {
  variant?: 'hero' | 'topbar'
}

export function HeroLiveStatus({ variant = 'hero' }: HeroLiveStatusProps) {
  const { mounted, lorriesOut, tradesServed, leadMessage } = useLiveStatus()
  const LeadIcon = leadMessage.icon

  const pill = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5',
        'text-[10px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur',
        'sm:text-[11px]',
      )}
    >
      <LiveDot />
      <span>Live</span>
      <span aria-hidden className="h-3 w-px bg-white/20" />
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Truck className="h-3 w-3 text-primary" aria-hidden />
        <span className="text-white">{mounted ? lorriesOut : 0}</span>
        <span className="font-medium text-white/70">
          {mounted && lorriesOut === 1 ? 'lorry out' : 'lorries out'}
        </span>
      </span>
      <span aria-hidden className="h-3 w-px bg-white/20" />
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Zap className="h-3 w-3 text-primary" aria-hidden />
        <span className="text-white">{mounted ? tradesServed : 0}</span>
        <span className="font-medium text-white/70">trades today</span>
      </span>
    </span>
  )

  const status = (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/80 sm:text-xs">
      <LeadIcon className="h-3.5 w-3.5 text-primary" aria-hidden />
      {leadMessage.text}
    </span>
  )

  if (variant === 'topbar') {
    return (
      <div
        role="region"
        aria-label="Yard status — live"
        className="w-full border-b border-white/10 bg-slate-950/90 backdrop-blur"
      >
        <div className="mx-auto flex h-10 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {pill}
          <span className="hidden sm:inline-flex">{status}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Yard status — live"
      className="flex w-full flex-col items-start gap-2"
    >
      <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-2">
        {pill}
        {status}
      </div>
    </div>
  )
}

export const HeroLiveTopBar = (props: Omit<HeroLiveStatusProps, 'variant'>) => (
  <HeroLiveStatus variant="topbar" {...props} />
)

// ───────────────────────────────────────────────────────────────────────
// HeroLiveCards — rounded cards that live inside the hero body.
//
// Moves the live yard numbers (lorries out, trades today) and the
// time-of-day status message off the thin top bar and into two rounded,
// glass-morphism cards placed between the H1 and the body copy.
// ───────────────────────────────────────────────────────────────────────

export function HeroLiveCards() {
  const { mounted, lorriesOut, tradesServed, leadMessage } = useLiveStatus()
  const LeadIcon = leadMessage.icon

  return (
    <div
      role="region"
      aria-label="Yard status — live"
      className="flex w-full flex-wrap items-stretch gap-3"
    >
      {/* Live stats card: lorry count + trades served today. */}
      <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <LiveDot />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white">
            Live
          </span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Truck className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-sm font-semibold text-white">
            {mounted ? lorriesOut : 0}
          </span>
          <span className="text-[11px] font-medium text-white/70">
            {mounted && lorriesOut === 1 ? 'lorry out' : 'lorries out'}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Zap className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="text-sm font-semibold text-white">
            {mounted ? tradesServed : 0}
          </span>
          <span className="text-[11px] font-medium text-white/70">trades today</span>
        </span>
      </div>

      {/* Status card: time-of-day message such as "Closed for the day". */}
      <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
        <LeadIcon className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
          {leadMessage.text}
        </span>
      </div>
    </div>
  )
}