// components/blog/RelatedPosts.tsx
// Renders the related-case-studies grid at the bottom of every
// post. The post's frontmatter carries 3 explicit slugs; we
// resolve them via the loader. Each card links through to the
// sibling post so Google sees a strong internal-link graph
// between town-targeted pages.

import { CaseStudyCard } from '@/components/blog/CaseStudyCard'
import { getCaseStudy } from '@/lib/blog/loader'

interface RelatedPostsProps {
  readonly slugs: readonly string[]
}

export function RelatedPosts({ slugs }: RelatedPostsProps) {
  const posts = slugs
    .map((s) => getCaseStudy(s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))

  if (posts.length === 0) return null

  return (
    <section
      aria-labelledby="related-heading"
      className="mt-16 border-t border-border pt-12"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-10 bg-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
          More projects
        </span>
      </div>
      <h2
        id="related-heading"
        className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
      >
        Related case studies
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        See how we supply the same standard of materials and service to
        projects across {posts.map((p) => p.town).join(', ')} and the
        wider delivery area.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <CaseStudyCard key={p.slug} post={p} showType />
        ))}
      </div>
    </section>
  )
}
