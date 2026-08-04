'use client'

/**
 * CoverageVisual — wall being painted (one layer per coat) plus a row of
 * paint containers underneath showing how many tubs the user needs to buy.
 *
 * Animations: subtle paint fill transitions when the user changes coats/area.
 * Respects prefers-reduced-motion via globals.css.
 */

import { useMemo } from 'react'

export interface CoverageVisualProps {
  /** Total area in square metres. */
  area: number
  /** Coverage per unit in m² per L (or kg). */
  coveragePerUnit: number
  /** Number of coats. */
  coats: number
  /** Container size in L/kg. */
  unitSize: number
  /** Total material required (L or kg). */
  totalMaterial: number
  /** Containers needed. */
  containers: number
  /** Display label for the material unit (e.g. 'L', 'kg', 'bag'). */
  unitLabel: string
  className?: string
}

const COAT_COLORS = [
  { fill: 'var(--info-muted)', stroke: 'var(--info)' },
  { fill: 'var(--success-muted)', stroke: 'var(--success)' },
  { fill: 'var(--warning-muted)', stroke: 'var(--warning)' },
  { fill: 'var(--primary-muted)', stroke: 'var(--primary)' },
]

export function CoverageVisual({
  area,
  coveragePerUnit,
  coats,
  unitSize,
  totalMaterial,
  containers,
  unitLabel,
  className,
}: CoverageVisualProps) {
  // Wall: assume 2.4 m ceiling height, derive wall length from area.
  const view = useMemo(() => {
    const a = Math.max(area, 0)
    const ceilingH = 2.4
    const wallL = a / ceilingH
    const displayL = Math.min(wallL, 14)
    const scale = Math.min(320 / displayL, 140 / ceilingH)
    const drawL = displayL * scale
    const drawH = ceilingH * scale
    const offX = 70 + (320 - drawL) / 2
    const offY = 40 + (140 - drawH) / 2
    return { drawL, drawH, offX, offY, displayL }
  }, [area])

  // Cap containers shown in the bucket row at 12 to avoid overflow; show "+N more".
  const visibleBuckets = Math.min(containers, 12)
  const extraBuckets = Math.max(0, containers - visibleBuckets)

  // Cap visual coats at 4 (most common); show "×N" if more.
  const visualCoats = Math.min(coats, 4)

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Coverage visual: ${area.toFixed(1)} square metres over ${coats} coat${coats === 1 ? '' : 's'}. You need ${containers} ${unitLabel} containers.`}
    >
      <svg viewBox="0 0 480 320" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <rect x={6} y={6} width={468} height={308} rx={12} fill="var(--muted)" opacity={0.3} />

        <text
          x={20}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Wall coverage · {area.toFixed(1)} m² · {coats} coat{coats === 1 ? '' : 's'}
        </text>

        {view && (
          <>
            {/* Wall */}
            <rect
              x={view.offX}
              y={view.offY}
              width={view.drawL}
              height={view.drawH}
              fill="var(--card)"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              rx={1}
            />

            {/* Coats stacked — each is a smaller rectangle inside the wall. */}
            {Array.from({ length: visualCoats }).map((_, i) => {
              const inset = 3 + i * 4
              const c = COAT_COLORS[i % COAT_COLORS.length]
              return (
                <rect
                  key={i}
                  x={view.offX + inset}
                  y={view.offY + inset}
                  width={Math.max(0, view.drawL - inset * 2)}
                  height={Math.max(0, view.drawH - inset * 2)}
                  fill={c.fill}
                  stroke={c.stroke}
                  strokeWidth={1}
                  rx={1}
                  style={{
                    transition: 'all 220ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              )
            })}
            {coats > visualCoats && (
              <text
                x={view.offX + view.drawL + 8}
                y={view.offY + view.drawH / 2 + 4}
                style={{ fill: 'var(--muted-foreground)' }}
                className="text-[10px] font-medium"
              >
                ×{coats} coats
              </text>
            )}

            {/* Length label */}
            <g>
              <line
                x1={view.offX}
                y1={view.offY + view.drawH + 14}
                x2={view.offX + view.drawL}
                y2={view.offY + view.drawH + 14}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
              />
              <line
                x1={view.offX}
                y1={view.offY + view.drawH + 10}
                x2={view.offX}
                y2={view.offY + view.drawH + 18}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
              />
              <line
                x1={view.offX + view.drawL}
                y1={view.offY + view.drawH + 10}
                x2={view.offX + view.drawL}
                y2={view.offY + view.drawH + 18}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
              />
              <text
                x={view.offX + view.drawL / 2}
                y={view.offY + view.drawH + 32}
                textAnchor="middle"
                style={{ fill: 'var(--muted-foreground)' }}
                className="text-[11px] font-medium"
              >
                {view.displayL.toFixed(1)} m
              </text>
            </g>
          </>
        )}

        {/* Containers row */}
        <line
          x1={20}
          y1={240}
          x2={460}
          y2={240}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={20}
          y={234}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Containers to buy · {containers} × {unitSize} {unitLabel}
        </text>

        {Array.from({ length: visibleBuckets }).map((_, i) => {
          const total = visibleBuckets
          const gap = 6
          const bucketW = 28
          const bucketH = 36
          const totalW = total * bucketW + (total - 1) * gap
          const startX = (480 - totalW) / 2
          const x = startX + i * (bucketW + gap)
          const y = 252
          return (
            <g key={i}>
              {/* Bucket body */}
              <path
                d={`M ${x} ${y + 4} L ${x + bucketW} ${y + 4} L ${x + bucketW - 3} ${y + bucketH} L ${x + 3} ${y + bucketH} Z`}
                fill="var(--primary)"
                stroke="var(--primary-hover)"
                strokeWidth={1}
              />
              {/* Bucket handle */}
              <path
                d={`M ${x + 4} ${y + 4} Q ${x + bucketW / 2} ${y - 6} ${x + bucketW - 4} ${y + 4}`}
                fill="none"
                stroke="var(--primary-hover)"
                strokeWidth={1.5}
              />
              {/* Label */}
              <text
                x={x + bucketW / 2}
                y={y + bucketH + 12}
                textAnchor="middle"
                style={{ fill: 'var(--muted-foreground)' }}
                className="text-[9px] font-medium"
              >
                {unitSize}{unitLabel}
              </text>
            </g>
          )
        })}
        {extraBuckets > 0 && (
          <text
            x={460}
            y={274}
            textAnchor="end"
            style={{ fill: 'var(--foreground)' }}
            className="text-[11px] font-semibold"
          >
            + {extraBuckets} more
          </text>
        )}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Total material: <strong className="text-foreground">{totalMaterial.toFixed(1)} {unitLabel}</strong>
        </span>
        {coveragePerUnit > 0 && (
          <span>
            Coverage: <strong className="text-foreground">{coveragePerUnit} m²/{unitLabel}</strong>
          </span>
        )}
      </figcaption>
    </figure>
  )
}