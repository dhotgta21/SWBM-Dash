'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SparklineProps {
  /**
   * Series values in chronological order (oldest first, newest last).
   * Should contain at least 2 points; fewer will render a flat line.
   */
  values: number[]
  /**
   * Visual tone — drives the stroke + fill colour. `auto` picks green for an
   * upward-trending series and red for downward, useful for "trend" callouts.
   */
  tone?: 'auto' | 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'muted'
  /**
   * Width × height in pixels. Sparklines are tiny on purpose; the parent
   * card controls layout. Defaults to 96 × 32.
   */
  width?: number
  height?: number
  className?: string
  /**
   * Show a translucent area fill below the line. Defaults to true.
   */
  filled?: boolean
  ariaLabel?: string
}

const TONE_COLORS: Record<NonNullable<SparklineProps['tone']>, { stroke: string; fill: string }> = {
  primary: { stroke: 'var(--primary)', fill: 'var(--primary)' },
  success: { stroke: 'var(--success)', fill: 'var(--success)' },
  warning: { stroke: 'var(--warning)', fill: 'var(--warning)' },
  destructive: { stroke: 'var(--destructive)', fill: 'var(--destructive)' },
  info: { stroke: 'var(--info)', fill: 'var(--info)' },
  muted: { stroke: 'var(--muted-foreground)', fill: 'var(--muted-foreground)' },
  auto: { stroke: 'var(--success)', fill: 'var(--success)' },
}

/**
 * Lightweight dependency-free sparkline.
 * Renders a smooth polyline + gradient fill suitable for KPI cards.
 */
export function Sparkline({
  values,
  tone = 'auto',
  width = 96,
  height = 32,
  className,
  filled = true,
  ariaLabel,
}: SparklineProps) {
  const id = useId().replace(/:/g, '')
  const gradientId = `sparkline-fill-${id}`

  if (!values || values.length < 2) {
    return (
      <div
        className={cn('inline-block', className)}
        style={{ width, height }}
        aria-hidden
      />
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const padding = 2
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const stepX = innerW / (values.length - 1)

  const points = values.map((v, i) => {
    const x = padding + i * stepX
    const y = padding + innerH - ((v - min) / range) * innerH
    return [x, y] as const
  })

  // Smooth path using a Catmull-Rom-to-Bezier conversion for a soft curve.
  const linePath = buildSmoothPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1][0]},${height - padding} L ${points[0][0]},${height - padding} Z`

  const resolvedTone = resolveTone(tone, values)
  const colors = TONE_COLORS[resolvedTone]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block overflow-visible', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.fill} stopOpacity="0.28" />
          <stop offset="100%" stopColor={colors.fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End-point marker — gives the line a focal point without clutter */}
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={2.5}
        fill={colors.stroke}
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    </svg>
  )
}

function resolveTone(
  tone: NonNullable<SparklineProps['tone']>,
  values: number[]
): NonNullable<SparklineProps['tone']> {
  if (tone !== 'auto') return tone
  const first = values[0]
  const last = values[values.length - 1]
  if (last === first) return 'muted'
  return last > first ? 'success' : 'destructive'
}

/**
 * Convert an array of [x, y] points into a smooth SVG path using Catmull-Rom
 * spline interpolation. Produces a soft, professional curve without needing
 * a charting library.
 */
function buildSmoothPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M ${x},${y}`
  }

  let d = `M ${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6

    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0]},${p2[1]}`
  }
  return d
}