// components/blog/CaseStudyCard.tsx
// Reusable case-study card used on the blog index, related posts and
// anywhere else a compact project preview is needed.

import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, MapPin, Calendar, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import type { CaseStudyPost, ProjectType } from '@/lib/blog/loader'

export interface CaseStudyCardProps {
  readonly post: CaseStudyPost
  readonly showType?: boolean
}

const TYPE_LABELS: Record<ProjectType, string> = {
  extension: 'Extension',
  'loft-conversion': 'Loft conversion',
  'self-build': 'Self-build',
  'new-build': 'New build',
  'garden-office': 'Garden office',
  commercial: 'Commercial',
  renovation: 'Renovation',
  outbuilding: 'Outbuilding',
  refurbishment: 'Refurbishment',
  reroof: 'Re-roof',
  'garage-conversion': 'Garage conversion',
  'barn-conversion': 'Barn conversion',
  driveway: 'Driveway',
}

export function CaseStudyCard({ post, showType = true }: CaseStudyCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/case-studies/${post.slug}`} className="relative block overflow-hidden">
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
        {showType && (
          <Badge
            variant="primary"
            className="absolute left-4 top-4 bg-background/95 text-foreground backdrop-blur-sm"
          >
            {TYPE_LABELS[post.projectType] ?? post.projectType}
          </Badge>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          <Link
            href={`/locations/${post.townSlug}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            <MapPin className="h-3 w-3" aria-hidden="true" />
            {post.town}
          </Link>
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
            href={`/case-studies/${post.slug}`}
            className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {post.title}
          </Link>
        </h3>

        <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
          {post.excerpt}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {post.duration}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform duration-300 group-hover:translate-x-0.5">
            Read case study
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </div>
      </div>
    </article>
  )
}
