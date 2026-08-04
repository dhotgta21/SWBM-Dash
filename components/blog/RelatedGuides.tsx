// components/blog/RelatedGuides.tsx
// Cross-link block shown at the bottom of every guide detail page.
// Renders a 3-column grid of guide cards using the slugs declared in
// the guide's frontmatter. If no related guides are declared, the
// block renders nothing — keeps pages focused when there is only one
// sibling.
//
// Uses the shared GuideCard so related-guides match the hub cards
// pixel-for-pixel (16:10 hero, badge overlay, category eyebrow,
// "Read guide" CTA).

import { getRelatedGuides } from '@/lib/guides/loader'
import { GuideCard } from '@/components/blog/GuideCard'

interface RelatedGuidesProps {
  readonly slugs: readonly string[]
}

export function RelatedGuides({ slugs }: RelatedGuidesProps) {
  const posts = getRelatedGuides(slugs)
  if (posts.length === 0) return null

  return (
    <section
      aria-labelledby="related-guides-heading"
      className="mt-16 border-t border-border pt-12"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-10 bg-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
          More guides
        </span>
      </div>
      <h2
        id="related-guides-heading"
        className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
      >
        Related how-to guides
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        More step-by-step walkthroughs to help your project run smoothly.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <GuideCard key={p.slug} guide={p} />
        ))}
      </div>
    </section>
  )
}