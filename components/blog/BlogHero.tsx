// components/blog/BlogHero.tsx
// Full-bleed hero used by both case-study and advice pages.
// The parent route supplies the breadcrumb, kicker and meta items so the
// component stays generic while the page controls the SEO intent.

import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import type { BasePost } from '@/lib/content/types'

interface MetaItemSpec {
  readonly label: string
  readonly value: string
}

interface BreadcrumbSpec {
  readonly label: string
  readonly href: string
}

interface BlogHeroProps {
  readonly post: BasePost
  readonly breadcrumb: BreadcrumbSpec
  readonly kicker: string
  readonly meta: readonly MetaItemSpec[]
}

export function BlogHero({ post, breadcrumb, kicker, meta }: BlogHeroProps) {
  return (
    <header className="relative isolate overflow-hidden bg-foreground text-background">
      {/* Background media stack — video (if any) then image, both
          positioned absolute behind the content. */}
      {post.video ? (
        <video
          className="absolute inset-0 h-full w-full object-cover opacity-50"
          src={post.video}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          poster={post.heroImage}
        />
      ) : (
        <Image
          src={post.heroImage}
          alt={post.heroAlt}
          fill
          sizes="100vw"
          priority
          quality={75}
          className="object-cover opacity-50"
        />
      )}

      {/* Gradient overlay — keeps the heading legible no matter
          what the hero image contains. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/70 to-foreground/95"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-8 lg:pb-24 lg:pt-36">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-8">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-white/70">
            <li>
              <Link href="/" className="hover:text-primary">
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li>
              <Link href={breadcrumb.href} className="hover:text-primary">
                {breadcrumb.label}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3.5 w-3.5" />
            </li>
            <li className="text-white/90">{post.title}</li>
          </ol>
        </nav>

        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px w-10 bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            {kicker}
          </span>
        </div>

        <h1 className="mt-4 max-w-4xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {post.title}
        </h1>

        <p className="mt-5 max-w-3xl text-base leading-relaxed text-white/85 sm:text-lg">
          {post.excerpt}
        </p>

        {meta.length > 0 && (
          <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            {meta.map((item) => (
              <div key={item.label}>
                <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
                  {item.label}
                </dt>
                <dd className="mt-0.5 font-semibold text-white">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </header>
  )
}
