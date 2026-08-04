// app/guides/[slug]/page.tsx
// Single how-to guide page — renders a Markdown guide through the same
// editorial pipeline used by /blog and /case-studies.
//
// Layout mirrors the article / case-study detail page so all three
// content surfaces feel like one publication: full-bleed dark hero
// with the guide's hero image, side TOC, prose body with automatic
// material/town cross-linking, FAQ accordion, guides-specific CTA
// block, related guides cross-link, and the tail tag rail.
//
// Force-dynamic for the same nonce-based CSP reason blog and case
// study detail pages are.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Clock, Hammer, MapPin, Tag, Wrench } from 'lucide-react'
import { getGuide, listGuides } from '@/lib/guides/loader'
import {
  guideBreadcrumbJsonLd,
  guideFaqJsonLd,
  guidePostingJsonLd,
  howToJsonLd,
  parseGuideSections,
} from '@/lib/guides/schema'
import { renderCaseStudy, extractToc, readTimeMinutes } from '@/lib/blog/render'
import { SITE_URL } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { BlogHero } from '@/components/blog/BlogHero'
import { Prose } from '@/components/blog/Prose'
import { BlogFaq } from '@/components/blog/BlogFaq'
import { BlogToc } from '@/components/blog/BlogToc'
import { RelatedGuides } from '@/components/blog/RelatedGuides'
import { GuideCta } from '@/components/blog/GuideCta'

interface PageProps {
  readonly params: Promise<{ slug: string }>
}

export const dynamic = 'force-dynamic'

// No generateStaticParams: force-dynamic + static params is redundant and
// diverged from blog/case-study detail pages. Content is read from disk at
// request time via lib/guides/loader.

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getGuide(slug)
  if (!post) return { title: 'Guide not found' }

  const url = `${SITE_URL}/guides/${post.slug}`
  const ogImage = post.heroImage.startsWith('http')
    ? post.heroImage
    : `${SITE_URL}${post.heroImage}`

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    keywords: [...post.tags],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.date,
      authors: [post.author],
      tags: [...post.tags],
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: post.heroAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  }
}

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params
  const post = getGuide(slug)
  if (!post) notFound()

  const html = renderCaseStudy(post.body)
  const toc = extractToc(post.body)
  const minutes = readTimeMinutes(post.body)
  const sections = parseGuideSections(post.body)

  // JSON-LD blocks — BlogPosting (article), HowTo (procedural),
  // FAQPage (rich-result eligibility), BreadcrumbList.
  const blocks: unknown[] = [
    howToJsonLd(post, sections),
    await guidePostingJsonLd(post),
    await guideBreadcrumbJsonLd(post),
  ]
  const faqBlock = guideFaqJsonLd(post)
  if (faqBlock) blocks.push(faqBlock)

  // Difficulty band → human label.
  const difficultyLabel =
    post.difficulty === 'beginner'
      ? 'Beginner friendly'
      : post.difficulty === 'advanced'
        ? 'Advanced - consider hiring'
        : 'Intermediate'

  return (
    <article className="bg-background">
      {blocks.map((block, i) => (
        <JsonLd
          key={i}
          id={`ld-guide-${slug}-${i}`}
          data={block}
        />
      ))}

      <BlogHero
        post={post}
        breadcrumb={{ label: 'Guides', href: '/guides' }}
        kicker={`${post.category} · How-to`}
        meta={[
          { label: 'Category', value: post.category },
          { label: 'Difficulty', value: difficultyLabel },
          { label: 'Time', value: post.duration },
          { label: 'Read', value: `${minutes} min` },
        ]}
      />

      {/* Body */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:px-8 lg:py-16">
        <div className="h-full lg:col-span-3">
          <BlogToc items={toc} />
        </div>

        <div className="lg:col-span-9">
          {/* Standfirst + meta line */}
          <div className="mb-8 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {post.category} · {post.author}
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {post.excerpt}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" /> {minutes} min read
              </span>
              <span aria-hidden className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <Wrench className="h-3 w-3" aria-hidden="true" /> {post.duration}
              </span>
              <span aria-hidden className="text-border">·</span>
              <span className="inline-flex items-center gap-1">
                <Hammer className="h-3 w-3" aria-hidden="true" /> {difficultyLabel}
              </span>
              <span aria-hidden className="text-border">·</span>
              <span>Published {formatDate(post.date)}</span>
            </p>
          </div>

          {/* Auto-linked prose body */}
          <Prose html={html} />

          <BlogFaq items={post.faqs} />
          <GuideCta guide={post} />
          <RelatedGuides slugs={post.related} />

          {/* Tail meta — guides cross-link to the parent resources. */}
          <div className="mt-14 space-y-4 border-t border-border pt-8 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-muted-foreground">Filed under:</span>
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground"
                >
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/blog"
                className="font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Read advice articles
              </Link>
              <Link
                href="/case-studies"
                className="inline-flex items-center gap-1 font-semibold text-primary transition-colors hover:text-primary/80"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Browse case studies
              </Link>
              <Link
                href="/quote"
                className="font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Request a quote
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// Re-export so callers (e.g. the sitemap) can pull the full guide list.
export { listGuides }
