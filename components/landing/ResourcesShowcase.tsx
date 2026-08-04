// components/landing/ResourcesShowcase.tsx
// Surfaces the site's most useful free resources — material calculators
// and step-by-step build guides — directly on the home page so visitors
// see them before they bounce. Links through to the full /tools and
// /guides indexes.

import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Box,
  Grid3X3,
  ArrowRightLeft,
  Calculator,
  Clock,
  Hammer,
  Tag,
  BookOpen,
} from 'lucide-react'
import type { GuideHubCard } from '@/lib/guides/loader'

interface ResourcesShowcaseProps {
  guides: readonly GuideHubCard[]
}

const FEATURED_TOOLS = [
  {
    href: '/tools/concrete-calculator',
    icon: Box,
    title: 'Concrete calculator',
    body: 'Work out the volume of concrete you need for slabs, strip footings and columns.',
  },
  {
    href: '/tools/paving-calculator',
    icon: Grid3X3,
    title: 'Paving calculator',
    body: 'Estimate slabs, MOT Type 1 sub-base and bedding sand for patios and pathways.',
  },
  {
    href: '/tools/unit-converter',
    icon: ArrowRightLeft,
    title: 'Unit converter',
    body: 'Convert metres to feet, m² to ft², m³ to cubic yards, kg to tonnes and more.',
  },
] as const

const DIFFICULTY_LABELS: Record<GuideHubCard['difficulty'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export function ResourcesShowcase({ guides }: ResourcesShowcaseProps) {
  const latestGuides = guides.slice(0, 3)

  return (
    <section
      id="resources"
      aria-labelledby="resources-heading"
      className="scroll-mt-20 border-y border-border bg-card py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-px w-10 bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
                Tools & resources
              </span>
            </div>
            <h2
              id="resources-heading"
              className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
            >
              Free tools and build guides.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Estimate quantities before you quote, or follow our step-by-step
              guides for the jobs we get asked about most.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/tools"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
            >
              <Calculator className="h-4 w-4" aria-hidden="true" />
              All tools
            </Link>
            <Link
              href="/guides"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              All guides
            </Link>
          </div>
        </div>

        {/* Tools row */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_TOOLS.map(({ href, icon: Icon, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-2xl border border-border bg-background p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-8"
            >
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                Open tool
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>

        {/* Guides row */}
        {latestGuides.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                Latest how-to guides
              </h3>
              <Link
                href="/guides"
                className="hidden items-center gap-1 text-sm font-semibold text-primary transition-transform hover:translate-x-0.5 sm:inline-flex"
              >
                See all guides
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {latestGuides.map((guide) => (
                <GuidePreviewCard key={guide.slug} guide={guide} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function GuidePreviewCard({ guide }: { readonly guide: GuideHubCard }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
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
      </Link>

      <div className="flex flex-1 flex-col p-5">
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
            {DIFFICULTY_LABELS[guide.difficulty]}
          </span>
        </div>

        <h4 className="mt-3 text-base font-bold tracking-tight text-foreground sm:text-lg">
          <Link
            href={`/guides/${guide.slug}`}
            className="transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {guide.title}
          </Link>
        </h4>

        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-muted-foreground">
          {guide.excerpt}
        </p>

        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-transform duration-300 group-hover:translate-x-0.5">
          Read guide
          <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}
