'use client'

/**
 * MortarWallVisual — 2D drawing of a wall with a mix-ratio bar showing the
 * cement-to-sand ratio for the selected mix.
 *
 * When the calculator is in "wall" mode, the wall is drawn to scale from the
 * entered length/height. When in "volume" mode, a generic wall outline is
 * shown with the volume labelled.
 */

import { useMemo } from 'react'

export interface MortarWallVisualProps {
  mode: 'wall' | 'volume'
  /** Wall length in metres. */
  length: number
  /** Wall height in metres. */
  height: number
  /** Mortar volume in m³ (volume mode). */
  volume: number
  /** Selected mix — used for the cement:sand ratio bar. */
  mixKey: '1:3' | '1:4' | '1:5'
  className?: string
}

const MIX_RATIOS: Record<MortarWallVisualProps['mixKey'], { cement: number; sand: number; label: string }> = {
  '1:3': { cement: 1, sand: 3, label: '1:3 (strong)' },
  '1:4': { cement: 1, sand: 4, label: '1:4 (standard)' },
  '1:5': { cement: 1, sand: 5, label: '1:5 (lean)' },
}

export function MortarWallVisual({
  mode,
  length,
  height,
  volume,
  mixKey,
  className,
}: MortarWallVisualProps) {
  const view = useMemo(() => {
    const l = Math.max(length, 0)
    const h = Math.max(height, 0)
    const v = Math.max(volume, 0)
    if (mode === 'wall' && (l <= 0 || h <= 0)) return null
    if (mode === 'volume' && v <= 0) return null

    // Wall canvas: 280×220 inside viewBox 360×260
    const usableW = 240
    const usableH = 160
    const wallL = mode === 'wall' ? l : 4 // generic 4 m placeholder for volume mode
    const wallH = mode === 'wall' ? h : 2.4
    const scale = Math.min(usableW / wallL, usableH / wallH)
    const drawL = wallL * scale
    const drawH = wallH * scale
    const offX = 70 + (usableW - drawL) / 2
    const offY = 60 + (usableH - drawH) / 2

    return { drawL, drawH, offX, offY, wallL, wallH }
  }, [mode, length, height, volume])

  const ratios = MIX_RATIOS[mixKey] ?? MIX_RATIOS['1:4']
  const totalParts = ratios.cement + ratios.sand
  const cementPct = (ratios.cement / totalParts) * 100
  const sandPct = (ratios.sand / totalParts) * 100

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Mortar wall visual: ${ratios.label} mix, ${cementPct.toFixed(0)}% cement, ${sandPct.toFixed(0)}% sand.`}
    >
      <svg viewBox="0 0 480 280" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="mortar-bricks"
            patternUnits="userSpaceOnUse"
            width="22"
            height="12"
          >
            <rect width="22" height="12" fill="var(--warning-muted)" />
            <path d="M0 0 H22 M0 6 H22" stroke="var(--warning)" strokeWidth="0.5" strokeOpacity="0.7" />
            <path d="M11 0 V6 M0 6 V12 M22 6 V12" stroke="var(--warning)" strokeWidth="0.5" strokeOpacity="0.5" />
          </pattern>
        </defs>

        <rect x={6} y={6} width={468} height={268} rx={12} fill="var(--muted)" opacity={0.3} />

        {/* Ground line */}
        <line
          x1={20}
          y1={240}
          x2={460}
          y2={240}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />

        {view && (
          <>
            {/* Wall */}
            <rect
              x={view.offX}
              y={view.offY}
              width={view.drawL}
              height={view.drawH}
              fill="url(#mortar-bricks)"
              stroke="var(--foreground)"
              strokeWidth={1.5}
              rx={1}
            />

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
                {mode === 'wall' ? `${view.wallL.toFixed(2)} m` : `${volume.toFixed(2)} m³ volume`}
              </text>
            </g>

            {/* Height label — only meaningful in wall mode */}
            {mode === 'wall' && (
              <g>
                <line
                  x1={view.offX - 14}
                  y1={view.offY}
                  x2={view.offX - 14}
                  y2={view.offY + view.drawH}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                />
                <line
                  x1={view.offX - 18}
                  y1={view.offY}
                  x2={view.offX - 10}
                  y2={view.offY}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                />
                <line
                  x1={view.offX - 18}
                  y1={view.offY + view.drawH}
                  x2={view.offX - 10}
                  y2={view.offY + view.drawH}
                  stroke="var(--muted-foreground)"
                  strokeWidth={1}
                />
                <text
                  x={view.offX - 22}
                  y={view.offY + view.drawH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 ${view.offX - 22} ${view.offY + view.drawH / 2})`}
                  style={{ fill: 'var(--muted-foreground)' }}
                  className="text-[11px] font-medium"
                >
                  {view.wallH.toFixed(2)} m
                </text>
              </g>
            )}
          </>
        )}

        {/* Mix ratio bar */}
        <g>
          <text
            x={20}
            y={30}
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[10px] font-semibold uppercase tracking-wider"
          >
            Mix ratio · {ratios.label}
          </text>

          {/* Bar background */}
          <rect
            x={20}
            y={40}
            width={440}
            height={14}
            rx={4}
            fill="var(--muted)"
            stroke="var(--border)"
            strokeWidth={1}
          />
          {/* Cement slice */}
          <rect
            x={20}
            y={40}
            width={(cementPct / 100) * 440}
            height={14}
            rx={4}
            fill="var(--info)"
          />
          {/* Sand slice (positioned after cement) */}
          <rect
            x={20 + (cementPct / 100) * 440}
            y={40}
            width={(sandPct / 100) * 440}
            height={14}
            fill="var(--warning)"
            rx={4}
          />
          {/* Labels */}
          <text
            x={28}
            y={51}
            style={{ fill: 'var(--info-foreground)' }}
            className="text-[10px] font-semibold"
          >
            Cement {ratios.cement}
          </text>
          <text
            x={452}
            y={51}
            textAnchor="end"
            style={{ fill: 'var(--warning-foreground)' }}
            className="text-[10px] font-semibold"
          >
            Sand {ratios.sand}
          </text>
        </g>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: 'var(--info)' }}
            aria-hidden
          />
          Cement
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: 'var(--warning)' }}
            aria-hidden
          />
          Sand
        </span>
      </figcaption>
    </figure>
  )
}