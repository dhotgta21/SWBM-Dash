'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { BRAND_LOGO_ASPECT } from '@/lib/brand'
import {
  DEMO_COMPANY_NAME,
  getDefaultCompanyName,
  useStarHawkWordmark,
} from '@/lib/demo/brand'

type DashboardBrandVariant = 'horizontal' | 'mobile' | 'collapsed'

interface DashboardBrandProps {
  companyName?: string | null
  variant?: DashboardBrandVariant
  className?: string
  logoUrl?: string | null
  logoUpdatedAt?: string | null
}

const DEFAULT_LOGO = '/Logo.webp'
const DEFAULT_NAME = getDefaultCompanyName()
const OFFICIAL_TITLE = 'STAR HAWK'
const OFFICIAL_SUBTITLE = 'BUILDERS MERCHANT LTD.'
const DEMO_TITLE = 'DEMO BUILDER'
const DEMO_SUBTITLE = 'MERCHANT'

// Aspect ratio of public/Logo.png — single source of truth in lib/brand.ts.
const LOGO_ASPECT = BRAND_LOGO_ASPECT

function buildLogoSrc(logoUrl: string | null | undefined, logoUpdatedAt: string | null | undefined): string {
  const base = logoUrl || DEFAULT_LOGO
  if (!logoUpdatedAt) return base
  return `${base}?v=${new Date(logoUpdatedAt).getTime()}`
}

export function DashboardBrand({
  companyName,
  variant = 'horizontal',
  className,
  logoUrl,
  logoUpdatedAt,
}: DashboardBrandProps) {
  const resolvedName = companyName || DEFAULT_NAME
  const resolvedLogo = buildLogoSrc(logoUrl, logoUpdatedAt)
  const isStarHawkWordmark = useStarHawkWordmark(companyName)
  const isDemoWordmark =
    !isStarHawkWordmark &&
    (!companyName || companyName === DEMO_COMPANY_NAME || companyName === DEFAULT_NAME)
  const isOfficialBrand = isStarHawkWordmark || isDemoWordmark
  const wordmarkTitle = isStarHawkWordmark ? OFFICIAL_TITLE : DEMO_TITLE
  const wordmarkSubtitle = isStarHawkWordmark ? OFFICIAL_SUBTITLE : DEMO_SUBTITLE

  if (variant === 'collapsed') {
    return (
      <div className={cn('relative h-9 w-9 shrink-0', className)}>
        <Image
          src={resolvedLogo}
          alt={isOfficialBrand ? `${wordmarkTitle} ${wordmarkSubtitle}` : resolvedName}
          fill
          sizes="40px"
          priority
          unoptimized
          className="object-contain"
        />
      </div>
    )
  }

  const isMobile = variant === 'mobile'
  const iconSize = isMobile ? 44 : 56
  const iconHeight = Math.round(iconSize / LOGO_ASPECT)

  return (
    <div className={cn('flex items-center gap-3 select-none min-w-0', className)}>
      <div
        className="relative shrink-0"
        style={{ width: iconSize, height: iconHeight }}
      >
        <Image
          src={resolvedLogo}
          alt={isOfficialBrand ? `${wordmarkTitle} ${wordmarkSubtitle}` : resolvedName}
          fill
          sizes="80px"
          priority
          unoptimized
          className="object-contain"
        />
      </div>

      {isOfficialBrand ? (
        <>
          <div aria-hidden className="h-8 w-px bg-border shrink-0" />
          <div className="flex flex-col leading-tight">
            <span
              className={cn(
                'font-extrabold tracking-[0.08em] text-foreground',
                isMobile ? 'text-sm' : 'text-base'
              )}
            >
              {wordmarkTitle}
            </span>
            <span
              className={cn(
                'tracking-[0.18em] text-muted-foreground',
                isMobile ? 'text-[10px]' : 'text-[11px]'
              )}
            >
              {wordmarkSubtitle}
            </span>
          </div>
        </>
      ) : (
        <span
          className={cn(
            'font-extrabold tracking-[0.04em] text-foreground truncate min-w-0',
            isMobile ? 'text-sm' : 'text-base'
          )}
        >
          {resolvedName}
        </span>
      )}
    </div>
  )
}
