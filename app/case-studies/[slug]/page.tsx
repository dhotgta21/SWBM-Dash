// app/case-studies/[slug]/page.tsx
// Single case-study page. Renders one of:
//   - the post (if found), with full SEO metadata, JSON-LD, hero,
//     prose, materials block, FAQ, related posts and CTA; or
//   - notFound() (if the slug doesn't match a published post).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCaseStudy, listCaseStudies } from '@/lib/blog/loader'
import { renderCaseStudy, extractToc, readTimeMinutes } from '@/lib/blog/render'
import {
  blogPostingJsonLd,
  breadcrumbJsonLd,
  faqJsonLd,
  serviceJsonLd,
  loadCompanyForBlog,
} from '@/lib/blog/schema'
import { SITE_URL } from '@/lib/seo/company-seo'
import { JsonLd } from '@/components/seo/JsonLd'
import { BlogHero } from '@/components/blog/BlogHero'
import { Prose } from '@/components/blog/Prose'
import { MaterialList } from '@/components/blog/MaterialList'
import { BlogFaq } from '@/components/blog/BlogFaq'
import { RelatedPosts } from '@/components/blog/RelatedPosts'
import { BlogCta } from '@/components/blog/BlogCta'
import { BlogToc } from '@/components/blog/BlogToc'
import Link from 'next/link'

interface PageProps {
  readonly params: Promise<{ slug: string }>
}

// Force-dynamic so the per-request CSP nonce (set by proxy.ts) is
// applied to Next.js framework scripts and the JSON-LD <script> tags.
// nonce-based CSP is incompatible with ISR/static — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getCaseStudy(slug)
  if (!post) return { title: 'Case study not found' }

  const url = `${SITE_URL}/case-studies/${post.slug}`
  const ogImage = post.heroImage.startsWith('http')
    ? post.heroImage
    : `${SITE_URL}${post.heroImage}`

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: 'Demo Builder Merchant' }],
    keywords: [...post.tags],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      modifiedTime: post.date,
      authors: ['Demo Builder Merchant'],
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

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params
  const post = getCaseStudy(slug)
  if (!post) notFound()

  const company = await loadCompanyForBlog()
  const html = renderCaseStudy(post.body)
  const toc = extractToc(post.body)
  const minutes = readTimeMinutes(post.body)

  // JSON-LD: BlogPosting + FAQPage + BreadcrumbList + Service.
  const blocks: Array<unknown> = [
    blogPostingJsonLd(post, company),
    breadcrumbJsonLd(post, company),
    serviceJsonLd(post, company),
  ]
  const faqBlock = faqJsonLd(post)
  if (faqBlock) blocks.push(faqBlock)

  return (
    <article className="bg-background">
      {blocks.map((block, i) => (
        <JsonLd
          key={i}
          id={`ld-case-study-${slug}-${i}`}
          data={block}
        />
      ))}

      <BlogHero
        post={post}
        breadcrumb={{ label: 'Case studies', href: '/case-studies' }}
        kicker={`Case study · ${post.county}`}
        meta={[
          { label: 'Town', value: post.town },
          { label: 'Project', value: post.projectLabel },
          { label: 'Date', value: formatDate(post.date) },
          { label: 'Duration', value: post.duration },
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
              {post.projectLabel} · {post.county} · {post.postcodes.join(' / ')}
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {post.excerpt}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {minutes} min read · Published {formatDate(post.date)} · Client: {post.client}
            </p>
          </div>

          {/* Auto-linked prose body */}
          <Prose html={html} />

          <MaterialList materials={post.materials} />
          <BlogFaq items={post.faqs} />
          <BlogCta post={post} />
          <RelatedPosts slugs={post.related} />

          {/* Tail meta — cross-link to location, shop and home */}
          <div className="mt-14 space-y-4 border-t border-border pt-8 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-muted-foreground">Filed under:</span>
              {post.tags.map((t) => (
                <span key={t} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href={`/locations/${post.townSlug}`}
                className="font-semibold text-primary transition-colors hover:text-primary/80"
              >
                More projects in {post.town}
              </Link>
              <Link href="/quote" className="font-semibold text-primary transition-colors hover:text-primary/80">
                Request a quote
              </Link>
              <Link href="/catalogue" className="font-semibold text-primary transition-colors hover:text-primary/80">
                Browse catalogue
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

// Re-export so other modules can pull the full post list when needed.
export { listCaseStudies }
