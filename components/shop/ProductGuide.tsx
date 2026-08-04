// components/shop/ProductGuide.tsx
// Expanded, category-specific product guide shown on every product detail
// page. Adds several hundred words of useful, factual content so thin
// product pages cross the 500-word threshold and give AI answer engines
// something concrete to cite.

import Link from 'next/link'
import type { PublicProduct } from '@/lib/public-products'
import { getProductCategoryGuide } from '@/lib/seo/product-content'
import { isCalculatorType, CALCULATOR_TYPE_LABELS, calculatorHref } from '@/lib/calculators/navigation'

interface ProductGuideProps {
  product: PublicProduct
}

export function ProductGuide({ product }: ProductGuideProps) {
  const categoryName = product.category ?? 'building materials'
  const guide = getProductCategoryGuide(product.category)

  const paragraphs: string[] = []
  if (guide) {
    paragraphs.push(guide.intro)
  } else {
    paragraphs.push(
      `${categoryName} from Demo Builder Merchant are stocked for trade and DIY customers across the South East. ` +
        `We keep the common lines on the shelf and can source specialist sizes or grades through our supplier network with short lead times.`,
    )
  }

  paragraphs.push(
    `Every product is sold by the ${product.unit.toLowerCase()} and priced on application, so you only pay the current trade rate. ` +
      `Add the line to your quote list, call the trade counter or email your take-off and we will confirm stock, check the price and book a delivery slot the same business day.`,
  )

  const uses = guide?.uses ?? [
    'General construction and repair work',
    'Trade projects across the South East',
    'DIY renovations and extensions',
  ]

  const estimating =
    guide?.estimating ??
    `Measure the quantity you need carefully and add a small wastage allowance. If you are unsure, send us your dimensions or schedule and we will check the maths before quoting.`

  const delivery =
    guide?.delivery ??
    `We deliver stock lines same-day across Greater London, Berkshire, Buckinghamshire, Surrey and Hampshire, with next-day coverage into Oxfordshire, Wiltshire and surrounding counties. Deliveries are on our own lorries, so you can talk to the driver and resolve any access issues on the spot.`

  return (
    <section className="mt-16 border-t border-border pt-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          About {categoryName}
        </h2>

        {paragraphs.map((p, i) => (
          <p key={i} className="mt-4 leading-relaxed text-muted-foreground">
            {p}
          </p>
        ))}

        <h3 className="mt-8 text-lg font-semibold text-foreground">Common uses</h3>
        <ul className="mt-3 list-inside list-disc space-y-1.5 text-muted-foreground">
          {uses.map((use, i) => (
            <li key={i}>{use}</li>
          ))}
        </ul>

        <h3 className="mt-8 text-lg font-semibold text-foreground">Estimating quantities</h3>
        <p className="mt-3 leading-relaxed text-muted-foreground">{estimating}</p>
        {product.calculatorType && isCalculatorType(product.calculatorType) && (
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Use our{' '}
            <Link href={calculatorHref(product.calculatorType)} className="font-semibold text-primary hover:text-primary-hover">
              {CALCULATOR_TYPE_LABELS[product.calculatorType]}
            </Link>{' '}
            to convert your dimensions into the number of {product.unit.toLowerCase()}s you need.
          </p>
        )}

        <h3 className="mt-8 text-lg font-semibold text-foreground">Delivery and storage</h3>
        <p className="mt-3 leading-relaxed text-muted-foreground">{delivery}</p>

        <div className="mt-8 rounded-xl border border-border bg-card p-5">
          <p className="text-sm leading-relaxed text-foreground/80">
            <strong>Need a price or a stock check?</strong> Add {product.name} to your quote list,
            call the trade counter, or email your schedule. We reply the same business day with a
            written quote and a delivery option for your postcode.
          </p>
        </div>
      </div>
    </section>
  )
}
