// lib/blog/render.ts
// Renders case-study Markdown to HTML with three SEO-boosting
// behaviours layered on top of plain `marked`:
//
//   1. Material auto-linking — every natural-language mention of a
//      stocked building material (cement, sand, ballast, blocks,
//      bricks, lintels, insulation, drainage, fixings, …) becomes
//      an internal link to the matching product or category page.
//      Dictionary lives in `./materials.ts`.
//
//   2. Town auto-linking — first mention of any other town we ship
//      to becomes a link to that town's case study (or to the
//      /case-studies index as a fallback if no case study exists yet).
//
//   3. Heading anchors — every H2/H3 gets a stable id so the table
//      of contents can deep-link, and so Google can show "Jump to"
//      links in some SERP layouts.
//
// The renderer is server-side (Node only) and is invoked from the
// blog route's RSC. The output is trusted HTML, so we render the
// result with `dangerouslySetInnerHTML` and rely on the auto-linker
// being deterministic + escape-safe.

import 'server-only'
import { marked, type Tokens, type Token } from 'marked'
import { compileMaterials, type CompiledMaterial } from './materials'
import { listCaseStudySlugs } from './loader'

/**
 * Lightweight sanitizer for git-authored Markdown HTML.
 *
 * We intentionally do NOT use isomorphic-dompurify here. On Vercel serverless
 * it pulls in jsdom (large, fragile native deps) and has caused detail pages
 * (/blog/[slug], /guides/[slug], /case-studies/[slug]) to 500 with
 * "This page couldn't load" while index hubs still worked (they never call
 * this renderer). Content under content/ is reviewed in git, so a small
 * script/event-handler strip is enough.
 */
function sanitizeTrustedMarkdownHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"')
}

const materials: CompiledMaterial[] = compileMaterials()

/**
 * Town map — the towns the marketing plan covers. Each entry holds
 * the canonical case-study slug we'd link to IF a post for that town
 * exists. We only emit a link when `listCaseStudySlugs()` actually
 * contains the slug, so we never send a visitor to a 404.
 *
 * To add a new town to this map: drop a new case-study .md with
 * `slug: <value>` and the auto-linker will pick it up next render.
 */
const TOWN_MAP: Record<string, { slug: string; label: string }> = {
  'aylesbury': { slug: 'outbuilding-aylesbury-3', label: 'Aylesbury' },
  basingstoke: { slug: 'extension-basingstoke-3', label: 'Basingstoke' },
  beaconsfield: { slug: 'loft-conversion-beaconsfield-2', label: 'Beaconsfield' },
  bicester: { slug: 'extension-bicester-2', label: 'Bicester' },
  bracknell: { slug: 'garden-office-bracknell-4', label: 'Bracknell' },
  camberley: { slug: 'extension-camberley-1', label: 'Camberley' },
  didcot: { slug: 'garage-conversion-didcot-2', label: 'Didcot' },
  egham: { slug: 'barn-conversion-egham-1', label: 'Egham' },
  farnborough: { slug: 'loft-conversion-farnborough-1', label: 'Farnborough' },
  farnham: { slug: 'extension-farnham-1', label: 'Farnham' },
  fleet: { slug: 'loft-conversion-fleet-2', label: 'Fleet' },
  guildford: { slug: 'commercial-guildford-1', label: 'Guildford' },
  hayes: { slug: 'garden-office-hayes-2', label: 'Hayes' },
  'henley-on-thames': { slug: 'commercial-henley-on-thames-1', label: 'Henley-on-Thames' },
  'high wycombe': { slug: 'barn-conversion-high-wycombe-2', label: 'High Wycombe' },
  hungerford: { slug: 'garden-office-hungerford-2', label: 'Hungerford' },
  maidenhead: { slug: 'extension-maidenhead-2', label: 'Maidenhead' },
  marlow: { slug: 'driveway-marlow-2', label: 'Marlow' },
  newbury: { slug: 'garage-conversion-newbury-4', label: 'Newbury' },
  oxford: { slug: 'extension-oxford-1', label: 'Oxford' },
  'princes risborough': { slug: 'extension-princes-risborough-2', label: 'Princes Risborough' },
  reading: { slug: 'extension-reading-3', label: 'Reading' },
  slough: { slug: 'barn-conversion-slough-1', label: 'Slough' },
  'staines-upon-thames': { slug: 'loft-conversion-staines-upon-thames-1', label: 'Staines-upon-Thames' },
  thame: { slug: 'extension-thame-2', label: 'Thame' },
  uxbridge: { slug: 'extension-uxbridge-1', label: 'Uxbridge' },
  windsor: { slug: 'commercial-windsor-1', label: 'Windsor' },
  witney: { slug: 'garden-office-witney-1', label: 'Witney' },
  woking: { slug: 'driveway-woking-3', label: 'Woking' },
  wokingham: { slug: 'commercial-wokingham-3', label: 'Wokingham' },
}

// Pre-compute the set of slugs that have a published case study.
// Recomputed on every render (cheap: just a directory read).
function getPublishedSlugs(): Set<string> {
  return new Set(listCaseStudySlugs())
}

/** Per-render tracking so we don't double-link the same town. */
interface RenderState {
  linkedTowns: Set<string>
  /** Per-paragraph: which material hrefs have we already linked?
   *  Reset at the start of each text node. */
  linkedMaterials: Set<string>
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

/**
 * Auto-link materials and towns inside a piece of plain text.
 *
 * Strategy:
 *   1. Walk every known pattern (sorted longest-first) and find
 *      all match positions in the input.
 *   2. Merge overlapping matches, keeping the longest one.
 *   3. Stitch the input back together with matches wrapped in <a>
 *      tags and un-matched spans passed through verbatim.
 *
 * This guarantees no nested links because each character range is
 * claimed by exactly one match (or none).
 *
 * Per-render state:
 *   - linkedTowns: towns already linked anywhere in the document,
 *     so a town name only ever links once per post.
 *   - linkedMaterials: materials already linked in *this* text node,
 *     so each material is linked at most once per paragraph.
 */
function autolinkText(text: string, state: RenderState): string {
  const safe = escapeHtml(text)
  if (safe.length === 0) return safe

  type Match = { start: number; end: number; replacement: string }
  const matches: Match[] = []

  // Collect material matches.
  for (const m of materials) {
    if (state.linkedMaterials.has(m.href)) continue
    m.pattern.lastIndex = 0
    let r: RegExpExecArray | null
    while ((r = m.pattern.exec(safe)) !== null) {
      matches.push({
        start: r.index,
        end: r.index + r[0].length,
        replacement: `<a href="${m.href}" title="${escapeHtml(m.productName)}" class="blog-material-link">${r[0]}</a>`,
      })
      state.linkedMaterials.add(m.href)
      // Only one occurrence per material per text node.
      break
    }
  }

  // Collect town matches (first occurrence per town across the doc).
  // Only emit a link when we have a published case study for the town,
  // otherwise the town name is left as plain text (avoids sending
  // visitors to a 404 while still being valid prose).
  const published = getPublishedSlugs()
  for (const town of Object.values(TOWN_MAP)) {
    if (state.linkedTowns.has(town.slug)) continue
    if (!published.has(town.slug)) continue
    const pattern = new RegExp(`(?<![\\w-])${escapeRegExp(town.label)}(?![\\w-])`, 'i')
    const r = pattern.exec(safe)
    if (!r) continue
    matches.push({
      start: r.index,
      end: r.index + r[0].length,
      replacement: `<a href="/case-studies/${town.slug}" class="blog-town-link">${r[0]}</a>`,
    })
    state.linkedTowns.add(town.slug)
  }

  if (matches.length === 0) return safe

  // Sort by start position; for overlaps, keep the longest match.
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
  const kept: Match[] = []
  let cursor = -1
  for (const m of matches) {
    if (m.start < cursor) continue // overlap with previously kept match
    kept.push(m)
    cursor = m.end
  }

  // Stitch.
  let out = ''
  let i = 0
  for (const m of kept) {
    out += safe.slice(i, m.start)
    out += m.replacement
    i = m.end
  }
  out += safe.slice(i)
  return out
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ─── marked configuration ──────────────────────────────────────────────────

const renderer = new marked.Renderer()

// Headings: emit stable id anchors so the table of contents can
// deep-link.
const slugSeen = new Set<string>()
// Towns linked anywhere in the current render — hoisted to render scope so a
// town links at most once per post (previously reset on every block).
const linkedTowns = new Set<string>()
function uniqueSlug(base: string): string {
  let s = base
  let n = 1
  while (slugSeen.has(s)) {
    n += 1
    s = `${base}-${n}`
  }
  slugSeen.add(s)
  return s
}

renderer.heading = function ({ tokens, depth }: Tokens.Heading): string {
  const text = this.parser.parseInline(tokens)
  const plain = stripTags(text)
  const id = uniqueSlug(slugifyHeading(plain))
  return `<h${depth} id="${id}">${text}</h${depth}>\n`
}

// Paragraphs and table cells: walk the inline tokens and replace
// any plain text node with our auto-linked version.
renderer.paragraph = function ({ tokens }: Tokens.Paragraph): string {
  const linked = autolinkInline(tokens)
  return `<p>${linked}</p>\n`
}

renderer.tablecell = function ({ tokens }: Tokens.TableCell): string {
  const linked = autolinkInline(tokens)
  return `<td>${linked}</td>`
}

renderer.listitem = function ({ tokens, text }: Tokens.ListItem): string {
  // marked v18 hands us list-item inline tokens as a single raw
  // text token (with literal `**bold**` etc. preserved). Re-parse
  // the item's raw text into proper inline tokens so the bold,
  // italic, strike markdown becomes real HTML, then run auto-linking
  // over those tokens.
  const raw = text ?? tokens.map((t) => (t as Tokens.Text).raw ?? '').join('')
  const inlineTokens = marked.Lexer.lexInline(raw)
  const linked = autolinkInline(inlineTokens)
  return `<li>${linked}</li>\n`
}

/**
 * Walk inline tokens, auto-link material/town mentions inside text
 * tokens, and pass through other token types untouched.
 */
function autolinkInline(tokens: Token[]): string {
  const state: RenderState = {
    linkedTowns,
    linkedMaterials: new Set<string>(),
  }
  let out = ''
  for (const t of tokens) {
    if (t.type === 'text') {
      out += autolinkText((t as Tokens.Text).raw, state)
    } else if (t.type === 'escape') {
      out += escapeHtml((t as Tokens.Escape).text)
    } else if (t.type === 'codespan') {
      out += `<code>${escapeHtml((t as Tokens.Codespan).text)}</code>`
    } else if (t.type === 'br') {
      out += '<br />'
    } else if (t.type === 'strong') {
      const inner = autolinkInline((t as Tokens.Strong).tokens)
      out += `<strong>${inner}</strong>`
    } else if (t.type === 'em') {
      const inner = autolinkInline((t as Tokens.Em).tokens)
      out += `<em>${inner}</em>`
    } else if (t.type === 'link') {
      const inner = autolinkInline((t as Tokens.Link).tokens)
      const href = (t as Tokens.Link).href
      out += `<a href="${href}" rel="noopener">${inner}</a>`
    } else if (t.type === 'del') {
      const inner = autolinkInline((t as Tokens.Del).tokens)
      out += `<del>${inner}</del>`
    } else if (t.type === 'image') {
      const img = t as Tokens.Image
      out += `<img src="${img.href}" alt="${escapeHtml(img.text ?? '')}" />`
    } else if (t.type === 'html') {
      // Trust inline HTML from the author — they may include YouTube
      // iframes, videos, etc.
      out += (t as Tokens.HTML).text
    } else {
      // Fallback: render the raw token source escaped. Unknown inline token
      // types are rare in practice; keeping this path avoids silently dropping
      // content if marked adds new token kinds.
      out += escapeHtml((t as { raw?: string }).raw ?? '')
    }
  }
  return out
}

/** Strip HTML tags for slug calculation. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

// Configure marked once. We use a function so the linked-text paths
// share one parser instance per render call.
marked.use({
  gfm: true,
  breaks: false,
  renderer,
})

/** Public entry point — render the body of a case study / blog / guide. */
export function renderCaseStudy(markdown: string): string {
  slugSeen.clear()
  linkedTowns.clear()
  try {
    const parsed = marked.parse(markdown)
    const html = typeof parsed === 'string' ? parsed : String(parsed)
    return sanitizeTrustedMarkdownHtml(html)
  } catch (err) {
    console.error('[blog/render] marked.parse failed:', err)
    // Never take down the whole article page for a single bad markdown block.
    return sanitizeTrustedMarkdownHtml(
      `<p>${escapeHtml(markdown.slice(0, 2000))}</p>`,
    )
  }
}

/** Calculate a rough read-time in minutes. */
export function readTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).length
  return Math.max(1, Math.round(words / 220))
}

/** Extract h2/h3 headings for a TOC. */
export interface TocItem {
  readonly level: 2 | 3
  readonly text: string
  readonly id: string
}

export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = []
  const lines = markdown.split('\n')
  const seen = new Set<string>()
  for (const line of lines) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (!m) continue
    const level = m[1].length as 2 | 3
    const plain = m[2].replace(/[*_`]/g, '').trim()
    let id = slugifyHeading(plain)
    let n = 1
    while (seen.has(id)) {
      n += 1
      id = `${slugifyHeading(plain)}-${n}`
    }
    seen.add(id)
    items.push({ level, text: plain, id })
  }
  return items
}