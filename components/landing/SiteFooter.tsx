// components/landing/SiteFooter.tsx
// Marketing-site footer. Multi-column layout so visitors always have a
// next click (categories, sections, contact, legal) and so the page
// closes with the same density the header opens with.
//
// What's on it (and why each block earns its space):
//
//   1. Brand block — name, tagline, opening hours, trust line, social
//      profiles. Anchors the rest of the footer visually and reinforces
//      the locality signal one last time before the page ends.
//   2. Sitemap — internal anchors to the page sections and the legal
//      pages. Keeps the visitor a click away from anywhere they
//      haven't explored.
//   3. Top categories — the same categories the grid up the page uses.
//      Footer links reinforce SEO and give visitors a shortcut back
//      into the catalogue.
//   4. Service areas — a short, curated list of delivery towns. Each
//      links to a deep anchor on the page so visitors who only want
//      to confirm coverage can do so in one click.
//   5. Contact block — NAP (Name, Address, Phone) with tap-to-call
//      and tap-to-email. Carries the local-SEO signal Google expects
//      and is the final reminder that the trade counter is the
//      fastest route to a price.
//
// The bottom bar is reserved for the copyright, legal links and the
// coverage-area tagline so it stays dense but not crowded.

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Phone, Mail, MapPin, Clock } from 'lucide-react'
import { telHref, mailtoHref } from '@/lib/company'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { slugifyCategory } from '@/lib/public-products'
import {
  iconForSocialUrl,
  labelForSocialUrl,
} from '@/components/settings/socialPlatforms'
import type { DeliveryArea } from './DeliveryAreas'

function scrollToSection(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function isHomePageSectionLink(href: string): boolean {
  return href.startsWith('/#')
}

interface CategoryLink {
  name: string
  productCount: number
}

interface SiteFooterProps {
  companyName: string
  year: number
  phones: string[]
  emails: string[]
  addressLines: string[]
  hours: string
  categories: CategoryLink[]
  areas: DeliveryArea[]
  /** Social / identity URLs from the company_settings row (Facebook,
   *  Instagram, LinkedIn, Google Business Profile, etc.). Used for
   *  the "follow us" row in the brand block and the LocalBusiness
   *  schema. */
  sameAs?: string[]
  /** Set of town slugs that have a dedicated /locations/{slug} landing
   *  page. When a slug exists, the footer chip links directly to it
   *  instead of scrolling to the home-page delivery-areas anchor. */
  locationSlugs?: Set<string>
}

// How many of each list to surface. The full lists live on the page
// sections above; the footer is a curated shortcut, not a sitemap.
const MAX_CATEGORIES = 8
const MAX_AREAS = 12

export function SiteFooter({
  companyName,
  year,
  phones,
  emails,
  addressLines,
  hours,
  categories,
  areas,
  sameAs = [],
  locationSlugs = new Set<string>(),
}: SiteFooterProps) {
  const pathname = usePathname()

  const handleAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!isHomePageSectionLink(href)) return
    const currentPath =
      pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null)
    if (currentPath !== '/') return
    e.preventDefault()
    scrollToSection(href.replace('/#', ''))
  }
  const topCategories = categories.slice(0, MAX_CATEGORIES)
  const topAreas = areas.slice(0, MAX_AREAS)
  // Curated, deduped set of social / identity URLs. The hostname tells
  // us which platform it is for the accessible label; the icon stays
  // a neutral Globe so we never render a misleading brand mark.
  const socials = Array.from(new Set(sameAs))

  return (
    <footer className="border-t-4 border-primary bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        {/* Footer H2 — gives crawlers a single, unambiguous footer topic.
            Visible because the brand block below carries the mark + a
            tagline so users get a visual anchor too. */}
        <h2 className="sr-only">{companyName} &mdash; site footer</h2>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Brand block */}
          <div className="lg:col-span-4">
            <div className="rounded-xl bg-background p-3 inline-block">
              <BrandLogo variant="horizontal" />
            </div>
            <p className="mt-5 text-sm leading-relaxed text-white/75">
              Local builders merchant for trade and DIY. Stocked in depth
              and delivered across the South East.
            </p>

            <div className="mt-6 space-y-3 text-sm">
              <p className="flex items-start gap-3 text-white/80">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="block font-semibold text-white">Opening hours</span>
                  <span className="block text-white/70">{hours}</span>
                </span>
              </p>

              {/* Trade-counter address — wrapped in <address> so search
                  engines (and screen readers) can recognise it as the
                  site's NAP. Carries itemProp / itemScope for extra
                  local-SEO signal. */}
              <address
                itemScope
                itemType="https://schema.org/PostalAddress"
                className="not-italic"
              >
                <p className="flex items-start gap-3 text-white/80">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="block font-semibold text-white">Trade counter</span>
                    <span className="block text-white/70">
                      {addressLines.map((line, i) => (
                        <span
                          key={i}
                          className="block"
                          itemProp={
                            i === 0
                              ? 'streetAddress'
                              : ['addressLocality', 'addressRegion', 'postalCode'][i - 1] ?? undefined
                          }
                        >
                          {line}
                        </span>
                      ))}
                    </span>
                  </span>
                </p>
              </address>
            </div>

            {socials.length > 0 && (
              <div className="mt-6">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/60">
                  Follow {companyName}
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {socials.map((url) => {
                    const SocialIcon = iconForSocialUrl(url)
                    const label = labelForSocialUrl(url)
                    return (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${companyName} on ${label}`}
                        title={label}
                        className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-xs text-white/80 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <SocialIcon className="h-3.5 w-3.5" />
                        <span className="font-medium">{label}</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Sitemap */}
          <nav
            aria-label="Footer sitemap"
            className="lg:col-span-2"
          >
            <FooterColumnTitle>Sitemap</FooterColumnTitle>
            <ul className="mt-5 space-y-2.5 text-sm">
              <FooterLink href="/catalogue">Catalogue</FooterLink>
              <FooterLink href="/quote">Get a quote</FooterLink>
              <FooterLink href="/about">About</FooterLink>
              <FooterLink href="/services">Services</FooterLink>
              <FooterLink href="/tools">Tools</FooterLink>
              <FooterLink href="/guides">Guides</FooterLink>
              <FooterLink href="/delivery">Delivery</FooterLink>
              <FooterLink href="/trade-account">Trade account</FooterLink>
              <FooterLink href="/reviews">Reviews</FooterLink>
              <FooterLink href="/glossary">Glossary</FooterLink>
              <FooterLink href="/sustainability">Sustainability</FooterLink>
              <FooterLink href="/contact">Contact</FooterLink>
              <FooterLink href="/case-studies">Case studies</FooterLink>
              <FooterLink href="/blog">Blog</FooterLink>
            </ul>
          </nav>

          {/* Top categories */}
          <nav
            aria-label="Featured catalogue lines"
            className="lg:col-span-3"
          >
            <FooterColumnTitle>From the catalogue</FooterColumnTitle>
            <ul className="mt-5 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 lg:grid-cols-1">
              {topCategories.length > 0 ? (
                topCategories.map((c) => (
                  <li key={c.name}>
                    <Link
                      href={`/quote/${slugifyCategory(c.name)}`}
                      className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 text-xs text-white/40 group-hover:text-primary">
                        {c.productCount}
                      </span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className="text-sm text-white/60">
                  Browse the full catalogue on our{' '}
                  <Link href="/catalogue" className="font-semibold text-white hover:text-primary">
                    catalogue
                  </Link>
                  .
                </li>
              )}
            </ul>
          </nav>

          {/* Top service areas + contact */}
          <div className="lg:col-span-3">
            <nav aria-label="Top service areas">
              <FooterColumnTitle>Top service areas</FooterColumnTitle>
              <ul className="mt-5 flex flex-wrap gap-2 text-xs">
                {topAreas.map((area) => {
                  const hasLocationPage = locationSlugs.has(area.slug)
                  return (
                    <li key={area.slug}>
                      <Link
                        href={hasLocationPage ? `/locations/${area.slug}` : '/#delivery-areas'}
                        onClick={(e) => {
                          if (hasLocationPage) return
                          handleAnchorClick(e, '/#delivery-areas')
                        }}
                        className="inline-flex items-center rounded-full border border-white/15 px-3 py-1.5 text-white/80 transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        {area.name}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <section
              aria-label="Contact details"
              itemScope
              itemType="https://schema.org/LocalBusiness"
              className="mt-6"
            >
              <FooterColumnTitle>Contact</FooterColumnTitle>
              <ul className="mt-3 space-y-2.5 text-sm">
                {phones.map((phone) => (
                  <li key={phone}>
                    <a
                      href={telHref(phone)}
                      itemProp="telephone"
                      className="group flex items-center gap-2.5 text-white transition-colors hover:text-primary"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-primary" />
                      <span className="font-semibold">{phone}</span>
                    </a>
                  </li>
                ))}
                {emails.map((email) => (
                  <li key={email}>
                    <a
                      href={mailtoHref(email)}
                      itemProp="email"
                      className="group flex items-center gap-2.5 break-all text-white transition-colors hover:text-primary"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-primary" />
                      <span className="font-semibold">{email}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <meta itemProp="name" content={companyName} />
            </section>
          </div>
        </div>
      </div>

      {/* Bottom bar: copyright left, Made by Humnod centre, legal right */}
      <div className="border-t border-white/10">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 text-xs text-white/60 sm:grid-cols-3 sm:items-center sm:gap-3 sm:px-6 lg:px-8">
          <p className="text-center sm:text-left">
            &copy; {year} {companyName}. All rights reserved.
          </p>
          <p className="inline-flex items-center justify-center gap-1.5">
            Made by
            <a
              href="https://www.humnod.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-white/80 transition-colors hover:text-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/partners/humnod-logo.svg"
                alt=""
                className="h-4 w-4"
                loading="lazy"
              />
              humnod
            </a>
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-end"
          >
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/returns" className="hover:text-white">
              Returns
            </Link>
            <Link href="/login" className="hover:text-white">
              Staff sign-in
            </Link>
            <span className="hidden text-white/30 md:inline">·</span>
            <span className="hidden md:inline">
              Builders merchant - serving the South East.
            </span>
          </nav>
        </div>
      </div>
    </footer>
  )
}

function FooterColumnTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-white">
      {children}
    </h3>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isHomePageSectionLink(href)) return
    const currentPath =
      pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null)
    if (currentPath !== '/') return
    e.preventDefault()
    scrollToSection(href.replace('/#', ''))
  }

  return (
    <li>
      <a
        href={href}
        onClick={handleClick}
        className="text-white/80 transition-colors hover:text-primary"
      >
        {children}
      </a>
    </li>
  )
}
