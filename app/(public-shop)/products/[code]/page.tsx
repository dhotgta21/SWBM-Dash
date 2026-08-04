// app/(public-shop)/products/[code]/page.tsx
// Public, crawlable product detail page. Shows the product image,
// paraphrased description, unit and an Add-to-quote control. Links back
// to the parent category and to sibling products.

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ChevronRight, Package, HelpCircle } from 'lucide-react'
import {
  getPublicProductByCode,
  getRedirectedProductCode,
  listPublicProducts,
  listPublicCategories,
} from '@/lib/public-products'
import { loadSeoConfig, canonical as canonicalUrl, applyTemplate, resolveAbsoluteUrl } from '@/lib/seo/company-seo'
import { truncateOnWord } from '@/lib/seo/page-defaults'
import {
  cleanProductDescription,
  extractSpecs,
  categoryAdditionalType,
  getProductFallbackDescription,
  getProductFaqs,
} from '@/lib/seo/product-content'
import {
  isCalculatorType,
  calculatorHref,
  CALCULATOR_TYPE_LABELS,
} from '@/lib/calculators/navigation'
import { ProductPurchaseCard } from '@/components/shop/ProductPurchaseCard'
import { ProductVariantSelector } from '@/components/shop/ProductVariantSelector'
import { PublicProductCard } from '@/components/shop/PublicProductCard'
import { ProductGuide } from '@/components/shop/ProductGuide'
import { JsonLd } from '@/components/seo/JsonLd'
import { getEffectivePrice } from '@/lib/public-products/price'

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ code: string }>
  searchParams: Promise<{ size?: string | string[] }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const [product, seo] = await Promise.all([
    getPublicProductByCode(decodeURIComponent(code)),
    loadSeoConfig(),
  ])

  if (!product) {
    return {
      title: { absolute: 'Product not found' },
      robots: { index: false, follow: true },
    }
  }

  // Cap the title at 60 chars on a word boundary so Google doesn't
  // truncate or rewrite it. We prefer `product.seoTitle` when set,
  // then the template, and we trim whichever we use. Long product
  // names (e.g. "Tough-Spot Self-Adhesive Floor Protection Paper
  // 1m × 100m Roll") would otherwise push the title over Google's
  // 60-char desktop limit and lose the site name from the SERP.
  const rawTitle =
    product.seoTitle ||
    applyTemplate(seo.templates.productTitle, {
      product: product.name,
      site: seo.siteName,
    })
  const title = truncateOnWord(rawTitle, 60)
  // Prefer the product-level SEO description, then the short description,
  // then the cleaned long description, then the template.
  const fallbackDescription = truncateOnWord(
    applyTemplate(seo.templates.productDescription, {
      product: product.name,
      category: product.category ?? undefined,
      site: seo.siteName,
    }),
    160,
  )
  const description =
    product.seoDescription ||
    product.shortDescription ||
    cleanProductDescription(product.description) ||
    fallbackDescription

  return {
    title: { absolute: title },
    description,
    alternates: {
      canonical: canonicalUrl(`products/${encodeURIComponent(product.code)}`),
    },
    openGraph: {
      title,
      description,
      // Next.js 16's OpenGraph type union does not include `product`, so we
      // keep `website` here to satisfy the type checker. The page renders a
      // manual `<meta property="og:type" content="product" />` tag below
      // which Next.js hoists to <head> and which overrides the `website` tag.
      type: 'website',
      url: canonicalUrl(`products/${encodeURIComponent(product.code)}`),
      images: product.imageUrl
        ? [
            {
              url: resolveAbsoluteUrl(seo.siteUrl, product.imageUrl)!,
              alt: `${product.name}${product.category ? ` — ${product.category}` : ''} at Star Hawk Builders Merchant`,
            },
          ]
        : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: product.imageUrl ? [resolveAbsoluteUrl(seo.siteUrl, product.imageUrl)!] : undefined,
    },
  }
}

export default async function ProductPage({ params, searchParams }: PageProps) {
  const { code } = await params
  const { size: sizeParam } = await searchParams
  const decodedCode = decodeURIComponent(code)
  const [product, allProducts, categories, seo] = await Promise.all([
    getPublicProductByCode(decodedCode),
    listPublicProducts(),
    listPublicCategories(),
    loadSeoConfig(),
  ])

  if (!product) {
    const redirectedCode = await getRedirectedProductCode(decodedCode)
    if (redirectedCode) {
      permanentRedirect(`/products/${encodeURIComponent(redirectedCode)}`)
    }
    notFound()
  }

  // Build the initial selector map from `?size=<value>` query params. The
  // search result UI builds a link like
  // `/products/STL-073?size=ub-127x76x13` so the user lands with the
  // matching size pre-selected. Multiple `?size=` params (e.g. `?size=A&size=B`)
  // are all applied so future multi-selector variants work out of the box.
  const initialSelections: Record<string, string> = {}
  if (Array.isArray(sizeParam)) {
    for (const value of sizeParam) {
      if (typeof value === 'string' && value) initialSelections['size'] = value
    }
  } else if (typeof sizeParam === 'string' && sizeParam) {
    initialSelections['size'] = sizeParam
  }

  const category = categories.find((c) => c.name === product.category)
  const categoryUrl = category ? canonicalUrl(`quote/${category.slug}`) : canonicalUrl('quote')
  const productUrl = canonicalUrl(`products/${encodeURIComponent(product.code)}`)

  const related = allProducts
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 3)

  // Cleaned, de-boilerplated description for display + schema. Falls back
  // to a product-specific fallback paragraph when a product has no
  // description of its own, keeping every product page above the thin-content
  // threshold.
  const displayDescription =
    cleanProductDescription(product.description) ||
    getProductFallbackDescription(product)
  const specs = extractSpecs(product.description)
  const additionalType = categoryAdditionalType(product.category)

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${seo.siteUrl}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Get a quote',
        item: canonicalUrl('quote'),
      },
      ...(category
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: category.name,
              item: categoryUrl,
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: product.name,
              item: productUrl,
            },
          ]
        : [
            {
              '@type': 'ListItem',
              position: 3,
              name: product.name,
              item: productUrl,
            },
          ]),
    ],
  }

  const productFaqs = getProductFaqs(product)
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: productFaqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const priceDisplay = getEffectivePrice(product)
  const onSale = priceDisplay.kind === 'sale'
  const priceForJsonLd =
    priceDisplay.kind === 'sale'
      ? priceDisplay.effectivePrice
      : priceDisplay.kind === 'fixed' || priceDisplay.kind === 'from'
        ? priceDisplay.effectivePrice
        : null

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: displayDescription,
    image: resolveAbsoluteUrl(seo.siteUrl, product.imageUrl),
    sku: product.code,
    category: product.category || undefined,
    // Links the product to a known concept (Wikipedia entity) so search
    // engines and LLMs can disambiguate "block", "wall tie", etc.
    ...(additionalType ? { additionalType } : {}),
    // Each page is the canonical home of exactly one product entity.
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': productUrl,
    },
    brand: {
      '@type': 'Brand',
      name: product.brand || seo.siteName,
    },
    ...(product.mpn ? { mpn: product.mpn } : {}),
    // Material + available sizes parsed from the description text, exposed
    // as structured values rather than buried in prose so AI answer
    // engines can cite them directly.
    ...(specs.materials.length > 0
      ? { material: specs.materials.join(', ') }
      : {}),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Unit', value: product.unit },
      ...specs.sizes.map((size) => ({
        '@type': 'PropertyValue',
        name: 'Available size',
        value: size,
      })),
      ...product.keyFeatures.map((feature) => ({
        '@type': 'PropertyValue',
        name: 'Feature',
        value: feature,
      })),
      ...product.applications.map((application) => ({
        '@type': 'PropertyValue',
        name: 'Application',
        value: application,
      })),
    ],
    offers: {
      // Use a real price when the product has any published price so Google
      // can show price snippets and the page qualifies for Google Shopping.
      // When the product is mid-sale we additionally emit priceValidUntil +
      // a sibling PriceSpecification for the was-price so the strikethrough
      // renders correctly in Google Shopping.
      '@type': 'Offer',
      url: productUrl,
      priceCurrency: 'GBP',
      ...(priceForJsonLd != null
        ? {
            price: priceForJsonLd.toFixed(2),
            ...(onSale && priceDisplay.endsAt
              ? { priceValidUntil: priceDisplay.endsAt }
              : {}),
          }
        : {
            priceSpecification: {
              '@type': 'PriceSpecification',
              priceCurrency: 'GBP',
              description: 'Trade price on application',
            },
          }),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      ...(onSale
        ? {
            priceSpecification: {
              '@type': 'PriceSpecification',
              priceCurrency: 'GBP',
              price: priceDisplay.originalPrice.toFixed(2),
              description: product.saleLabel
                ? `Was ${product.saleLabel} price before sale`
                : 'Was price before sale',
            },
          }
        : {}),
    },
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <JsonLd id="ld-product-breadcrumb" data={breadcrumbJsonLd} />
      <JsonLd id="ld-product" data={productJsonLd} />
      <JsonLd id="ld-product-faq" data={faqJsonLd} />
      {/** Next.js 16 does not include `product` in its OpenGraph type union,
        * so we emit the correct og:type manually. It is hoisted to <head>
        * and overrides the `website` value generated from metadata. */}
      <meta property="og:type" content="product" />

      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <Link href="/quote" className="hover:text-foreground">
              Get a quote
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="h-3.5 w-3.5" />
              </li>
              <li>
                <Link href={`/quote/${category.slug}`} className="hover:text-foreground">
                  {category.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li>
            <span className="font-medium text-foreground">{product.name}</span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted to-secondary">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={`${product.name}${product.category ? ` — ${product.category}` : ''} at Star Hawk Builders Merchant`}
              title={product.name}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-24 w-24 text-muted-foreground/40" strokeWidth={1.25} />
            </div>
          )}
        </div>

        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {product.code} &middot; {product.category}
            {product.brand && ` · ${product.brand}`}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            {product.name}
          </h1>

          {displayDescription && (
            <p className="mt-5 text-base leading-relaxed text-muted-foreground">
              {displayDescription}
            </p>
          )}

          {(product.keyFeatures.length > 0 || product.applications.length > 0 || product.mpn) && (
            <div className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
              {product.brand && (
                <div>
                  <p className="text-sm text-muted-foreground">Brand</p>
                  <p className="font-semibold text-foreground">{product.brand}</p>
                </div>
              )}
              {product.mpn && (
                <div>
                  <p className="text-sm text-muted-foreground">MPN</p>
                  <p className="font-semibold text-foreground">{product.mpn}</p>
                </div>
              )}
              {product.keyFeatures.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Key features</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-foreground">
                    {product.keyFeatures.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}
              {product.applications.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Typical uses</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-foreground">
                    {product.applications.map((application, i) => (
                      <li key={i}>{application}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {product.variantOptions && product.variantOptions.length > 0 ? (
            <ProductVariantSelector product={product} initialSelections={initialSelections} />
          ) : (
            <ProductPurchaseCard product={product} />
          )}

          {category && (
            <div className="mt-6">
              <Link
                href={`/quote/${category.slug}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Browse all {category.name.toLowerCase()}
              </Link>
            </div>
          )}

          {product.calculatorType && isCalculatorType(product.calculatorType) && (
            <div className="mt-3">
              <Link
                href={calculatorHref(product.calculatorType)}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover"
              >
                Calculate quantity with {CALCULATOR_TYPE_LABELS[product.calculatorType]}
              </Link>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-label="Related products" className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            More {product.category?.toLowerCase()}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PublicProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <ProductGuide product={product} />

      <section className="mt-16 border-t border-border pt-12">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Product FAQs
          </h2>
          <dl className="mt-8 space-y-4">
            {productFaqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <dt className="flex items-start gap-3 text-base font-semibold text-foreground">
                  <HelpCircle
                    className="h-5 w-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {faq.q}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-foreground/80">
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  )
}
