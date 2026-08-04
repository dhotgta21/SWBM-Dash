// components/blog/ArticleCard.tsx
// Card for advice / blog articles. Links to /blog/{slug}.

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Calendar, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { BlogArticle } from '@/lib/articles/loader'

export interface ArticleCardProps {
  readonly post: BlogArticle
}

export function ArticleCard({ post }: ArticleCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/blog/${post.slug}`} className="relative block overflow-hidden">
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
          <Image
            src={post.heroImage}
            alt={post.heroAlt}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            loading="lazy"
            quality={75}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <Badge
          variant="primary"
          className="absolute left-4 top-4 bg-background/95 text-foreground backdrop-blur-sm"
        >
          {post.category}
        </Badge>
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" aria-hidden="true" />
            {post.category}
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            {formatDate(post.date)}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <Link
            href={`/blog/${post.slug}`}
            className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {post.title}
          </Link>
        </h3>

        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform duration-300 group-hover:translate-x-0.5">
            Read article
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  )
}
