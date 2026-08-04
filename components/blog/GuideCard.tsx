// components/blog/GuideCard.tsx
// Card for how-to guides. Mirrors ArticleCard / CaseStudyCard pixel-for-
// pixel so all three content surfaces (guides, advice, projects) feel
// like one publication: 16:10 hero image, primary badge overlay,
// category eyebrow, title, excerpt, "Read guide" CTA.
//
// Used by:
//   - app/guides/page.tsx            (hub)
//   - components/blog/GuidesGrid.tsx (filtered grid)
//   - components/blog/RelatedGuides  (cross-link block at guide detail)

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Clock, Hammer, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { GuidePost } from '@/lib/guides/loader'

export interface GuideCardProps {
  readonly guide: GuidePost
}

const DIFFICULTY_LABELS: Record<GuidePost['difficulty'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export function GuideCard({ guide }: GuideCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/guides/${guide.slug}`} className="relative block overflow-hidden">
        <div className="aspect-[16/10] w-full overflow-hidden bg-muted">
          <Image
            src={guide.heroImage}
            alt={guide.heroAlt}
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
          {guide.category}
        </Badge>
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Tag className="h-3 w-3" aria-hidden="true" />
            {guide.category}
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {guide.duration}
          </span>
          <span aria-hidden className="text-border">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <Hammer className="h-3 w-3" aria-hidden="true" />
            {DIFFICULTY_LABELS[guide.difficulty] ?? guide.difficulty}
          </span>
        </div>

        <h3 className="mt-3 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <Link
            href={`/guides/${guide.slug}`}
            className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {guide.title}
          </Link>
        </h3>

        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {guide.excerpt}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-xs font-medium text-muted-foreground">
            {formatDate(guide.date)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform duration-300 group-hover:translate-x-0.5">
            Read guide
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  )
}