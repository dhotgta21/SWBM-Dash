// Vertical pack shape for Demo Builder Merchant industry presentations.

export type DemoVerticalId =
  | 'construction'
  | 'plumbing'
  | 'electrical'
  | 'windows'
  | 'tile'

export interface DemoVerticalPack {
  id: DemoVerticalId
  displayName: string
  /** Hero H1 leading phrase (before the emphasised region). */
  heroLead: string
  /** Emphasised part of the hero H1. */
  heroEmphasis: string
  /** Hero body paragraph. */
  heroBody: string
  /** Trust strip headline. */
  trustHeadline: string
  /** Category names to emphasise (must match products.category when possible). */
  categories: string[]
  /** FAQ items for the landing page. */
  faqs: { question: string; answer: string }[]
  /** Short SEO-ish keywords for this vertical. */
  keywords: string[]
  /** Quote CTA line. */
  quoteCta: string
}
