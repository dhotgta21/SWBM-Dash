'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BRAND_LOGO_ASPECT } from '@/lib/brand'
import {
  getDefaultLegalName,
  getWordmarkLines,
} from '@/lib/demo/brand'

type BrandVariant = 'horizontal' | 'sidebar' | 'login' | 'mobile' | 'collapsed'

interface BrandLogoProps {
  /**
   * Layout variant. Controls image sizing so the logo reads as "the same
   * brand mark" everywhere — but tuned to the real estate it lives in.
   *
   *  - `horizontal`→ composite mark + wordmark side-by-side. Used in headers
   *                   and the dashboard sidebar when space allows.
   *  - `sidebar`   → full mark + red rule, fits the 64-px tall sidebar header.
   *  - `login`     → the same mark, scaled up, for the login card hero.
   *  - `mobile`    → compact mark for the mobile top bar.
   *  - `collapsed` → compact mark only.
   *
   * The wordmark ("STAR HAWK" + "BUILDERS MERCHANT LTD.") is rendered in
   * HTML so it stays crisp at small header sizes; the image source is the
   * lettermark PNG in `public/Logo.png`. Update the brand mark in one place:
   * replace `public/Logo.png` and keep `BRAND_LOGO_ASPECT` in
   * `lib/brand.ts` in sync.
   */
  variant?: BrandVariant
  /**
   * Backwards-compatible shim for callers that still pass `imageSize`.
   * Maps the old pixel hint onto the closest variant.
   */
  imageSize?: number
  showText?: boolean
  className?: string
  logoUrl?: string | null
  logoUpdatedAt?: string | null
}

// See lib/brand.ts. Pulled from a shared constant so the dashboard variant
// and any future logo consumers can't drift out of sync.
const COMPOSITE_ASPECT = BRAND_LOGO_ASPECT

const DEFAULT_LOGO = '/Logo.webp'

function buildLogoSrc(logoUrl: string | null | undefined, logoUpdatedAt: string | null | undefined): string {
  const base = logoUrl || DEFAULT_LOGO
  if (!logoUpdatedAt) return base
  return `${base}?v=${new Date(logoUpdatedAt).getTime()}`
}

function sizeRecord(logoUrl: string | null | undefined, logoUpdatedAt: string | null | undefined): Record<
  BrandVariant,
  { imgW: number; imgH: number; rule: string; src: string }
> {
  const src = buildLogoSrc(logoUrl, logoUpdatedAt)
  return {
    horizontal: { imgW: 30,  imgH: Math.round(30  / COMPOSITE_ASPECT), rule: '',      src },
    sidebar:    { imgW: 32,  imgH: Math.round(32  / COMPOSITE_ASPECT), rule: 'mt-1.5', src },
    login:      { imgW: 56,  imgH: Math.round(56  / COMPOSITE_ASPECT), rule: 'mt-2.5', src },
    mobile:     { imgW: 24,  imgH: Math.round(24  / COMPOSITE_ASPECT), rule: 'mt-1',   src },
    collapsed:  { imgW: 20,  imgH: Math.round(20  / COMPOSITE_ASPECT), rule: '',       src },
  }
}

function pickVariant(imageSize?: number, showText?: boolean): BrandVariant {
  if (showText === false) return 'collapsed'
  if (imageSize === undefined) return 'sidebar'
  if (imageSize >= 80) return 'login'
  if (imageSize >= 50) return 'sidebar'
  if (imageSize >= 30) return 'mobile'
  return 'collapsed'
}

export function BrandLogo({
  variant,
  imageSize,
  showText = true,
  className,
  logoUrl,
  logoUpdatedAt,
}: BrandLogoProps) {
  const resolvedVariant = variant ?? pickVariant(imageSize, showText)
  const SIZES = sizeRecord(logoUrl, logoUpdatedAt)
  const legalName = getDefaultLegalName()
  const { title: titleLine, subtitle: subtitleLine } = getWordmarkLines()

  if (resolvedVariant === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-3 select-none', className)}>
        <div
          className="relative shrink-0"
          style={{ width: SIZES.horizontal.imgW, height: SIZES.horizontal.imgH }}
        >
          <Image
            src={SIZES.horizontal.src}
            alt={legalName}
            fill
            sizes="80px"
            priority
            unoptimized
            className="object-contain"
          />
        </div>
        <div aria-hidden className="h-6 w-px bg-border" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-extrabold tracking-[0.08em] text-foreground">
            {titleLine}
          </span>
          <span className="text-[9px] tracking-[0.18em] text-muted-foreground">
            {subtitleLine}
          </span>
        </div>
      </div>
    )
  }

  const sizes = SIZES[resolvedVariant]

  return (
    <div
      className={cn(
        'flex flex-col items-center select-none',
        resolvedVariant === 'mobile' && 'flex-row items-center gap-2',
        className
      )}
    >
      <div
        className={cn(
          'relative shrink-0',
          resolvedVariant === 'mobile' && 'flex-shrink-0'
        )}
        style={{ width: sizes.imgW, height: sizes.imgH }}
      >
        <Image
          src={sizes.src}
          alt={legalName}
          fill
          sizes="(max-width: 1024px) 60px, 110px"
          priority
          unoptimized
          className="object-contain"
        />
      </div>

      {sizes.rule && (
        <div
          aria-hidden
          className={cn('h-[2px] bg-primary rounded-full', sizes.rule)}
          style={{ width: Math.min(sizes.imgW + 16, resolvedVariant === 'login' ? 140 : 76) }}
        />
      )}
    </div>
  )
}
