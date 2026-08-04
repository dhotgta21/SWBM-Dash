// app/(public-shop)/quote/calculators/[type]/page.tsx
// Standalone material calculator page. Each type renders a clean,
// product-free calculator UI consistent with the /tools calculators.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { listPublicProducts, listPublicCategories, type PublicProduct } from '@/lib/public-products'
import type { CalculatorType } from '@/lib/calculators'
import {
  CALCULATOR_TYPE_LABELS,
  VALID_CALCULATOR_TYPES,
  getCategoriesForCalculator,
} from '@/lib/calculators/navigation'
import { CalculatorsTypePage } from './CalculatorsTypePage'
import { JsonLd } from '@/components/seo/JsonLd'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

const VALID_TYPES = VALID_CALCULATOR_TYPES as readonly CalculatorType[]
const TYPE_TITLES = CALCULATOR_TYPE_LABELS

interface PageProps {
  params: Promise<{ type: string }>
}

function scoreProductForType(product: PublicProduct, type: CalculatorType): number {
  const name = product.name.toLowerCase()
  const category = (product.category ?? '').toLowerCase()
  const text = `${name} ${category}`

  switch (type) {
    case 'BRICK_WALL':
      return text.includes('block') ? 10 : text.includes('brick') ? 5 : 0
    case 'MORTAR_CONCRETE':
      return text.includes('cement') ? 10 : text.includes('sand') ? 5 : text.includes('aggregate') ? 3 : 0
    case 'SHEET_MATERIALS':
      return text.includes('plywood') || text.includes('osb') || text.includes('chipboard') ? 10 : 0
    case 'AGGREGATES':
      return text.includes('mot type 1') || text.includes('mot') ? 10 : text.includes('shingle') ? 7 : text.includes('ballast') ? 5 : text.includes('sand') ? 3 : 0
    case 'SCREED':
      return text.includes('sand') ? 10 : text.includes('cement') ? 5 : 0
    case 'PLASTERING':
      return text.includes('plaster') && !text.includes('board') ? 10 : text.includes('plasterboard') || text.includes('board') ? 5 : 0
    case 'INSULATION':
      return text.includes('board') || text.includes('slab') ? 10 : text.includes('roll') ? 7 : 0
    case 'ROOFING':
      return text.includes('felt') ? 10 : text.includes('gutter') || text.includes('trim') ? 7 : text.includes('resin') ? 5 : 0
    case 'TIMBER':
      return text.includes('stud') ? 10 : text.includes('timber') ? 7 : text.includes('batten') ? 5 : 0
    case 'STEEL_LINTEL':
      return text.includes('steel') ? 10 : text.includes('concrete lintel') ? 7 : text.includes('lintel') ? 5 : 0
    default:
      return 0
  }
}

function selectDefaultProduct(products: PublicProduct[], type: CalculatorType): PublicProduct {
  return [...products].sort((a, b) => scoreProductForType(b, type) - scoreProductForType(a, type))[0]
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params
  const upperType = type.toUpperCase() as CalculatorType
  const seo = await loadSeoConfig()

  if (!VALID_TYPES.includes(upperType)) {
    return {
      title: { absolute: 'Calculator not found' },
      robots: { index: false, follow: true },
    }
  }

  const title = `${CALCULATOR_TYPE_LABELS[upperType]} | ${seo.siteName}`
  const description = `Use our free ${TYPE_TITLES[upperType].toLowerCase()} to estimate material quantities for your job.`

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalUrl(`quote/calculators/${type.toLowerCase()}`),
    },
  }
}

export default async function CalculatorTypeRoute({ params }: PageProps) {
  const { type } = await params
  const upperType = type.toUpperCase() as CalculatorType

  if (!VALID_TYPES.includes(upperType)) {
    notFound()
  }

  const [allProducts, categories] = await Promise.all([
    listPublicProducts(),
    listPublicCategories(),
  ])
  const products = allProducts.filter((p) => p.calculatorType?.toUpperCase() === upperType)

  if (products.length === 0) {
    notFound()
  }

  const title = TYPE_TITLES[upperType]
  const defaultProduct = selectDefaultProduct(products, upperType)
  const categoryLinks = categories.map((c) => ({ name: c.name, slug: c.slug }))
  const relatedCategories = getCategoriesForCalculator(upperType, categoryLinks)

  const pageUrl = canonicalUrl(`quote/calculators/${type.toLowerCase()}`)

  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: pageUrl,
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: canonicalUrl('') },
      { '@type': 'ListItem', position: 2, name: 'Get a quote', item: canonicalUrl('quote') },
      { '@type': 'ListItem', position: 3, name: 'Calculators', item: canonicalUrl('quote/calculators') },
      { '@type': 'ListItem', position: 4, name: title, item: pageUrl },
    ],
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [pageJsonLd, breadcrumbJsonLd],
  }

  return (
    <>
      <JsonLd id="ld-calculator-type" data={jsonLd} />
      <CalculatorsTypePage
        type={upperType}
        title={title}
        product={defaultProduct}
        relatedCategories={relatedCategories}
      />
    </>
  )
}
