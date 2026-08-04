'use client'

/**
 * PlasterWallVisual — wall outline with finish-specific hatching so the user
 * sees what their selected plaster finish looks like in plan.
 *
 * Each finish uses a distinct SVG pattern:
 *   - skim:      fine diagonal hatching (smooth top coat)
 *   - two_coat:  two-line bands (base + skim)
 *   - render:    stippled dot pattern (rough texture)
 *   - board:     rectangular grid (1.2 × 2.4 m plasterboard sheets)
 */

import { useMemo } from 'react'

export type PlasterFinish = 'skim' | 'two_coat' | 'render' | 'board'

export interface PlasterWallVisualProps {
  /** Area in square metres. */
  area: number
  finish: PlasterFinish
  className?: string
}

interface FinishMeta {
  label: string
  description: string
}

const FINISH_META: Record<PlasterFinish, FinishMeta> = {
  skim: { label: 'Skim coat', description: 'Smooth top coat' },
  two_coat: { label: 'Two-coat plaster', description: 'Base + skim' },
  render: { label: 'Render', description: 'Sand-and-cement base' },
  board: { label: 'Plasterboard', description: '1.2 × 2.4 m sheets' },
}

export function PlasterWallVisual({ area, finish, className }: PlasterWallVisualProps) {
  const view = useMemo(() => {
    const a = Math.max(area, 0)
    if (a <= 0) return null

    // Treat area as a wall: assume 2.4 m ceiling height, derive length.
    const ceilingH = 2.4
    const wallL = a / ceilingH
    // Cap wall length for visual sanity.
    const displayL = Math.min(wallL, 14)
    const scale = Math.min(380 / displayL, 160 / ceilingH)
    const drawL = displayL * scale
    const drawH = ceilingH * scale
    const offX = 60 + (380 - drawL) / 2
    const offY = 60 + (160 - drawH) / 2

    // For board finish, compute the grid of plasterboard sheets.
    const boardCols = Math.ceil(displayL / 1.2)
    const boardRows = Math.ceil(ceilingH / 2.4)
    const cellW = drawL / boardCols
    const cellH = drawH / boardRows

    return { drawL, drawH, offX, offY, boardCols, boardRows, cellW, cellH, displayL, area: a }
  }, [area])

  if (!view) return null
  const { drawL, drawH, offX, offY, boardCols, cellW, cellH, displayL, area: a } = view
  const meta = FINISH_META[finish]

  // Pattern IDs are namespaced per render so multiple instances don't collide.
  const pid = `plaster-${finish}-${Math.round(area)}`

  return (
    <figure
      className={className}
      role="img"
      aria-label={`${meta.label} covering ${a.toFixed(1)} square metres.`}
    >
      <svg viewBox="0 0 480 280" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {finish === 'skim' && (
            <pattern id={pid} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="var(--success-muted)" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="var(--success)" strokeWidth="1" />
            </pattern>
          )}
          {finish === 'two_coat' && (
            <pattern id={pid} patternUnits="userSpaceOnUse" width="14" height="14">
              <rect width="14" height="14" fill="var(--warning-muted)" />
              <rect width="14" height="7" fill="var(--info-muted)" />
              <line x1="0" y1="7" x2="14" y2="7" stroke="var(--info)" strokeWidth="0.8" strokeOpacity="0.7" />
            </pattern>
          )}
          {finish === 'render' && (
            <pattern id={pid} patternUnits="userSpaceOnUse" width="10" height="10">
              <rect width="10" height="10" fill="var(--warning-muted)" />
              <circle cx="2" cy="2" r="0.9" fill="var(--warning)" />
              <circle cx="7" cy="5" r="0.7" fill="var(--warning)" />
              <circle cx="4" cy="8" r="0.6" fill="var(--warning)" />
            </pattern>
          )}
          {finish === 'board' && (
            <pattern
              id={pid}
              patternUnits="userSpaceOnUse"
              width={cellW || 40}
              height={cellH || 80}
            >
              <rect width={cellW || 40} height={cellH || 80} fill="var(--info-muted)" />
              <rect
                x="2"
                y="2"
                width={(cellW || 40) - 4}
                height={(cellH || 80) - 4}
                fill="none"
                stroke="var(--info)"
                strokeWidth="0.6"
                strokeOpacity="0.6"
                rx="1"
              />
            </pattern>
          )}
        </defs>

        <rect x={6} y={6} width={468} height={268} rx={12} fill="var(--muted)" opacity={0.3} />

        <text
          x={20}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          {meta.label} · {meta.description}
        </text>

        {/* Wall rectangle with pattern fill */}
        <rect
          x={offX}
          y={offY}
          width={drawL}
          height={drawH}
          fill={`url(#${pid})`}
          stroke="var(--foreground)"
          strokeWidth={1.5}
          rx={1}
        />

        {/* Board grid lines overlay (only for board finish) */}
        {finish === 'board' &&
          Array.from({ length: boardCols - 1 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={offX + (i + 1) * cellW}
              y1={offY}
              x2={offX + (i + 1) * cellW}
              y2={offY + drawH}
              stroke="var(--info)"
              strokeWidth={0.6}
              strokeOpacity={0.5}
            />
          ))}

        {/* Length label */}
        <g>
          <line
            x1={offX}
            y1={offY + drawH + 14}
            x2={offX + drawL}
            y2={offY + drawH + 14}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX}
            y1={offY + drawH + 10}
            x2={offX}
            y2={offY + drawH + 18}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX + drawL}
            y1={offY + drawH + 10}
            x2={offX + drawL}
            y2={offY + drawH + 18}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX + drawL / 2}
            y={offY + drawH + 32}
            textAnchor="middle"
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {displayL.toFixed(1)} m
          </text>
        </g>

        {/* Height label */}
        <g>
          <line
            x1={offX - 14}
            y1={offY}
            x2={offX - 14}
            y2={offY + drawH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 18}
            y1={offY}
            x2={offX - 10}
            y2={offY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 18}
            y1={offY + drawH}
            x2={offX - 10}
            y2={offY + drawH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX - 22}
            y={offY + drawH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${offX - 22} ${offY + drawH / 2})`}
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            2.4 m
          </text>
        </g>

        {/* Area badge */}
        <g>
          <rect
            x={340}
            y={20}
            width={120}
            height={28}
            rx={14}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={1.2}
          />
          <text
            x={400}
            y={38}
            textAnchor="middle"
            style={{ fill: 'var(--primary)' }}
            className="text-[12px] font-bold"
          >
            {a.toFixed(1)} m²
          </text>
        </g>
      </svg>
    </figure>
  )
}