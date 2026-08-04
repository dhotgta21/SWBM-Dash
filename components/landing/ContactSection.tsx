// components/landing/ContactSection.tsx
// Closing call-to-action. Combines phone, email and an embedded map
// inside the "Find the yard" card so visitors can see the location
// without leaving the page.

import { Phone, Mail, MapPin, ArrowRight } from 'lucide-react'
import { telHref, mailtoHref } from '@/lib/company'

interface ContactSectionProps {
  phones: string[]
  emails: string[]
  addressLines: string[]
}

const FALLBACK_ADDRESS = 'Address on file. Contact us for details.'

export function ContactSection({ phones, emails, addressLines }: ContactSectionProps) {
  const address = addressLines.join(', ')
  const hasRealAddress = !addressLines.includes(FALLBACK_ADDRESS) && addressLines.length > 0
  const mapQuery = hasRealAddress ? address : 'United Kingdom'
  const mapSrc = `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&t=&z=${hasRealAddress ? 15 : 6}&ie=UTF8&iwloc=&output=embed`

  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      itemScope
      itemType="https://schema.org/LocalBusiness"
      className="scroll-mt-20 py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:py-16">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Talk to us
              </span>
              <h2
                id="contact-heading"
                className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
              >
                Need a price, a stock check, or a delivery slot?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                The fastest answer is usually a quick phone call to the
                trade counter. For a written quote, email your take-off and
                we&rsquo;ll come back to you.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {phones.map((phone) => (
                  <a
                    key={phone}
                    href={telHref(phone)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
                  >
                    <Phone className="h-4 w-4" />
                    {phone}
                  </a>
                ))}
                {emails.map((email) => (
                  <a
                    key={email}
                    href={mailtoHref(email, 'Quote / stock enquiry from website')}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    Email the trade counter
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Find the yard
              </h3>

              <div className="overflow-hidden rounded-lg border border-border bg-white">
                <iframe
                  title="Star Hawk Builders Merchant location"
                  src={mapSrc}
                  width="100%"
                  height="220"
                  style={{ border: 0, filter: 'grayscale(15%) contrast(1.02)' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              {/* Semantic NAP block — <address> + itemProp lets search
                  engines treat this as the official site NAP rather than
                  just decorative text, reinforcing the LocalBusiness
                  schema in the page head. */}
              <address
                itemScope
                itemType="https://schema.org/PostalAddress"
                className="not-italic space-y-4 text-sm"
              >
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="leading-relaxed text-muted-foreground">
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
                  </div>
                </div>
                {phones.map((phone) => (
                  <div key={phone} className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <a
                      href={telHref(phone)}
                      itemProp="telephone"
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {phone}
                    </a>
                  </div>
                ))}
                {emails.map((email) => (
                  <div key={email} className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <a
                      href={mailtoHref(email)}
                      itemProp="email"
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {email}
                    </a>
                  </div>
                ))}
              </address>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
