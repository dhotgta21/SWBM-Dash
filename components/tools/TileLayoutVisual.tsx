'use client'

/**
 * TileLayoutVisual — top-down 2D drawing of tiles laid on a rectangular area.
 *
 * Renders the area boundary, a grid of tiles at scale, and shades any partial
 * tiles at the edges differently so the user can see at a glance how much
 * cutting is involved. Dimension labels go on the top and left edges.
 *
 * Pure inline SVG, no chart libs. Uses CSS variables from globals.css so it
 * adapts to dark mode automatically.
 */

import { useMemo } from 'react'

export interface TileLayoutVisualProps {
  /** Area length in metres. */
  areaLength: number
  /** Area width in metres. */
  areaWidth: number
  /** Tile length in metres (after mm→m conversion). */
  tileLength: number
  /** Tile width in metres (after mm→m conversion). */
  tileWidth: number
  /** Optional className for the wrapping figure. */
  className?: string
}

/** Visual canvas — chosen to fit comfortably on mobile + desktop. */
const CANVAS_W = 480
const CANVAS_H = 320
const PADDING = 36 // leaves room for dimension labels

export function TileLayoutVisual({
  areaLength,
  areaWidth,
  tileLength,
  tileWidth,
  className,
}: TileLayoutVisualProps) {
  const view = useMemo(() => {
    const aL = Math.max(areaLength, 0)
    const aW = Math.max(areaWidth, 0)
    const tL = Math.max(tileLength, 0)
    const tW = Math.max(tileWidth, 0)

    if (aL <= 0 || aW <= 0) return null

    // Scale the area into the canvas while preserving aspect ratio.
    const usableW = CANVAS_W - PADDING * 2
    const usableH = CANVAS_H - PADDING * 2
    const scale = Math.min(usableW / aL, usableH / aW)
    const drawL = aL * scale
    const drawW = aW * scale
    const offsetX = (CANVAS_W - drawL) / 2
    const offsetY = (CANVAS_H - drawW) / 2

    // How many full tiles fit along each side (rounded up to fill the area).
    const cols = tL > 0 ? Math.max(1, Math.ceil(aL / tL)) : 0
    const rows = tW > 0 ? Math.max(1, Math.ceil(aW / tW)) : 0
    const cellL = (drawL / cols) || 0
    const cellW = (drawW / rows) || 0

    return {
      offsetX,
      offsetY,
      drawL,
      drawW,
      cols,
      rows,
      cellL,
      cellW,
      tileArea: tL * tW,
      cellArea: cellL * cellW,
    }
  }, [areaLength, areaWidth, tileLength, tileWidth])

  if (!view) return null

  const { offsetX, offsetY, drawL, drawW, cols, rows, cellL, cellW } = view

  // Decide whether the last column/row are partial cuts.
  // Last column partial iff cols * tileLength > areaLength (the cell extends past the area).
  // Last row partial iff rows * tileWidth > areaWidth.
  const lastColPartial = cols * tileLength > areaLength + 1e-6
  const lastRowPartial = rows * tileWidth > areaWidth + 1e-6

  // Build cell list with edge-partial flag.
  const cells: Array<{ x: number; y: number; partial: boolean; full: boolean }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * cellL
      const y = offsetY + r * cellW
      const isLastCol = c === cols - 1
      const isLastRow = r === rows - 1
      const isPartial = (isLastCol && lastColPartial) || (isLastRow && lastRowPartial)
      cells.push({
        x,
        y,
        full: !isPartial,
        partial: isPartial,
      })
    }
  }

  const totalTiles = cells.length
  const fullTiles = cells.filter((c) => c.full).length
  const cutTiles = totalTiles - fullTiles

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Tile layout: ${areaLength.toFixed(2)} by ${areaWidth.toFixed(2)} metres covered with ${totalTiles} tiles, ${cutTiles} require cutting.`}
    >
      <svg
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        className="h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Hatching for cut tiles — subtle diagonal lines. */}
          <pattern
            id="tile-cut-hatch"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warning)" strokeWidth="2" />
          </pattern>
        </defs>

        {/* Soft canvas background */}
        <rect
          x={PADDING - 8}
          y={PADDING - 8}
          width={CANVAS_W - (PADDING - 8) * 2}
          height={CANVAS_H - (PADDING - 8) * 2}
          rx={12}
          fill="var(--muted)"
          opacity={0.35}
        />

        {/* Area boundary */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawL}
          height={drawW}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Tile cells */}
        {cells.map((cell, i) => (
          <g key={i}>
            {cell.full ? (
              <rect
                x={cell.x + 1}
                y={cell.y + 1}
                width={Math.max(0, cellL - 2)}
                height={Math.max(0, cellW - 2)}
                fill="var(--primary-muted)"
                stroke="var(--primary)"
                strokeOpacity={0.55}
                strokeWidth={0.75}
                rx={1}
              />
            ) : (
              <>
                {/* Underlay so the partial tile still reads as "tile". */}
                <rect
                  x={cell.x + 1}
                  y={cell.y + 1}
                  width={Math.max(0, cellL - 2)}
                  height={Math.max(0, cellW - 2)}
                  fill="var(--warning-muted)"
                  stroke="var(--warning)"
                  strokeOpacity={0.7}
                  strokeWidth={0.75}
                  rx={1}
                />
                {/* Hatched overlay to signal "cut" */}
                <rect
                  x={cell.x + 1}
                  y={cell.y + 1}
                  width={Math.max(0, cellL - 2)}
                  height={Math.max(0, cellW - 2)}
                  fill="url(#tile-cut-hatch)"
                  opacity={0.45}
                  rx={1}
                />
              </>
            )}
          </g>
        ))}

        {/* Length label — top */}
        <g>
          <line
            x1={offsetX}
            y1={offsetY - 12}
            x2={offsetX + drawL}
            y2={offsetY - 12}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX}
            y1={offsetY - 16}
            x2={offsetX}
            y2={offsetY - 8}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX + drawL}
            y1={offsetY - 16}
            x2={offsetX + drawL}
            y2={offsetY - 8}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offsetX + drawL / 2}
            y={offsetY - 18}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] font-medium"
            style={{ fill: 'var(--muted-foreground)' }}
          >
            {areaLength.toFixed(2)} m
          </text>
        </g>

        {/* Width label — left */}
        <g>
          <line
            x1={offsetX - 12}
            y1={offsetY}
            x2={offsetX - 12}
            y2={offsetY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX - 16}
            y1={offsetY}
            x2={offsetX - 8}
            y2={offsetY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX - 16}
            y1={offsetY + drawW}
            x2={offsetX - 8}
            y2={offsetY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offsetX - 18}
            y={offsetY + drawW / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${offsetX - 18} ${offsetY + drawW / 2})`}
            className="fill-muted-foreground text-[11px] font-medium"
            style={{ fill: 'var(--muted-foreground)' }}
          >
            {areaWidth.toFixed(2)} m
          </text>
        </g>

        {/* Tile size hint — bottom-right corner */}
        <text
          x={offsetX + drawL - 4}
          y={offsetY + drawW - 6}
          textAnchor="end"
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-medium"
        >
          {tileLength > 0 && tileWidth > 0
            ? `${(tileLength * 1000).toFixed(0)} × ${(tileWidth * 1000).toFixed(0)} mm tiles`
            : ''}
        </text>
      </svg>

      {/* Legend */}
      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-primary"
            style={{ backgroundColor: 'var(--primary-muted)' }}
            aria-hidden
          />
          Full tile ({fullTiles})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-warning"
            style={{
              backgroundColor: 'var(--warning-muted)',
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--warning) 0 1px, transparent 1px 4px)',
              opacity: 0.85,
            }}
            aria-hidden
          />
          Cut tile ({cutTiles})
        </span>
      </figcaption>
    </figure>
  )
}