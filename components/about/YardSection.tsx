// components/about/YardSection.tsx
// Two-column block on the About page: a left-side narrative about the
// yard + a right-side grid of section cards (bricks, timber, metal,
// etc.). All data comes from company_settings.yard_description and
// company_settings.yard_sections. Falls back to a clean copy block if
// the operator hasn't filled anything in yet.

import {
  ToyBrick,
  Trees,
  Construction,
  Layers,
  PanelsTopLeft,
  Snowflake,
  ShieldHalf,
  Droplets,
  Box,
  Pipette,
  Pin,
  Wrench,
  Home,
  type LucideIcon,
} from 'lucide-react'
import type { YardSection as YardSectionData } from '@/lib/company'

interface YardSectionProps {
  description: string | null
  fleetSize: number | null
  sections: readonly YardSectionData[]
  foundedYear: number | null
}

// Allowed Lucide icons for the yard-section cards. Anything outside this
// set falls back to a neutral Box so a typo in the icon name never breaks
// the page.
const ALLOWED_ICONS: Record<string, LucideIcon> = {
  ToyBrick,
  Trees,
  Construction,
  Layers,
  PanelsTopLeft,
  Snowflake,
  ShieldHalf,
  Droplets,
  Box,
  Pipette,
  Pin,
  Wrench,
  Home,
}

const FALLBACK_DESCRIPTION =
  "Our yard is laid out so you can find what you need in one trip. Bricks and tiles down one side, structural steel and lintels down the other, sheet materials and timber under cover at the back, and bulk aggregates in the open bay at the front. Two of our own lorries sit ready for same-day delivery across the region."

const FALLBACK_SECTIONS: YardSectionData[] = [
  { name: 'Bricks, blocks & tiles', icon: 'ToyBrick', blurb: 'Wirecut facing, engineering bricks and paver ranges down one wall.' },
  { name: 'Structural steel & lintels', icon: 'Construction', blurb: 'Catnic and IG lintels plus RSJs and structural sections.' },
  { name: 'Sheet materials & timber', icon: 'Trees', blurb: 'OSB, plywood, MDF and carcassing timber under cover.' },
  { name: 'Aggregates bay', icon: 'Layers', blurb: 'Sharp sand, ballast, gravel and Type 1 — by the tonne.' },
]

export function YardSection({
  description,
  fleetSize,
  sections,
  foundedYear,
}: YardSectionProps) {
  const copy = description?.trim() || FALLBACK_DESCRIPTION
  const items = sections.length > 0 ? sections : FALLBACK_SECTIONS

  const years = foundedYear ? new Date().getFullYear() - foundedYear : null

  return (
    <section
      id="yard"
      aria-labelledby="yard-heading"
      className="scroll-mt-20 border-t border-border bg-foreground py-16 text-background lg:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-px w-10 bg-primary" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">
            The yard
          </span>
        </div>
        <h2
          id="yard-heading"
          className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
        >
          One yard, stocked in depth.
        </h2>

        {/* Top stat strip — pulls live from settings. */}
        <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
          <YardStat value={fleetSize ? `${fleetSize}` : '2'} label="Lorries on the road" />
          <YardStat value="1" label="Yard, one site" />
          <YardStat value={`${items.length}`} label="Stocked sections" />
          <YardStat value={years ? `${years}+` : '8+'} label="Years on the counter" />
        </dl>

        <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left: narrative */}
          <div className="lg:col-span-5">
            <p className="text-base leading-relaxed text-white/80 sm:text-lg">
              {copy}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Plan a visit
              </a>
              <a
                href="/delivery"
                className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                See delivery area
              </a>
            </div>
          </div>

          {/* Right: section cards */}
          <div className="lg:col-span-7">
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.map((section, idx) => {
                const Icon = ALLOWED_ICONS[section.icon] ?? Box
                return (
                  <li
                    key={`${section.name}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:bg-white/10"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <p className="mt-4 text-base font-bold text-white">{section.name}</p>
                    {section.blurb && (
                      <p className="mt-1 text-sm leading-relaxed text-white/70">
                        {section.blurb}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function YardStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <dd className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
        {value}
      </dd>
      <dt className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">
        {label}
      </dt>
    </div>
  )
}