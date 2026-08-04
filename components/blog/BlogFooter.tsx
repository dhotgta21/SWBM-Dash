// components/blog/BlogFooter.tsx
// Lightweight footer for the blog routes. Deliberately thin and
// light so it doesn't compete with or look like the marketing
// SiteFooter on the home page. Just a single bar with the company
// line, a couple of legal links, and the same trusted NAP
// (Name / Address / Phone) the home page surfaces — but laid out
// inline instead of as a multi-column dark block.

import Link from 'next/link'
import { telHref, mailtoHref } from '@/lib/company'

interface BlogFooterProps {
  readonly companyName: string
  readonly year: number
  readonly phone: string
  readonly email: string
  readonly phones?: string[]
  readonly emails?: string[]
}

export function BlogFooter({ companyName, year, phone, email, phones, emails }: BlogFooterProps) {
  const phoneValue = phones && phones.length > 0 ? phones[0] : phone
  const emailValue = emails && emails.length > 0 ? emails[0] : email
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold text-foreground">{companyName}</span>
          <span aria-hidden className="hidden h-3 w-px bg-border sm:inline-block" />
          <a
            href={telHref(phoneValue)}
            className="font-semibold text-foreground transition-colors hover:text-primary"
          >
            {phoneValue}
          </a>
          <span aria-hidden className="hidden h-3 w-px bg-border sm:inline-block" />
          <a
            href={mailtoHref(emailValue)}
            className="font-semibold text-foreground transition-colors hover:text-primary"
          >
            {emailValue}
          </a>
        </div>

        <nav
          aria-label="Legal"
          className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
        >
          <Link href="/" className="transition-colors hover:text-primary">
            Home
          </Link>
          <Link href="/about" className="transition-colors hover:text-primary">
            About
          </Link>
          <Link href="/services" className="transition-colors hover:text-primary">
            Trade services
          </Link>
          <Link href="/tools" className="transition-colors hover:text-primary">
            Tools
          </Link>
          <Link href="/guides" className="transition-colors hover:text-primary">
            Guides
          </Link>
          <Link href="/glossary" className="transition-colors hover:text-primary">
            Glossary
          </Link>
          <Link href="/contact" className="transition-colors hover:text-primary">
            Contact
          </Link>
          <Link href="/locations" className="transition-colors hover:text-primary">
            Delivery areas
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-primary">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-primary">
            Terms
          </Link>
          <Link href="/login" className="transition-colors hover:text-primary">
            Staff sign-in
          </Link>
        </nav>

        {/* Copyright left, Made by Humnod centre, legal already above */}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 text-xs text-muted-foreground/70 sm:grid-cols-3 sm:items-center">
          <p className="text-center sm:text-left">
            &copy; {year} {companyName}
          </p>
          <p className="inline-flex items-center justify-center gap-1.5">
            Made by
            <a
              href="https://www.humnod.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-primary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/partners/humnod-logo.svg"
                alt=""
                className="h-3.5 w-3.5"
                loading="lazy"
              />
              humnod
            </a>
          </p>
          <p className="text-center sm:text-right">
            <Link href="/privacy" className="transition-colors hover:text-primary">
              Privacy
            </Link>
            <span className="mx-2 text-border" aria-hidden>
              ·
            </span>
            <Link href="/terms" className="transition-colors hover:text-primary">
              Terms
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}