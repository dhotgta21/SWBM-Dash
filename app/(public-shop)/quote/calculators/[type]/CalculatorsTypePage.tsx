'use client'

import Link from 'next/link'
import { ArrowRight, Package } from 'lucide-react'
import type { PublicProduct } from '@/lib/public-products'
import type { CalculatorType } from '@/lib/calculators'
import { ProductCalculator } from '@/components/shop/ProductCalculator'
import { BreadcrumbNav } from '@/components/shop/BreadcrumbNav'
import { HelpCircle } from 'lucide-react'
import { getCalculatorTypeContent } from '@/lib/calculators/type-content'

interface CalculatorsTypePageProps {
  type: CalculatorType
  title: string
  product: PublicProduct
  relatedCategories?: { name: string; slug: string }[]
}

export function CalculatorsTypePage({ type, title, product, relatedCategories = [] }: CalculatorsTypePageProps) {
  const content = getCalculatorTypeContent(type)
  return (
    <div className="bg-background">
      <section className="border-b border-border bg-muted/30 py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <BreadcrumbNav
            items={[
              { label: 'Home', href: '/' },
              { label: 'Get a quote', href: '/quote' },
              { label: 'Calculators', href: '/quote/calculators' },
              { label: title },
            ]}
          />

          <div className="mx-auto mt-6 max-w-3xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Material calculator
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              {title}
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Enter your dimensions and get an estimated quantity for your job.
              Add a wastage allowance, then request a trade quote when you are
              ready.
            </p>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <ProductCalculator product={product} inline onQuantityChange={() => {}} />
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:p-8">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Ready to price up the materials?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Browse the catalogue or send your list through for a trade quote.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Get a quote
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/catalogue"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/50"
              >
                Browse products
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30 py-10 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            About this calculator
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">{content.intro}</p>

          <h3 className="mt-8 text-lg font-semibold text-foreground">How to use it</h3>
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-muted-foreground">
            {content.howTo.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>

          <h3 className="mt-8 text-lg font-semibold text-foreground">Common projects</h3>
          <ul className="mt-3 space-y-3">
            {content.projects.map((project, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">{project.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{project.description}</p>
              </li>
            ))}
          </ul>

          <h3 className="mt-8 text-lg font-semibold text-foreground">Frequently asked questions</h3>
          <dl className="mt-4 space-y-4">
            {content.faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <dt className="flex items-start gap-3 text-sm font-semibold text-foreground">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  {faq.q}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground/80">{faq.a}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 leading-relaxed text-muted-foreground">
            The calculator gives you a sensible starting quantity. For structural work, always
            confirm the specification and grade with your engineer or building control before
            ordering. We stock the standard trade lines and can source specialist grades or sizes
            with short lead times.
          </p>

          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <p className="text-sm leading-relaxed text-foreground/80">
              <strong>Working from drawings?</strong> Send us your dimensions, schedule or take-off
              and we will check the estimate, advise on the right product grade and wastage
              allowance, and book a delivery slot that matches your programme. We reply the same
              business day with a written trade quote.
            </p>
          </div>
        </div>
      </section>

      {relatedCategories.length > 0 && (
        <section className="border-t border-border bg-muted/30 py-10 sm:py-14 lg:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Browse related categories
            </h2>
            <p className="mt-2 text-sm text-foreground/80">
              Request a trade quote on the materials you have just calculated.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedCategories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/quote/${category.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary"
                >
                  <Package className="h-5 w-5 text-primary" aria-hidden="true" />
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
