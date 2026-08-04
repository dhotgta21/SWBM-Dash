// app/llms.txt/route.ts
// Serves /llms.txt — a concise, factual Markdown summary of the business
// and its product catalogue for LLM crawlers (GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended). Following the llms.txt convention so
// AI answer engines can discover, index and cite the catalogue.
//
// Generated dynamically from the live catalogue so it never drifts from
// what's actually stocked, and revalidated hourly (ISR) to stay cheap.

import { loadSeoConfig, canonical as canonicalUrl } from '@/lib/seo/company-seo'
import { listPublicProducts, listPublicCategories } from '@/lib/public-products'
import { cleanProductDescription } from '@/lib/seo/product-content'

export const revalidate = 3600 // refresh the summary once an hour

export async function GET() {
  const [seo, categories, products] = await Promise.all([
    loadSeoConfig(),
    listPublicCategories(),
    listPublicProducts(),
  ])

  const lines: string[] = []

  lines.push(`# ${seo.siteName}`)
  lines.push('')
  lines.push(`> ${seo.home.description}`)
  lines.push('')
  lines.push(
    `${seo.siteName} is a UK builders merchant stocking aggregates, cement, blocks, bricks, sheet materials, timber, insulation, roofing, drainage, fixings, plasterboard, steel and lintels. Prices are quoted on application — visitors build a quote list from the catalogue and receive trade pricing and a delivery slot the same business day.`,
  )
  lines.push('')

  lines.push('## Key pages')
  lines.push(`- [Home](${canonicalUrl('')}): ${seo.siteName} landing page, delivery areas and contact details.`)
  lines.push(`- [Get a quote](${canonicalUrl('quote')}): search the catalogue and build a quote list.`)
  lines.push(`- [Full product catalogue](${canonicalUrl('catalogue')}): every stocked product line, crawlable.`)
  lines.push(`- [About](${canonicalUrl('about')}): company history, trade counter and yard details.`)
  lines.push(`- [Contact](${canonicalUrl('contact')}): phone, email, opening hours and map.`)
  lines.push(`- [Tools & calculators](${canonicalUrl('tools')}): unit converter, concrete, paving, tile and coverage calculators.`)
  lines.push(`- [Guides](${canonicalUrl('guides')}): how-to articles for common building projects.`)
  lines.push(`- [Delivery](${canonicalUrl('delivery')}): same-day and next-day delivery coverage and options.`)
  lines.push(`- [Trade account](${canonicalUrl('trade-account')}): 30-day terms, trade pricing and application.`)
  lines.push(`- [Reviews](${canonicalUrl('reviews')}): customer testimonials and ratings.`)
  lines.push(`- [Glossary](${canonicalUrl('glossary')}): building materials terms and definitions.`)
  lines.push(`- [Sustainability](${canonicalUrl('sustainability')}): eco-friendly and recycled materials.`)
  lines.push('')

  if (categories.length > 0) {
    lines.push('## Product categories')
    for (const category of categories) {
      lines.push(
        `- [${category.name}](${canonicalUrl(`quote/${category.slug}`)}): ${category.productCount} stocked product line${category.productCount === 1 ? '' : 's'}.`,
      )
    }
    lines.push('')
  }

  if (products.length > 0) {
    lines.push('## Product lines')
    for (const product of products) {
      const description = cleanProductDescription(product.description)
      const suffix = product.category ? ` (${product.category})` : ''
      const detail = description ? `: ${description}` : ''
      lines.push(
        `- [${product.name}](${canonicalUrl(`products/${encodeURIComponent(product.code)}`)})${suffix}${detail}`,
      )
    }
  }

  const body = `${lines.join('\n')}\n`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
