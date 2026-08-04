// components/landing/AboutSection.tsx
// Compact "Why choose us" teaser for the home page. The full company
// story, history and yard details live on /about — this section just
// gives the highlights and links through.

import Link from 'next/link'
import { Building2, MapPin, Phone, Truck, ShieldCheck, Users, ArrowRight } from 'lucide-react'
import { type CompanyInfo, getChannelForContext, telHref } from '@/lib/company'
import type { DeliveryArea } from './DeliveryAreas'

interface AboutSectionProps {
  company: CompanyInfo
  areas: DeliveryArea[]
  totalProducts: number
}

export function AboutSection({ company, areas, totalProducts }: AboutSectionProps) {
  const counties = new Set(areas.map((a) => a.county).filter(Boolean))
  // Pull the founding year from company_settings so the operator edits
  // it in one place. Falls back to 2017 if the DB is unreachable so
  // the home page still renders.
  const foundedYear = company.foundedYear ?? 2017
  const years = Math.max(1, new Date().getFullYear() - foundedYear)

  const proofPoints = [
    {
      icon: Building2,
      value: `${years}+`,
      label: 'Years on the trade counter',
    },
    {
      icon: Truck,
      value: `${areas.length}`,
      label: 'Towns on our delivery round',
    },
    {
      icon: ShieldCheck,
      value: `${totalProducts > 0 ? `${totalProducts}+` : '1,000+'}`,
      label: 'Stock lines under one roof',
    },
    {
      icon: Users,
      value: '30-day',
      label: 'Trade account terms',
    },
  ]

  return (
    <section
      id="about"
      aria-labelledby="about-heading"
      className="scroll-mt-20 bg-card py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left: value prop */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                About {company.name}
              </span>
            </div>
            <h2
              id="about-heading"
              className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
            >
              A local merchant with the stock depth of a national.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Family-run since {foundedYear}, we supply trade-quality building materials
              across {counties.size} counties from our own yard. We stock deep, price fair,
              and deliver on our own lorries.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/about"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Read our story
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-all hover:border-primary/40 hover:text-primary"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Visit the yard
              </Link>
            </div>

            {(company.phones.length > 0 || company.phone) && (
              <a
                href={telHref(getChannelForContext(company.phones, 'homepage')?.value ?? company.phone ?? '')}
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4 text-primary" aria-hidden="true" />
                {getChannelForContext(company.phones, 'homepage')?.value ?? company.phone ?? 'Call the trade counter'}
              </a>
            )}
          </div>

          {/* Right: proof points */}
          <div className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {proofPoints.map(({ icon: Icon, value, label }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-border bg-secondary p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <dl>
                    <dt className="mt-4 text-sm font-medium text-foreground/80">
                      {label}
                    </dt>
                    <dd className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
                      {value}
                    </dd>
                  </dl>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
