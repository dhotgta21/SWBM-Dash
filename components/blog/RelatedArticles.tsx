// components/blog/RelatedArticles.tsx
// Renders related advice articles at the bottom of a blog post.

import { ArticleCard } from '@/components/blog/ArticleCard'
import { getRelatedArticles } from '@/lib/articles/loader'

interface RelatedArticlesProps {
  readonly slugs: readonly string[]
}

export function RelatedArticles({ slugs }: RelatedArticlesProps) {
  const posts = getRelatedArticles(slugs)

  if (posts.length === 0) return null

  return (
    <section
      aria-labelledby="related-articles-heading"
      className="mt-16 border-t border-border pt-12"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px w-10 bg-primary" />
        <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
          Keep reading
        </span>
      </div>
      <h2
        id="related-articles-heading"
        className="mt-3 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl"
      >
        Related articles
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        More guides and advice to help your building project run smoothly.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <ArticleCard key={p.slug} post={p} />
        ))}
      </div>
    </section>
  )
}
