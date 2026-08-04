'use client'

/**
 * PavingLayoutVisual — top-down patio grid + side cross-section showing the
 * layered build-up (sub-base, bedding sand, slab).
 *
 * Top half shows the patio with slabs laid out at scale. Edge slabs are shaded
 * as "cut" since they rarely fit perfectly. Bottom half shows the layered
 * ground build-up with depth labels so the user sees what they're buying.
 */

import { useMemo } from 'react'

export interface PavingLayoutVisualProps {
  /** Patio length in metres. */
  length: number
  /** Patio width in metres. */
  width: number
  /** Slab length in metres (after mm→m conversion). */
  slabLength: number
  /** Slab width in metres (after mm→m conversion). */
  slabWidth: number
  /** Joint width in metres (after mm→m conversion). */
  joint: number
  /** Sub-base depth in metres (after mm→m conversion). */
  subBaseDepth: number
  /** Bedding sand depth in metres (after mm→m conversion). */
  beddingDepth: number
  className?: string
}

const TOP_H = 240
const BOTTOM_H = 130
const PADDING_X = 36

export function PavingLayoutVisual({
  length,
  width,
  slabLength,
  slabWidth,
  joint,
  subBaseDepth,
  beddingDepth,
  className,
}: PavingLayoutVisualProps) {
  const view = useMemo(() => {
    const aL = Math.max(length, 0)
    const aW = Math.max(width, 0)
    const sL = Math.max(slabLength, 0)
    const sW = Math.max(slabWidth, 0)
    const j = Math.max(joint, 0)
    const subD = Math.max(subBaseDepth, 0)
    const bedD = Math.max(beddingDepth, 0)

    if (aL <= 0 || aW <= 0 || sL <= 0 || sW <= 0) return null

    // Effective slab cell including joint.
    const cellL = sL + j
    const cellW = sW + j
    const cols = Math.max(1, Math.ceil(aL / cellL))
    const rows = Math.max(1, Math.ceil(aW / cellW))

    // Scale patio to fit the top canvas.
    const usableW = 480 - PADDING_X * 2
    const usableH = TOP_H - 36
    const scale = Math.min(usableW / aL, usableH / aW)
    const drawL = aL * scale
    const drawW = aW * scale
    const offsetX = PADDING_X + (usableW - drawL) / 2
    const offsetY = 28 + (usableH - drawW) / 2

    const drawCellL = cellL * scale
    const drawCellW = cellW * scale

    return {
      offsetX,
      offsetY,
      drawL,
      drawW,
      drawCellL,
      drawCellW,
      cols,
      rows,
      subD,
      bedD,
      totalDepth: subD + bedD + 0.05, // include ~50 mm slab thickness
    }
  }, [length, width, slabLength, slabWidth, joint, subBaseDepth, beddingDepth])

  if (!view) return null

  const {
    offsetX,
    offsetY,
    drawL,
    drawW,
    drawCellL,
    drawCellW,
    cols,
    rows,
    subD,
    bedD,
    totalDepth,
  } = view

  // Cross-section scale: fit total depth into bottom canvas height (with slab).
  const sectionTop = TOP_H + 28
  const sectionUsableH = BOTTOM_H - 48
  // Use a depth-scale that makes 200 mm+ visible. Min pixel-per-mm = 0.6.
  const depthScale = Math.max(sectionUsableH / Math.max(totalDepth, 0.05), 220)
  const subPx = subD * depthScale
  const bedPx = bedD * depthScale
  const slabPx = 0.05 * depthScale // ~50 mm standard slab
  const sectionX = 50
  const sectionW = 240

  // Last column/row partial iff the cells extend past the area (real metres).
  const cellL = slabLength + joint
  const cellW = slabWidth + joint
  const lastColPartial = cols * cellL > length + 1e-6
  const lastRowPartial = rows * cellW > width + 1e-6

  // Build slab grid for top-down view.
  const slabs: Array<{ x: number; y: number; partial: boolean }> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = offsetX + c * drawCellL
      const y = offsetY + r * drawCellW
      const isLastCol = c === cols - 1
      const isLastRow = r === rows - 1
      const isPartial = (isLastCol && lastColPartial) || (isLastRow && lastRowPartial)
      slabs.push({ x, y, partial: isPartial })
    }
  }

  const fullSlabs = slabs.filter((s) => !s.partial).length
  const cutSlabs = slabs.length - fullSlabs

  // Common: section layer colours.
  const colours = {
    subBase: 'var(--muted-foreground)',
    subBaseFill: 'var(--secondary)',
    bedding: 'var(--warning)',
    beddingFill: 'var(--warning-muted)',
    slab: 'var(--primary)',
    slabFill: 'var(--primary-muted)',
  }

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Paving layout: ${length.toFixed(2)} by ${width.toFixed(2)} metre patio with ${slabs.length} slabs (${cutSlabs} cut), ${(subD * 1000).toFixed(0)} mm sub-base and ${(bedD * 1000).toFixed(0)} mm bedding sand.`}
    >
      <svg
        viewBox={`0 0 480 ${TOP_H + BOTTOM_H}`}
        className="h-auto w-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="paving-cut-hatch"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--warning)" strokeWidth="2" />
          </pattern>
        </defs>

        {/* === TOP-DOWN === */}
        <rect
          x={PADDING_X - 8}
          y={20}
          width={480 - (PADDING_X - 8) * 2}
          height={TOP_H - 28}
          rx={12}
          fill="var(--muted)"
          opacity={0.3}
        />

        {/* Patio boundary */}
        <rect
          x={offsetX}
          y={offsetY}
          width={drawL}
          height={drawW}
          fill="var(--success-muted)"
          stroke="var(--success)"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Slab cells */}
        {slabs.map((slab, i) => (
          <g key={i}>
            <rect
              x={slab.x + 0.5}
              y={slab.y + 0.5}
              width={Math.max(0, drawCellL - 1)}
              height={Math.max(0, drawCellW - 1)}
              fill={slab.partial ? 'var(--warning-muted)' : 'var(--card)'}
              stroke={slab.partial ? 'var(--warning)' : 'var(--success)'}
              strokeOpacity={slab.partial ? 0.85 : 0.6}
              strokeWidth={slab.partial ? 1 : 0.75}
              rx={1}
            />
            {slab.partial && (
              <rect
                x={slab.x + 0.5}
                y={slab.y + 0.5}
                width={Math.max(0, drawCellL - 1)}
                height={Math.max(0, drawCellW - 1)}
                fill="url(#paving-cut-hatch)"
                opacity={0.45}
                rx={1}
              />
            )}
          </g>
        ))}

        {/* Length label — top */}
        <g>
          <line
            x1={offsetX}
            y1={offsetY - 10}
            x2={offsetX + drawL}
            y2={offsetY - 10}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX}
            y1={offsetY - 14}
            x2={offsetX}
            y2={offsetY - 6}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX + drawL}
            y1={offsetY - 14}
            x2={offsetX + drawL}
            y2={offsetY - 6}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offsetX + drawL / 2}
            y={offsetY - 16}
            textAnchor="middle"
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {length.toFixed(2)} m
          </text>
        </g>

        {/* Width label — left */}
        <g>
          <line
            x1={offsetX - 10}
            y1={offsetY}
            x2={offsetX - 10}
            y2={offsetY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX - 14}
            y1={offsetY}
            x2={offsetX - 6}
            y2={offsetY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offsetX - 14}
            y1={offsetY + drawW}
            x2={offsetX - 6}
            y2={offsetY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offsetX - 16}
            y={offsetY + drawW / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${offsetX - 16} ${offsetY + drawW / 2})`}
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {width.toFixed(2)} m
          </text>
        </g>

        {/* === CROSS-SECTION === */}
        <line
          x1={20}
          y1={sectionTop - 12}
          x2={460}
          y2={sectionTop - 12}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={24}
          y={sectionTop - 18}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Cross-section
        </text>

        {/* Slab layer */}
        <rect
          x={sectionX}
          y={sectionTop}
          width={sectionW}
          height={Math.max(slabPx, 6)}
          fill={colours.slabFill}
          stroke={colours.slab}
          strokeWidth={1.2}
          rx={1}
        />
        <text
          x={sectionX + sectionW + 10}
          y={sectionTop + Math.max(slabPx, 6) / 2 + 4}
          style={{ fill: 'var(--foreground)' }}
          className="text-[11px] font-medium"
        >
          Slab · ~50 mm
        </text>

        {/* Bedding layer */}
        <rect
          x={sectionX}
          y={sectionTop + Math.max(slabPx, 6)}
          width={sectionW}
          height={Math.max(bedPx, 4)}
          fill={colours.beddingFill}
          stroke={colours.bedding}
          strokeWidth={1.2}
          rx={1}
        />
        <text
          x={sectionX + sectionW + 10}
          y={sectionTop + Math.max(slabPx, 6) + Math.max(bedPx, 4) / 2 + 4}
          style={{ fill: 'var(--foreground)' }}
          className="text-[11px] font-medium"
        >
          Bedding · {(bedD * 1000).toFixed(0)} mm
        </text>

        {/* Sub-base layer */}
        <rect
          x={sectionX}
          y={sectionTop + Math.max(slabPx, 6) + Math.max(bedPx, 4)}
          width={sectionW}
          height={Math.max(subPx, 6)}
          fill={colours.subBaseFill}
          stroke={colours.subBase}
          strokeWidth={1.2}
          rx={1}
        />
        <text
          x={sectionX + sectionW + 10}
          y={
            sectionTop +
            Math.max(slabPx, 6) +
            Math.max(bedPx, 4) +
            Math.max(subPx, 6) / 2 +
            4
          }
          style={{ fill: 'var(--foreground)' }}
          className="text-[11px] font-medium"
        >
          Sub-base · {(subD * 1000).toFixed(0)} mm
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border"
            style={{
              backgroundColor: 'var(--card)',
              borderColor: 'var(--success)',
            }}
            aria-hidden
          />
          Full slab ({fullSlabs})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border"
            style={{
              backgroundColor: 'var(--warning-muted)',
              borderColor: 'var(--warning)',
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--warning) 0 1px, transparent 1px 4px)',
            }}
            aria-hidden
          />
          Cut slab ({cutSlabs})
        </span>
      </figcaption>
    </figure>
  )
}