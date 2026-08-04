// components/blog/BlogToc.tsx
// Professional table of contents for case-study pages.
//
// Features:
//   - Numbered indicators with an animated rail showing scroll progress
//     through the article
//   - Active-section detection via IntersectionObserver so the reader
//     always sees where they are
//   - Visual hierarchy: H2 sections get a numbered chip, H3 sections
//     get a smaller bullet and indent
//   - Dark theme to match the page hero + CTA (so the sidebar doesn't
//     visually compete with the body content)
//   - Sticky sidebar that stays vertically centred in the viewport
//     while remaining inside the white content column
//   - Scrollable list area for long TOCs so the card never exceeds
//     the viewport
//   - Back-to-top button at the bottom
//   - Hidden on mobile (the body already scrolls well on narrow
//     viewports)
//
// Implemented as a client component so we can attach the
// IntersectionObserver and update the sticky position. The parent
// server component passes the pre-computed `items` list.

'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ListTree } from 'lucide-react'
import type { TocItem } from '@/lib/blog/render'

interface BlogTocProps {
  readonly items: readonly TocItem[]
}

export function BlogToc({ items }: BlogTocProps) {
  const [activeId, setActiveId] = useState<string>(items[0]?.id ?? '')
  const [progress, setProgress] = useState(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const asideRef = useRef<HTMLElement | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null)
  const tickingRef = useRef(false)

  // Dynamically position the sticky TOC card so it stays vertically
  // centred in the viewport but never leaves the white content column
  // or the visible viewport.
  useEffect(() => {
    function updatePosition() {
      const aside = asideRef.current
      const nav = navRef.current
      if (!aside || !nav) return

      const asideRect = aside.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const cardHeight = nav.offsetHeight

      // The card must never sit below the bottom of the content column
      // or below the bottom edge of the viewport.
      const minTop = asideRect.top
      const maxTopFromColumn = asideRect.bottom - cardHeight
      const maxTopFromViewport = viewportHeight - cardHeight
      const maxTop = Math.min(maxTopFromColumn, maxTopFromViewport)

      let top: number

      if (cardHeight > viewportHeight) {
        // Card is taller than the viewport: pin it to the top of the
        // viewport/content so the internal scrollable list is usable.
        top = Math.max(minTop, 0)
      } else {
        // Centre the card in the viewport.
        top = viewportHeight / 2 - cardHeight / 2
        if (top < minTop) top = minTop
      }

      if (top > maxTop) top = maxTop
      if (maxTop < minTop) top = minTop // column shorter than card

      nav.style.top = `${top}px`
      tickingRef.current = false
    }

    function onScroll() {
      if (tickingRef.current) return
      tickingRef.current = true
      requestAnimationFrame(updatePosition)
    }

    updatePosition()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  // Wire up IntersectionObserver to track which section is currently
  // in view. We watch every H2/H3 that has a slug id.
  useEffect(() => {
    if (items.length === 0) return
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el))

    if (headings.length === 0) return

    // Track which headings are visible. The topmost visible heading
    // (within the upper half of the viewport) is the "active" one.
    const visibility = new Map<string, number>()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio)
        }
        // Pick the first heading (by DOM order) that has any visible
        // ratio > 0 — that's the one closest to the top of the
        // viewport.
        for (const it of items) {
          const ratio = visibility.get(it.id) ?? 0
          if (ratio > 0) {
            setActiveId(it.id)
            break
          }
        }
      },
      {
        // Top margin accounts for the sticky header (~80px). Bottom
        // margin keeps the "active" heading from flipping as soon as
        // the next one peeks above the bottom.
        rootMargin: '-80px 0px -65% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    )

    for (const h of headings) observerRef.current.observe(h)
    return () => {
      observerRef.current?.disconnect()
    }
  }, [items])

  // Keep the active item visible inside the scrollable TOC list. We
  // only scroll when it moves outside the visible list area, and we
  // use an instant scroll so it never fights the user's page scrolling.
  useEffect(() => {
    const container = listContainerRef.current
    const link = activeLinkRef.current
    if (!container || !link) return

    const containerRect = container.getBoundingClientRect()
    const linkRect = link.getBoundingClientRect()

    const isAbove = linkRect.top < containerRect.top
    const isBelow = linkRect.bottom > containerRect.bottom

    if (isAbove || isBelow) {
      link.scrollIntoView({ behavior: 'auto', block: 'nearest' })
    }
  }, [activeId])

  // Track overall page scroll progress for the rail bar.
  useEffect(() => {
    function onScroll() {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) {
        setProgress(0)
        return
      }
      setProgress(Math.min(100, Math.max(0, (scrollTop / docHeight) * 100)))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (items.length === 0) return null

  // Build a sequence: enumerate only H2s in the main numbers, and
  // label H3s with a sub-index based on the most recent H2.
  const enriched: Array<TocItem & { display: string }> = []
  let h2Index = 0
  let h3Index = 0
  for (const it of items) {
    if (it.level === 2) {
      h2Index += 1
      h3Index = 0
      enriched.push({ ...it, display: String(h2Index).padStart(2, '0') })
    } else {
      h3Index += 1
      enriched.push({ ...it, display: `${h2Index}.${h3Index}` })
    }
  }

  return (
    <aside
      ref={asideRef}
      aria-label="Table of contents"
      className="hidden h-full lg:block"
    >
      <nav
        ref={navRef}
        aria-label="Article sections"
        className="sticky top-28 overflow-hidden rounded-2xl border border-white/10 bg-foreground text-background shadow-xl shadow-black/20"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
            >
              <ListTree className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] text-white">
              On this page
            </h2>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">
            {items.length} {items.length === 1 ? 'section' : 'sections'}
          </span>
        </div>

        {/* Progress rail + numbered list */}
        <div
          ref={listContainerRef}
          className="relative max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 hover:[&::-webkit-scrollbar-thumb]:bg-white/40"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.25) rgba(255,255,255,0.05)',
          }}
        >
          {/* Vertical progress bar — sits behind the items, fills as
              you scroll. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 h-full w-px bg-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 w-px bg-primary transition-[height] duration-150 ease-out"
            style={{ height: `${progress}%` }}
          />

          <ol className="relative space-y-0.5 py-3">
            {enriched.map((it) => {
              const isActive = it.id === activeId
              const isH3 = it.level === 3
              return (
                <li key={it.id}>
                  <a
                    ref={isActive ? activeLinkRef : undefined}
                    href={`#${it.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={[
                      'group relative flex items-center gap-3 px-5 py-2.5 text-sm transition-colors',
                      isH3 ? 'pl-12' : 'pl-5',
                      isActive
                        ? 'text-white'
                        : 'text-white/55 hover:text-white/90',
                    ].join(' ')}
                  >
                    {/* Active rail indicator — solid bar that pops in
                        next to the active item. */}
                    <span
                      aria-hidden
                      className={[
                        'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      ].join(' ')}
                    />

                    {/* Number / sub-number chip */}
                    <span
                      className={[
                        'inline-flex shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold tracking-tight transition-colors',
                        isH3 ? 'h-5 w-5' : 'h-6 w-7',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isH3
                          ? 'bg-white/10 text-white/55 group-hover:bg-white/15 group-hover:text-white/80'
                          : 'bg-white/10 text-white/70 group-hover:bg-white/15 group-hover:text-white',
                      ].join(' ')}
                    >
                      {it.display}
                    </span>

                    {/* Section label */}
                    <span
                      className={[
                        'truncate',
                        isH3 ? 'text-[13px]' : 'text-sm font-semibold',
                      ].join(' ')}
                    >
                      {it.text}
                    </span>
                  </a>
                </li>
              )
            })}
          </ol>
        </div>

        {/* Footer — reading progress + back-to-top */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <div className="flex flex-1 items-center gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
              Read
            </span>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-white/70">
              {Math.round(progress)}%
            </span>
          </div>
          <a
            href="#top"
            aria-label="Back to top"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-white/70 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </a>
        </div>
      </nav>
    </aside>
  )
}
