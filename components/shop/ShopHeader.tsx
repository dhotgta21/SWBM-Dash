// components/shop/ShopHeader.tsx
// Shared header for /quote, /cart, /cart/checkout. Kept in sync with
// components/landing/SiteHeader.tsx so the nav experience stays
// consistent across the public site — see that file for design notes.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ChevronDown,
  LogIn,
  Menu,
  Phone,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { cn } from '@/lib/utils'
import { telHref } from '@/lib/company'

interface ShopHeaderProps {
  phone?: string | null
}

type NavItem = { href: string; label: string; description?: string }

type NavGroup = {
  label: string
  items: readonly NavItem[]
}

// Catalogue stays flat (it's the main browse surface).
const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/catalogue', label: 'Catalogue' },
]

// Sits at the tail of the rail (after the dropdown groups) so trade
// customers can jump straight to calculators and quoting tools.
const TRAILING_NAV: readonly NavItem[] = [
  {
    href: '/tools',
    label: 'Tools',
    description: 'Calculators and quoting apps',
  },
]

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'About',
    items: [
      {
        href: '/about',
        label: 'About',
        description: 'Meet the team behind the yard',
      },
      {
        href: '/services',
        label: 'Services',
        description: 'Trade & DIY supply, same-day delivery',
      },
      {
        href: '/contact',
        label: 'Contact',
        description: 'Phone, email, or visit the yard',
      },
    ],
  },
  {
    label: 'Resources',
    items: [
      {
        href: '/guides',
        label: 'Guides',
        description: 'How-to articles for the trade',
      },
      {
        href: '/case-studies',
        label: 'Case studies',
        description: 'Recent jobs we have supplied',
      },
      {
        href: '/blog',
        label: 'Blog',
        description: 'News, pricing, and updates',
      },
    ],
  },
]

// Mobile: mirror the desktop groups with stacked sub-headings so the
// structure reads the same on small screens. The top-level standalone
// links (Catalogue + Tools) sit under a shared "Browse" section.
const MOBILE_NAV: readonly NavGroup[] = [
  { label: 'Browse', items: [...PRIMARY_NAV, ...TRAILING_NAV] },
  ...NAV_GROUPS,
]

function scrollToSection(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function isHomePageSectionLink(href: string): boolean {
  return href.startsWith('/#')
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname || isHomePageSectionLink(href)) return false
  if (pathname === href) return true
  if (href !== '/' && pathname.startsWith(`${href}/`)) return true
  return false
}

function isGroupActive(pathname: string | null, group: NavGroup): boolean {
  if (!pathname) return false
  return group.items.some((item) => isActive(pathname, item.href))
}

/**
 * Top-level nav item that opens a hover/click panel of child links.
 *
 * Behaviour:
 *   - Mouse enter  → open
 *   - Mouse leave  → close after a short delay (so users can move into
 *                    the panel without it slamming shut)
 *   - Click        → toggle
 *   - Escape       → close
 *   - Click outside→ close
 *   - Route change → close (effect on `pathname`)
 */
function NavDropdown({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string | null
}) {
  const [openByClick, setOpenByClick] = useState(false)
  const [hovered, setHovered] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const active = isGroupActive(pathname, group)

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  function scheduleClose() {
    cancelClose()
    closeTimer.current = setTimeout(() => {
      setHovered(false)
    }, 150)
  }

  useEffect(() => () => cancelClose(), [])

  useEffect(() => {
    if (!openByClick) return
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpenByClick(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenByClick(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openByClick])

  // Close on route change so we don't appear stuck open after navigation.
  // Store the latest pathname in state and reset open state during render
  // (React discards the in-flight render and immediately re-renders with
  // the new state — no setState-in-effect needed).
  const [trackedPathname, setTrackedPathname] = useState(pathname)
  if (pathname !== trackedPathname) {
    setTrackedPathname(pathname)
    setOpenByClick(false)
    setHovered(false)
  }

  const shown = openByClick || hovered

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose()
        setHovered(true)
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpenByClick((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'group inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
          active
            ? 'bg-white text-foreground shadow-sm shadow-black/5'
            : 'text-foreground/70 hover:text-foreground'
        )}
      >
        {group.label}
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            shown && 'rotate-180',
            active ? 'text-foreground/60' : 'text-foreground/40'
          )}
        />
      </button>

      <div
        role="menu"
        className={cn(
          'absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 origin-top rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl shadow-slate-900/10 ring-1 ring-black/5 transition-all duration-150',
          shown
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0'
        )}
      >
        {group.items.map((item) => {
          const itemActive = isActive(pathname, item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              role="menuitem"
              aria-current={itemActive ? 'page' : undefined}
              onClick={(e) => {
                setOpenByClick(false)
                setHovered(false)
                if (isHomePageSectionLink(item.href)) {
                  const currentPath =
                    pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null)
                  if (currentPath === '/') {
                    e.preventDefault()
                    scrollToSection(item.href.replace('/#', ''))
                  }
                }
              }}
              className={cn(
                'group flex flex-col rounded-xl px-3 py-2.5 transition-colors',
                itemActive
                  ? 'bg-secondary text-foreground'
                  : 'text-foreground/85 hover:bg-secondary hover:text-foreground'
              )}
            >
              <span className="flex items-center justify-between text-sm font-medium">
                {item.label}
                <ArrowRight
                  aria-hidden
                  className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                />
              </span>
              {item.description && (
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {item.description}
                </span>
              )}
            </a>
          )
        })}
      </div>
    </div>
  )
}

export function ShopHeader({ phone }: ShopHeaderProps = {}) {
  const hasPhone = Boolean(phone?.trim())
  const phoneDisplay = hasPhone ? phone!.trim() : ''
  const phoneHref = hasPhone ? telHref(phoneDisplay) : ''
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!mobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileOpen])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const handleMobileNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!isHomePageSectionLink(href)) return
      const currentPath =
        pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null)
      if (currentPath !== '/') return
      e.preventDefault()
      scrollToSection(href.replace('/#', ''))
    },
    [pathname]
  )

  return (
    <div className="fixed top-0 left-0 right-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4 lg:px-8">
      <header
        className={cn(
          'relative mx-auto flex max-w-7xl items-center gap-2 sm:gap-3',
          'rounded-2xl border border-border/70 bg-white/95 pl-3 pr-2 py-2',
          'shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18),0_2px_6px_-2px_rgba(15,23,42,0.06)]',
          'backdrop-blur-md supports-[backdrop-filter]:bg-white/80',
          'transition-shadow duration-300',
          'sm:pl-4 sm:pr-2.5'
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 h-[2px] rounded-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-90"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 right-12 z-0 hidden w-40 rounded-full bg-primary/10 blur-2xl lg:block"
        />

        <Link
          href="/"
          className="relative z-10 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <BrandLogo variant="horizontal" />
        </Link>

        {/* Desktop nav — sits in the middle flex slot so the rail stays
            centred between the logo and the right cluster at any width.
            Hides on < lg so the mobile trigger can take over. */}
        <nav
          aria-label="Primary"
          className="relative z-10 hidden min-w-0 flex-1 items-center justify-center lg:flex"
        >
          <ul className="flex items-center rounded-full border border-border/70 bg-secondary/60 p-1">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href} className="flex list-none">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                      active
                        ? 'bg-white text-foreground shadow-sm shadow-black/5'
                        : 'text-foreground/70 hover:text-foreground'
                    )}
                  >
                    {item.label}
                    {!active && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-3 -bottom-0.5 h-[2px] origin-left scale-x-0 rounded-full bg-primary transition-transform duration-200 group-hover:scale-x-100"
                      />
                    )}
                  </Link>
                </li>
              )
            })}
            {NAV_GROUPS.map((group) => (
              <li key={group.label} className="flex list-none">
                <NavDropdown group={group} pathname={pathname} />
              </li>
            ))}
            {TRAILING_NAV.map((item) => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href} className="flex list-none">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative inline-flex items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200',
                      active
                        ? 'bg-white text-foreground shadow-sm shadow-black/5'
                        : 'text-foreground/70 hover:text-foreground'
                    )}
                  >
                    {item.label}
                    {!active && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-3 -bottom-0.5 h-[2px] origin-left scale-x-0 rounded-full bg-primary transition-transform duration-200 group-hover:scale-x-100"
                      />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="relative z-10 hidden shrink-0 items-center gap-1.5 md:flex md:gap-2">
          {hasPhone && (
            <a
              href={phoneHref}
              className={cn(
                'group hidden items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1.5 text-sm font-semibold text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground xl:inline-flex',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]'
              )}
              aria-label={`Call the trade counter on ${phoneDisplay}`}
            >
              <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Phone className="h-3.5 w-3.5" />
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/30 opacity-60" />
              </span>
              <span className="tabular-nums tracking-tight">{phoneDisplay}</span>
            </a>
          )}

          <Link
            href="/quote"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground',
              'shadow-[0_8px_18px_-8px_rgba(185,28,28,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]',
              'transition-all duration-200 hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_12px_24px_-8px_rgba(185,28,28,0.6)]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
            )}
          >
            Get a quote
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className={cn(
              'group inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground/85',
              'shadow-sm transition-colors hover:border-primary/40 hover:text-foreground hover:bg-secondary',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
            )}
          >
            <LogIn className="h-4 w-4 text-foreground/60 transition-colors group-hover:text-primary" />
            Client portal
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className={cn(
            'relative z-10 ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-secondary md:hidden',
            mobileOpen && 'bg-secondary text-foreground'
          )}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-shop-nav"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      <div
        id="mobile-shop-nav"
        className={cn(
          'md:hidden',
          mobileOpen
            ? 'pointer-events-auto fixed inset-0 z-50'
            : 'pointer-events-none fixed inset-0 z-50'
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={closeMobile}
          tabIndex={mobileOpen ? 0 : -1}
          className={cn(
            'absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
        />

        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className={cn(
            'absolute inset-x-3 bottom-3 top-[68px] flex origin-top flex-col overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-2xl shadow-slate-900/20 transition-all duration-300 sm:inset-x-4 sm:top-[76px]',
            'max-h-[calc(100dvh-80px)]',
            mobileOpen
              ? 'translate-y-0 opacity-100'
              : '-translate-y-3 opacity-0'
          )}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-1.5 py-1">
            {MOBILE_NAV.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href)
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          onClick={(e) => {
                            closeMobile()
                            handleMobileNavClick(e, item.href)
                          }}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors',
                            active
                              ? 'bg-primary-muted text-primary'
                              : 'text-foreground/85 hover:bg-secondary hover:text-foreground'
                          )}
                        >
                          <span className="flex flex-col text-left">
                            <span className="text-base font-medium">{item.label}</span>
                            {item.description && (
                              <span className="mt-0.5 text-xs text-muted-foreground">
                                {item.description}
                              </span>
                            )}
                          </span>
                          <ArrowRight
                            className={cn(
                              'h-4 w-4 shrink-0 transition-transform',
                              active ? 'text-primary' : 'text-foreground/30'
                            )}
                          />
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* Pinned CTA cluster — same pattern as SiteHeader: shrink-0
              keeps the buttons visible even when the nav list overflows,
              and `pb-[max(...env(safe-area-inset-bottom))]` keeps them
              clear of the iOS home indicator. */}
          <div className="mt-3 grid shrink-0 gap-2 border-t border-border pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {hasPhone && (
              <a
                href={phoneHref}
                onClick={closeMobile}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Phone className="h-4 w-4" />
                </span>
                <span className="tabular-nums">{phoneDisplay}</span>
              </a>
            )}
            <Link
              href="/quote"
              onClick={closeMobile}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_22px_-10px_rgba(185,28,28,0.55)]"
            >
              Get a quote
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              onClick={closeMobile}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm"
            >
              <LogIn className="h-4 w-4 text-foreground/60" />
              Client portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
