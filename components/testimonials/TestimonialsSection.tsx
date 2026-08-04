// components/testimonials/TestimonialsSection.tsx
// Displays customer testimonials with star ratings in an auto-sliding
// carousel. Used on the home page and can be reused on landing pages.

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import { TESTIMONIALS, getTestimonialStats, type Testimonial } from '@/lib/testimonials/data'

interface TestimonialsSectionProps {
  readonly title?: string
  readonly subtitle?: string
}

const AUTO_SLIDE_INTERVAL_MS = 5000

const SLIDES_TO_SHOW = {
  mobile: 1,
  tablet: 2,
  desktop: 3,
}

export function TestimonialsSection({
  title = 'What builders say about us',
  subtitle = 'Reviews from trade customers and self-builders across the South East.',
}: TestimonialsSectionProps) {
  const stats = getTestimonialStats()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const getSlidesToShow = useCallback(() => {
    if (typeof window === 'undefined') return SLIDES_TO_SHOW.desktop
    if (window.innerWidth >= 1024) return SLIDES_TO_SHOW.desktop
    if (window.innerWidth >= 640) return SLIDES_TO_SHOW.tablet
    return SLIDES_TO_SHOW.mobile
  }, [])

  const [slidesVisible, setSlidesVisible] = useState(SLIDES_TO_SHOW.desktop)
  const maxIndex = Math.max(0, TESTIMONIALS.length - slidesVisible)
  const safeIndex = Math.min(currentIndex, maxIndex)

  useEffect(() => {
    const handleResize = () => setSlidesVisible(getSlidesToShow())
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [getSlidesToShow])

  // No auto-slide. Earlier versions advanced every 5s but the constant
  // motion read as "the image is moving" on this section (same complaint
  // that prompted the Hero to go static). Visitors drive the carousel via
  // the arrows + dots; the cards sit still otherwise. `isPaused` and the
  // hover handlers are kept below in case a future revision wants manual
  // pause-on-hover, but the interval is no longer started.
  useEffect(() => {
    return () => {
      /* no-op: auto-slide disabled */
    }
  }, [isPaused, slidesVisible, maxIndex])

  const goTo = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, maxIndex)))
  }, [maxIndex])

  const goPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev <= 0 ? maxIndex : prev - 1))
  }, [maxIndex])

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev >= maxIndex ? 0 : prev + 1))
  }, [maxIndex])

  const translatePercent = (100 / slidesVisible) * safeIndex

  if (TESTIMONIALS.length === 0) return null

  return (
    <section
      aria-labelledby="testimonials-heading"
      className="relative isolate overflow-hidden border-y border-border bg-muted/30 py-16 sm:py-20 lg:py-24"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
      <div className="absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-primary/5 blur-3xl" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="flex items-center justify-center gap-3">
            <span aria-hidden className="h-px w-10 bg-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
              Testimonials
            </span>
            <span aria-hidden className="h-px w-10 bg-primary" />
          </div>
          <h2
            id="testimonials-heading"
            className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
          >
            {title}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            {subtitle}
          </p>

          {stats.totalReviews > 0 && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 shadow-sm">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < Math.round(stats.averageRating) ? 'fill-primary text-primary' : 'text-muted'
                    }`}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-foreground">
                {stats.averageRating} out of 5
              </span>
              <span className="text-xs text-muted-foreground">
                ({stats.totalReviews} reviews)
              </span>
            </div>
          )}
        </div>

        <div className="relative mt-12">
          {/* Carousel track */}
          <div className="overflow-hidden" ref={trackRef}>
            <div
              className="flex transition-transform duration-500 ease-out will-change-transform"
              style={{ transform: `translateX(-${translatePercent}%)` }}
              aria-live="polite"
              aria-atomic="true"
            >
              {TESTIMONIALS.map((testimonial, index) => (
                <div
                  key={index}
                  className="w-full flex-shrink-0 px-3 sm:w-1/2 lg:w-1/3"
                  aria-roledescription="slide"
                  aria-label={`Review ${index + 1} of ${TESTIMONIALS.length}`}
                >
                  <TestimonialCard testimonial={testimonial} />
                </div>
              ))}
            </div>
          </div>

          {/* Navigation arrows */}
          {TESTIMONIALS.length > slidesVisible && (
            <>
              <button
                type="button"
                onClick={goPrevious}
                className="absolute left-0 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card p-2 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:flex"
                aria-label="Previous review"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-0 top-1/2 hidden translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card p-2 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:flex"
                aria-label="Next review"
              >
                <ChevronRight className="h-5 w-5 text-foreground" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Dots */}
        {TESTIMONIALS.length > slidesVisible && (
          <div className="mt-8 flex justify-center gap-2" role="tablist" aria-label="Review slides">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={safeIndex === i}
                aria-label={`Go to review slide ${i + 1}`}
                onClick={() => goTo(i)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <span
                  className={`h-2.5 rounded-full transition-all ${
                    safeIndex === i ? 'w-6 bg-primary' : 'w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TestimonialCard({ testimonial }: { readonly testimonial: Testimonial }) {
  const initials = testimonial.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <article className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-8">
      <div className="flex items-start justify-between">
        <Quote className="h-8 w-8 text-primary/30" aria-hidden="true" />
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${
                i < testimonial.rating ? 'fill-primary text-primary' : 'text-muted'
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <p className="mt-5 flex-1 text-base leading-relaxed text-foreground">
        &ldquo;{testimonial.text}&rdquo;
      </p>

      <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {initials}
        </div>
        <div>
          <p className="font-semibold text-foreground">{testimonial.name}</p>
          <p className="text-xs text-muted-foreground">{testimonial.role}</p>
        </div>
      </div>
    </article>
  )
}
