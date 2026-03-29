/**
 * MetricSpaceView — True 4D Projection Viewer
 *
 * Mathematical pipeline:
 *   4D point (x, y, z, w)
 *   → six independent 4D plane rotation matrices applied sequentially
 *   → 4D → 3D perspective projection along W axis: P₃ = P₄ · d_w/(d_w − w′)
 *   → 3D → 2D perspective projection along Z axis: P₂ = P₃ · d_z/(d_z − z′)
 *   → SVG screen coordinates, W-depth colour-encoded
 *
 * The six 4D rotation planes and their embedded 4×4 matrices (basis order x,y,z,w):
 *   XW: x′= x·c − w·s,  w′= x·s + w·c   (others unchanged)
 *   YW: y′= y·c − w·s,  w′= y·s + w·c
 *   ZW: z′= z·c − w·s,  w′= z·s + w·c
 *   XY: x′= x·c − y·s,  y′= x·s + y·c
 *   XZ: x′= x·c − z·s,  z′= x·s + z·c
 *   YZ: y′= y·c − z·s,  z′= y·s + z·c
 *
 * Mouse drag controls XY and XZ (3D viewing orientation).
 * Sliders control XW, YW, ZW (the three genuinely 4-dimensional rotations).
 * W colour map: cyan (w=−1) → blue (w=0) → violet (w=+1)
 */
import { useMemo, useRef, useState } from 'react'

export type MetricPoint4D = {
  id: string
  x: number
  y: number
  z: number
  w: number  // 4th coordinate — independent data dimension
  label: string
}

type MetricSpaceViewProps = {
  points: MetricPoint4D[]
}

type ProjectedPoint = {
  id: string
  x2d: number
  y2d: number
  depth: number   // z after 4D→3D projection — depth sort and size
  wDepth: number  // w after full rotation — colour-encoded
  radius: number
  opacity: number
  label: string
}

const WIDTH = 740
const HEIGHT = 560
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

/** 4D → 3D perspective projection distance (along W axis) */
const D_W = 2.5

/** 3D → 2D perspective projection distance (along Z axis) */
const D_Z = 4.0

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Apply the six 4D plane rotations sequentially to (x,y,z,w).
 * Each rotation is the canonical 2D rotation matrix embedded into 4D within its plane.
 * Order: XW → YW → ZW → XY → XZ → YZ
 */
function rotate4D(
  x: number, y: number, z: number, w: number,
  rXW: number, rYW: number, rZW: number,
  rXY: number, rXZ: number, rYZ: number,
): [number, number, number, number] {
  // XW plane:  x′= x·cos − w·sin,  w′= x·sin + w·cos
  let cXW = Math.cos(rXW), sXW = Math.sin(rXW)
  let x0 = x * cXW - w * sXW
  let w0 = x * sXW + w * cXW
  x = x0; w = w0

  // YW plane:  y′= y·cos − w·sin,  w′= y·sin + w·cos
  const cYW = Math.cos(rYW), sYW = Math.sin(rYW)
  const y0 = y * cYW - w * sYW
  const w1 = y * sYW + w * cYW
  y = y0; w = w1

  // ZW plane:  z′= z·cos − w·sin,  w′= z·sin + w·cos
  const cZW = Math.cos(rZW), sZW = Math.sin(rZW)
  const z0 = z * cZW - w * sZW
  const w2 = z * sZW + w * cZW
  z = z0; w = w2

  // XY plane:  x′= x·cos − y·sin,  y′= x·sin + y·cos
  const cXY = Math.cos(rXY), sXY = Math.sin(rXY)
  const x1 = x * cXY - y * sXY
  const y1 = x * sXY + y * cXY
  x = x1; y = y1

  // XZ plane:  x′= x·cos − z·sin,  z′= x·sin + z·cos
  const cXZ = Math.cos(rXZ), sXZ = Math.sin(rXZ)
  const x2 = x * cXZ - z * sXZ
  const z1 = x * sXZ + z * cXZ
  x = x2; z = z1

  // YZ plane:  y′= y·cos − z·sin,  z′= y·sin + z·cos
  const cYZ = Math.cos(rYZ), sYZ = Math.sin(rYZ)
  const y2 = y * cYZ - z * sYZ
  const z2 = y * sYZ + z * cYZ
  y = y2; z = z2

  return [x, y, z, w]
}

/**
 * Map w ∈ [−1.5, 1.5] to RGB.
 * w = −1  →  cyan   (39, 199, 255)
 * w =  0  →  blue   (70,  130, 230)
 * w = +1  →  violet (160,  90, 255)
 */
function wToColor(w: number): string {
  const t = clamp((w + 1.5) / 3.0, 0, 1)
  const r = Math.round(39  + t * (160 -  39))
  const g = Math.round(199 + t * ( 90 - 199))
  const b = 255
  return `rgb(${r},${g},${b})`
}

export default function MetricSpaceView({ points }: MetricSpaceViewProps) {
  // 4D rotation angles — the three genuinely 4-dimensional planes
  const [rotXW, setRotXW] = useState(0)
  const [rotYW, setRotYW] = useState(0)
  const [rotZW, setRotZW] = useState(0)

  // 3D viewing orientation, driven by mouse drag
  const [rotXY, setRotXY] = useState(0.6)   // left-right (XY plane)
  const [rotXZ, setRotXZ] = useState(0.42)  // up-down    (XZ plane)

  const [zoom, setZoom] = useState(1.0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; rXY: number; rXZ: number } | null>(null)

  const projected = useMemo<ProjectedPoint[]>(() => {
    const scale = 118 * zoom

    return points
      .map((p) => {
        // Apply all six 4D rotation planes
        const [rx, ry, rz, rw] = rotate4D(
          p.x, p.y, p.z, p.w,
          rotXW, rotYW, rotZW,
          rotXY, rotXZ, 0,
        )

        // 4D → 3D perspective projection along W axis
        // P₃ = P₄ · (d_w / (d_w − w′))
        const wDenom = clamp(D_W - rw, 0.15, 99)
        const wFactor = D_W / wDenom
        const x3 = rx * wFactor
        const y3 = ry * wFactor
        const z3 = rz * wFactor

        // 3D → 2D perspective projection along Z axis
        // P₂ = P₃ · (d_z / (d_z − z′))
        const zDenom = clamp(D_Z - z3 * 0.55, 0.2, 99)
        const zFactor = D_Z / zDenom
        const x2d = CENTER_X + x3 * scale * zFactor
        const y2d = CENTER_Y + y3 * scale * zFactor

        const depth = z3
        const wDepth = clamp(rw, -1.5, 1.5)
        const opacity = clamp(0.5 + depth * 0.3, 0.18, 1.0)
        const radius = clamp(3.0 + depth * 1.5 + (wFactor - 1) * 0.8, 2.2, 8.0)

        return { id: p.id, x2d, y2d, depth, wDepth, radius, opacity, label: p.label }
      })
      .sort((a, b) => a.depth - b.depth)
  }, [points, rotXW, rotYW, rotZW, rotXY, rotXZ, zoom])

  const edges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint; wMid: number }> = []
    for (let i = 0; i < projected.length - 1; i += 1) {
      links.push({
        from: projected[i],
        to: projected[i + 1],
        wMid: (projected[i].wDepth + projected[i + 1].wDepth) / 2,
      })
    }
    return links
  }, [projected])

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, rXY: rotXY, rXZ: rotXZ }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragStart.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    setRotXY(dragStart.current.rXY + dx * 0.006)
    setRotXZ(clamp(dragStart.current.rXZ + dy * 0.006, -1.45, 1.45))
  }

  function onPointerUp() {
    setIsDragging(false)
    dragStart.current = null
  }

  const PI = Math.PI

  return (
    <div className="metric3d-wrap">
      <div className="metric3d-toolbar">
        <label htmlFor="metric-zoom">Zoom</label>
        <input
          id="metric-zoom"
          type="range"
          min={0.4}
          max={2.6}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
        />
        <span>{zoom.toFixed(2)}x</span>
        <span className="metric4d-drag-hint">Drag canvas → XY / XZ planes</span>
      </div>

      <div className="metric4d-planes">
        <span className="metric4d-label">4D rotation planes</span>

        <label className="metric4d-plane-row">
          <span>XW</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotXW}
            onChange={(e) => setRotXW(Number.parseFloat(e.target.value))}
          />
          <code>{rotXW.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>YW</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotYW}
            onChange={(e) => setRotYW(Number.parseFloat(e.target.value))}
          />
          <code>{rotYW.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>ZW</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotZW}
            onChange={(e) => setRotZW(Number.parseFloat(e.target.value))}
          />
          <code>{rotZW.toFixed(3)} rad</code>
        </label>

        <div className="metric4d-legend">
          <span style={{ color: 'rgb(39,199,255)' }}>● w = −1</span>
          <span style={{ color: 'rgb(100,145,255)' }}>● w = 0</span>
          <span style={{ color: 'rgb(160,90,255)' }}>● w = +1</span>
        </div>
      </div>

      <svg
        className={isDragging ? 'metric3d-canvas dragging' : 'metric3d-canvas'}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />

        {edges.map((edge, index) => {
          const edgeColor = wToColor(edge.wMid)
          return (
            <line
              key={`${edge.from.id}-${edge.to.id}-${index}`}
              x1={edge.from.x2d}
              y1={edge.from.y2d}
              x2={edge.to.x2d}
              y2={edge.to.y2d}
              stroke={edgeColor}
              strokeWidth={0.9}
              opacity={0.28}
            />
          )
        })}

        {projected.map((point) => {
          const col = wToColor(point.wDepth)
          return (
            <g key={point.id} opacity={point.opacity}>
              <circle
                cx={point.x2d}
                cy={point.y2d}
                r={point.radius + 3.5}
                fill={col}
                opacity={0.22}
              />
              <circle
                cx={point.x2d}
                cy={point.y2d}
                r={point.radius}
                fill="rgba(255,255,255,0.88)"
                stroke={col}
                strokeWidth={1.4}
              />
              {point.depth > 0.1 && (
                <text
                  x={point.x2d + 8}
                  y={point.y2d - 8}
                  className="metric3d-label"
                  fill={col}
                >
                  {point.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
