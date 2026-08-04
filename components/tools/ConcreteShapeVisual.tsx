'use client'

/**
 * ConcreteShapeVisual — 2D drawing of the concrete shape the user is pouring.
 *
 * Three variants:
 *   - slab:     top-down rectangle with L × W labels + side view of depth
 *   - footing:  side view of a long, thin strip with depth
 *   - cylinder: top-down circle with diameter label + side view of column
 *
 * The view switches automatically based on the `shape` prop. Animations are
 * CSS-only and respect prefers-reduced-motion.
 */

import { useMemo } from 'react'

export type ConcreteShape = 'slab' | 'footing' | 'cylinder'

export interface ConcreteShapeVisualProps {
  shape: ConcreteShape
  /** Length in metres (slab/footing). */
  length: number
  /** Width in metres (slab only). */
  width: number
  /** Depth/thickness in metres (all shapes). */
  depth: number
  /** Diameter in metres (cylinder only). */
  diameter: number
  className?: string
}

export function ConcreteShapeVisual({
  shape,
  length,
  width,
  depth,
  diameter,
  className,
}: ConcreteShapeVisualProps) {
  if (shape === 'cylinder') {
    return <CylinderView diameter={diameter} depth={depth} className={className} />
  }
  if (shape === 'footing') {
    return <FootingView length={length} depth={depth} className={className} />
  }
  return <SlabView length={length} width={width} depth={depth} className={className} />
}

/* -------------------------------------------------------------------------- */
/*  Slab — plan view + side view                                              */
/* -------------------------------------------------------------------------- */

function SlabView({
  length,
  width,
  depth,
  className,
}: {
  length: number
  width: number
  depth: number
  className?: string
}) {
  const view = useMemo(() => {
    const l = Math.max(length, 0)
    const w = Math.max(width, 0)
    const d = Math.max(depth, 0)
    if (l <= 0 || w <= 0) return null

    // Plan view: fit into 480x180 with padding for labels.
    const usableW = 380
    const usableH = 130
    const scale = Math.min(usableW / l, usableH / w)
    const drawL = l * scale
    const drawW = w * scale
    const offX = 50 + (usableW - drawL) / 2
    const offY = 40 + (usableH - drawW) / 2

    // Side view (depth): drawn at exaggerated scale so it's visible.
    const sideY = 220
    const sideMaxH = 70
    const depthScale = d > 0 ? Math.min(sideMaxH / d, 700) : 200
    const sideH = Math.max(d * depthScale, 8)
    const sideX = 100
    const sideW = 280

    return { drawL, drawW, offX, offY, sideH, sideX, sideY, sideW, depth: d }
  }, [length, width, depth])

  if (!view) return null
  const { drawL, drawW, offX, offY, sideH, sideX, sideY, sideW, depth: d } = view

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Concrete slab: ${length.toFixed(2)} by ${width.toFixed(2)} metres, ${(d * 1000).toFixed(0)} mm deep.`}
    >
      <svg viewBox="0 0 480 320" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <rect x={6} y={6} width={468} height={308} rx={12} fill="var(--muted)" opacity={0.3} />

        {/* Plan view */}
        <text
          x={20}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Plan view
        </text>

        <rect
          x={offX}
          y={offY}
          width={drawL}
          height={drawW}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Length label */}
        <g>
          <line
            x1={offX}
            y1={offY - 10}
            x2={offX + drawL}
            y2={offY - 10}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX}
            y1={offY - 14}
            x2={offX}
            y2={offY - 6}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX + drawL}
            y1={offY - 14}
            x2={offX + drawL}
            y2={offY - 6}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX + drawL / 2}
            y={offY - 16}
            textAnchor="middle"
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {length.toFixed(2)} m
          </text>
        </g>

        {/* Width label */}
        <g>
          <line
            x1={offX - 10}
            y1={offY}
            x2={offX - 10}
            y2={offY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 14}
            y1={offY}
            x2={offX - 6}
            y2={offY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 14}
            y1={offY + drawW}
            x2={offX - 6}
            y2={offY + drawW}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX - 16}
            y={offY + drawW / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${offX - 16} ${offY + drawW / 2})`}
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {width.toFixed(2)} m
          </text>
        </g>

        {/* Side view */}
        <line
          x1={20}
          y1={200}
          x2={460}
          y2={200}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={24}
          y={194}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Cross-section · {(d * 1000).toFixed(0)} mm deep
        </text>

        {/* Ground line */}
        <line
          x1={40}
          y1={sideY + sideH}
          x2={440}
          y2={sideY + sideH}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />

        {/* Slab fill */}
        <rect
          x={sideX}
          y={sideY}
          width={sideW}
          height={sideH}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Depth callout */}
        <g>
          <line
            x1={sideX + sideW + 12}
            y1={sideY}
            x2={sideX + sideW + 12}
            y2={sideY + sideH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={sideX + sideW + 8}
            y1={sideY}
            x2={sideX + sideW + 16}
            y2={sideY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={sideX + sideW + 8}
            y1={sideY + sideH}
            x2={sideX + sideW + 16}
            y2={sideY + sideH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={sideX + sideW + 22}
            y={sideY + sideH / 2 + 4}
            style={{ fill: 'var(--foreground)' }}
            className="text-[11px] font-semibold"
          >
            {(d * 1000).toFixed(0)} mm
          </text>
        </g>
      </svg>
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/*  Footing — side view of a long thin strip                                  */
/* -------------------------------------------------------------------------- */

function FootingView({
  length,
  depth,
  className,
}: {
  length: number
  depth: number
  className?: string
}) {
  const view = useMemo(() => {
    const l = Math.max(length, 0)
    const d = Math.max(depth, 0)
    if (l <= 0) return null
    // Side strip — width is fixed visual since footing width is a separate
    // implicit dimension; show length × depth instead.
    const usableW = 400
    const scale = l > 0 ? usableW / l : 1
    const drawL = l * scale
    const offX = 40 + (usableW - drawL) / 2
    const stripY = 110
    // Depth (height of strip in side view) — exaggerated.
    const depthScale = d > 0 ? Math.min(120 / d, 600) : 200
    const drawD = Math.max(d * depthScale, 10)
    return { drawL, drawD, offX, stripY, length: l, depth: d }
  }, [length, depth])

  if (!view) return null
  const { drawL, drawD, offX, stripY, length: l, depth: d } = view

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Strip footing: ${l.toFixed(2)} metres long, ${(d * 1000).toFixed(0)} mm deep.`}
    >
      <svg viewBox="0 0 480 240" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <rect x={6} y={6} width={468} height={228} rx={12} fill="var(--muted)" opacity={0.3} />
        <text
          x={20}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Side view · strip footing
        </text>

        {/* Ground */}
        <line
          x1={20}
          y1={stripY + drawD}
          x2={460}
          y2={stripY + drawD}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />

        {/* Footing strip */}
        <rect
          x={offX}
          y={stripY}
          width={drawL}
          height={drawD}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
          rx={2}
        />

        {/* Length label below */}
        <g>
          <line
            x1={offX}
            y1={stripY + drawD + 14}
            x2={offX + drawL}
            y2={stripY + drawD + 14}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX}
            y1={stripY + drawD + 10}
            x2={offX}
            y2={stripY + drawD + 18}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX + drawL}
            y1={stripY + drawD + 10}
            x2={offX + drawL}
            y2={stripY + drawD + 18}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX + drawL / 2}
            y={stripY + drawD + 30}
            textAnchor="middle"
            style={{ fill: 'var(--muted-foreground)' }}
            className="text-[11px] font-medium"
          >
            {l.toFixed(2)} m
          </text>
        </g>

        {/* Depth label left */}
        <g>
          <line
            x1={offX - 14}
            y1={stripY}
            x2={offX - 14}
            y2={stripY + drawD}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 18}
            y1={stripY}
            x2={offX - 10}
            y2={stripY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={offX - 18}
            y1={stripY + drawD}
            x2={offX - 10}
            y2={stripY + drawD}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={offX - 22}
            y={stripY + drawD / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${offX - 22} ${stripY + drawD / 2})`}
            style={{ fill: 'var(--foreground)' }}
            className="text-[11px] font-semibold"
          >
            {(d * 1000).toFixed(0)} mm
          </text>
        </g>
      </svg>
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cylinder — plan circle + side view of column                              */
/* -------------------------------------------------------------------------- */

function CylinderView({
  diameter,
  depth,
  className,
}: {
  diameter: number
  depth: number
  className?: string
}) {
  const view = useMemo(() => {
    const d = Math.max(diameter, 0)
    const h = Math.max(depth, 0)
    if (d <= 0) return null

    // Plan: circle on the left, label below the circle (not inside it).
    const planCx = 170
    const planCy = 110
    const maxR = 80
    const r = Math.min((d / 2) * 80, maxR) // 1 m = 80 px-ish, capped

    // Side view: rectangle on the right. Width = max 2r but at least 28 px so
    // the column reads as a column. Height capped at ~3.5× the width so very
    // tall columns still fit on the canvas.
    const sideW = Math.max(r * 2, 28)
    const sideH = Math.min(Math.max(h * 70, 28), sideW * 3.5)
    const sideX = 360 - sideW / 2
    const sideY = 110 - sideH / 2

    return { r, planCx, planCy, sideX, sideY, sideW, sideH, diameter: d, depth: h }
  }, [diameter, depth])

  if (!view) return null
  const { r, planCx, planCy, sideX, sideY, sideW, sideH, diameter: d, depth: h } = view

  return (
    <figure
      className={className}
      role="img"
      aria-label={`Concrete column: ${d.toFixed(2)} m diameter, ${(h * 1000).toFixed(0)} mm tall.`}
    >
      <svg viewBox="0 0 480 240" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg">
        <rect x={6} y={6} width={468} height={228} rx={12} fill="var(--muted)" opacity={0.3} />

        <text
          x={20}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Plan · Ø {(d * 1000).toFixed(0)} mm
        </text>

        <circle
          cx={planCx}
          cy={planCy}
          r={r}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
        />

        {/* Diameter line (dashed) */}
        <line
          x1={planCx - r}
          y1={planCy}
          x2={planCx + r}
          y2={planCy}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
        {/* End ticks */}
        <line
          x1={planCx - r}
          y1={planCy - 4}
          x2={planCx - r}
          y2={planCy + 4}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
        />
        <line
          x1={planCx + r}
          y1={planCy - 4}
          x2={planCx + r}
          y2={planCy + 4}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
        />
        {/* Label below the circle, not inside it */}
        <text
          x={planCx}
          y={planCy + r + 16}
          textAnchor="middle"
          style={{ fill: 'var(--foreground)' }}
          className="text-[11px] font-semibold"
        >
          Ø {(d * 1000).toFixed(0)} mm
        </text>

        <text
          x={320}
          y={26}
          style={{ fill: 'var(--muted-foreground)' }}
          className="text-[10px] font-semibold uppercase tracking-wider"
        >
          Side · {(h * 1000).toFixed(0)} mm tall
        </text>

        {/* Ground line */}
        <line
          x1={300}
          y1={sideY + sideH}
          x2={460}
          y2={sideY + sideH}
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
        />

        {/* Column side rectangle */}
        <rect
          x={sideX}
          y={sideY}
          width={sideW}
          height={sideH}
          fill="var(--primary-muted)"
          stroke="var(--primary)"
          strokeWidth={1.5}
          rx={1}
        />

        {/* Height callout */}
        <g>
          <line
            x1={sideX + sideW + 10}
            y1={sideY}
            x2={sideX + sideW + 10}
            y2={sideY + sideH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={sideX + sideW + 6}
            y1={sideY}
            x2={sideX + sideW + 14}
            y2={sideY}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <line
            x1={sideX + sideW + 6}
            y1={sideY + sideH}
            x2={sideX + sideW + 14}
            y2={sideY + sideH}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
          />
          <text
            x={sideX + sideW + 18}
            y={sideY + sideH / 2 + 4}
            style={{ fill: 'var(--foreground)' }}
            className="text-[11px] font-semibold"
          >
            {(h * 1000).toFixed(0)} mm
          </text>
        </g>
      </svg>
    </figure>
  )
}