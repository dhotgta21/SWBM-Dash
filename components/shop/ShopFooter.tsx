// components/shop/ShopFooter.tsx
// Shop footer with compact NAP (Name, Address, Phone) and LocalBusiness
// microdata so every quote/catalogue/product page carries a local-SEO signal.

import { Phone, Mail, MapPin, Clock } from 'lucide-react'
import { telHref, mailtoHref } from '@/lib/company'

interface ShopFooterProps {
  companyName: string
  year: number
  phone?: string | null
  email?: string | null
  addressLines?: string[]
  hours?: string | null
}

export function ShopFooter({
  companyName,
  year,
  phone,
  email,
  addressLines = [],
  hours,
}: ShopFooterProps) {
  return (
    <footer
      itemScope
      itemType="https://schema.org/LocalBusiness"
      className="border-t border-border bg-background"
    >
      <meta itemProp="name" content={companyName} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-start">
          <p className="text-center sm:text-left">
            &copy; {year} <span itemProp="name">{companyName}</span>. All rights reserved.
          </p>
          <p className="inline-flex items-center justify-center gap-1.5 text-xs">
            Made by
            <a
              href="https://www.humnod.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium hover:text-foreground"
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
          <div className="hidden sm:block" aria-hidden />
        </div>

        {(phone || email || addressLines.length > 0 || hours) && (
          <div className="flex flex-col gap-2 sm:items-end sm:text-right">
            {addressLines.length > 0 && (
              <address
                itemScope
                itemType="https://schema.org/PostalAddress"
                className="not-italic"
              >
                <p className="inline-flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="sr-only">Address: </span>
                  {addressLines.map((line, i) => (
                    <span
                      key={i}
                      itemProp={
                        i === 0
                          ? 'streetAddress'
                          : ['addressLocality', 'addressRegion', 'postalCode'][i - 1] ?? undefined
                      }
                    >
                      {line}
                    </span>
                  ))}
                </p>
              </address>
            )}

            {hours && (
              <p className="inline-flex items-center justify-start gap-2 sm:justify-end">
                <Clock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span itemProp="openingHours">{hours}</span>
              </p>
            )}

            {phone && (
              <p className="inline-flex items-center justify-start gap-2 sm:justify-end">
                <Phone className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <a href={telHref(phone)} itemProp="telephone" className="hover:text-foreground">
                  {phone}
                </a>
              </p>
            )}

            {email && (
              <p className="inline-flex items-center justify-start gap-2 sm:justify-end">
                <Mail className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <a href={mailtoHref(email)} itemProp="email" className="hover:text-foreground">
                  {email}
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </footer>
  )
}
