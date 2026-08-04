// components/about/HistoryTimeline.tsx
// Vertical timeline of business milestones surfaced on the /about page.
// Big year numbers + a short title and body for each row. Renders the
// staggered left/right pattern on lg+, straight stack on mobile.
//
// Empty state: if there are no milestones yet, renders a single
// "Founded in {year}" tile so the section never breaks the page.

import Image from 'next/image'
import { History } from 'lucide-react'
import type { HistoryMilestone } from '@/lib/about/loader'

interface HistoryTimelineProps {
  milestones: readonly HistoryMilestone[]
  foundedYear: number | null
}

export function HistoryTimeline({ milestones, foundedYear }: HistoryTimelineProps) {
  // Pad with a "Founded" milestone at the start if there isn't already
  // a milestone for the founding year. Keeps the timeline honest even
  // when the operator hasn't added any history rows yet.
  const rows: Array<HistoryMilestone | { year: number; title: string; body: string; imageUrl: null; id: string }> =
    milestones.length > 0
      ? [...milestones]
      : [
          {
            id: 'founded',
            year: foundedYear ?? 2017,
            title: 'Founded',
            body: 'Started with one yard, a second-hand forklift and a small but carefully chosen stock of aggregates, cement and timber. Built the reputation one delivery at a time.',
            imageUrl: null,
          },
        ]

  return (
    <section
      id="history"
      aria-labelledby="history-heading"
      className="scroll-mt-20 border-t border-border bg-background py-16 lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px w-10 bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            Our story
          </span>
        </div>
        <h2
          id="history-heading"
          className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
        >
          How we got here.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          A short history of the yard — from the first delivery to today.
        </p>

        {milestones.length === 0 && (
          <p className="mt-3 max-w-2xl text-xs italic text-muted-foreground">
            Add more milestones in Settings → Company history.
          </p>
        )}

        {/* Timeline rail. Vertical line is purely decorative (aria-hidden)
            so the actual content stays screen-reader clean. */}
        <ol className="relative mt-12 space-y-12 lg:space-y-16">
          <span
            aria-hidden
            className="absolute left-4 top-2 bottom-2 hidden w-px bg-border lg:left-1/2 lg:block"
          />

          {rows.map((row, idx) => {
            const isLeft = idx % 2 === 0
            return (
              <li
                key={row.id}
                className={`relative flex flex-col gap-4 lg:flex-row lg:items-start ${
                  isLeft ? '' : 'lg:flex-row-reverse'
                }`}
              >
                {/* Year badge — sits on the central rail on lg+. */}
                <div className="relative z-10 flex items-center gap-3 lg:absolute lg:left-1/2 lg:top-2 lg:-translate-x-1/2 lg:flex-col lg:gap-1">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-sm"
                  >
                    <History className="h-4 w-4" />
                  </span>
                  <span className="text-3xl font-extrabold tracking-tight text-primary lg:text-4xl">
                    {row.year}
                  </span>
                </div>

                {/* Card body. */}
                <div
                  className={`flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 lg:max-w-[calc(50%-2.5rem)] ${
                    isLeft ? 'lg:ml-auto lg:text-left' : 'lg:mr-auto lg:text-left'
                  }`}
                >
                  <h3 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {row.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                    {row.body}
                  </p>
                  {row.imageUrl && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border">
                      <div className="relative aspect-[16/9]">
                        <Image
                          src={row.imageUrl}
                          alt={row.title}
                          fill
                          sizes="(min-width: 1024px) 40vw, 90vw"
                          loading="lazy"
                          className="object-cover"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Spacer for the side without content so the year rail
                    stays centred in the viewport. */}
                <div className="hidden flex-1 lg:block" aria-hidden />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}