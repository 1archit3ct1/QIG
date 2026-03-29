import { useMemo, useRef, useState } from 'react'

type Vec8 = [number, number, number, number, number, number, number, number]

export type MetricPoint8D = {
  id: string
  v: Vec8
  label: string
}

type MetricSpaceViewProps = {
  points: MetricPoint8D[]
}

type ProjectedPoint = {
  id: string
  x2d: number
  y2d: number
  depth: number
  chroma: number
  radius: number
  opacity: number
  label: string
}

type PlaneRotation = {
  key: string
  label: string
  i: number
  j: number
  angle: number
}

const WIDTH = 740
const HEIGHT = 560
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

const FIT_MARGIN_X = 0.86
const FIT_MARGIN_Y = 0.82

const DIST_REDUCTION: Record<number, number> = {
  7: 7.2,
  6: 6.8,
  5: 6.4,
  4: 6.0,
  3: 5.6,
}

const DIST_2D = 5.4

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function rotatePlane(vec: number[], i: number, j: number, angle: number): void {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const vi = vec[i]
  const vj = vec[j]
  vec[i] = vi * c - vj * s
  vec[j] = vi * s + vj * c
}

function project8Dto3D(vec8: Vec8): { xyz: [number, number, number]; chroma: number } {
  const v = vec8.slice() as number[]
  for (let last = 7; last >= 3; last -= 1) {
    const dist = DIST_REDUCTION[last]
    const denom = clamp(dist - v[last], 0.9, 99)
    const factor = clamp(dist / denom, 0.55, 1.9)
    for (let i = 0; i < last; i += 1) {
      v[i] *= factor
    }
    v.pop()
  }

  return {
    xyz: [v[0], v[1], v[2]],
    chroma: clamp((vec8[3] + vec8[4] + vec8[5]) / 3, -1.6, 1.6),
  }
}

function chromaColor(value: number): string {
  const t = clamp((value + 1.6) / 3.2, 0, 1)
  const r = Math.round(38 + t * (160 - 38))
  const g = Math.round(198 + t * (92 - 198))
  const b = 255
  return `rgb(${r},${g},${b})`
}

export default function MetricSpaceView({ points }: MetricSpaceViewProps) {
  const [zoom, setZoom] = useState(1.25)

  const [rotXY, setRotXY] = useState(0.6)
  const [rotXZ, setRotXZ] = useState(0.42)

  const [rotXW, setRotXW] = useState(0.65)
  const [rotYW, setRotYW] = useState(-0.35)
  const [rotZW, setRotZW] = useState(0.85)

  const [rotUV, setRotUV] = useState(0.2)
  const [rotST, setRotST] = useState(-0.15)
  const [rotXT, setRotXT] = useState(0.18)

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; rxy: number; rxz: number } | null>(null)

  const rotations: PlaneRotation[] = [
    { key: 'xy', label: 'XY', i: 0, j: 1, angle: rotXY },
    { key: 'xz', label: 'XZ', i: 0, j: 2, angle: rotXZ },
    { key: 'xw', label: 'XW', i: 0, j: 3, angle: rotXW },
    { key: 'yw', label: 'YW', i: 1, j: 3, angle: rotYW },
    { key: 'zw', label: 'ZW', i: 2, j: 3, angle: rotZW },
    { key: 'uv', label: 'UV', i: 4, j: 5, angle: rotUV },
    { key: 'st', label: 'ST', i: 6, j: 7, angle: rotST },
    { key: 'xt', label: 'XT', i: 0, j: 7, angle: rotXT },
  ]

  const projected = useMemo<ProjectedPoint[]>(() => {
    const raw = points.map((p) => {
      const vec = p.v.slice() as number[]
      rotations.forEach((r) => rotatePlane(vec, r.i, r.j, r.angle))

      const { xyz, chroma } = project8Dto3D(vec as Vec8)
      const x = xyz[0]
      const y = xyz[1]
      const z = xyz[2]

      const denom = clamp(DIST_2D - z * 0.45, 0.9, 99)
      const perspective = clamp(DIST_2D / denom, 0.55, 1.95)

      return {
        id: p.id,
        xRaw: x * perspective,
        yRaw: y * perspective,
        depth: z,
        chroma,
        label: p.label,
      }
    })

    const minX = Math.min(...raw.map((p) => p.xRaw), -1)
    const maxX = Math.max(...raw.map((p) => p.xRaw), 1)
    const minY = Math.min(...raw.map((p) => p.yRaw), -1)
    const maxY = Math.max(...raw.map((p) => p.yRaw), 1)
    const spanX = Math.max(maxX - minX, 0.01)
    const spanY = Math.max(maxY - minY, 0.01)
    const fitScale = Math.min((WIDTH * FIT_MARGIN_X) / spanX, (HEIGHT * FIT_MARGIN_Y) / spanY)

    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2

    return raw
      .map((p) => {
        const x2d = CENTER_X + (p.xRaw - midX) * fitScale * zoom
        const y2d = CENTER_Y + (p.yRaw - midY) * fitScale * zoom
        const radius = clamp(3.0 + p.depth * 0.8, 2.2, 7.0)
        const opacity = clamp(0.58 + p.depth * 0.15, 0.24, 1)
        return {
          id: p.id,
          x2d,
          y2d,
          depth: p.depth,
          chroma: p.chroma,
          radius,
          opacity,
          label: p.label,
        }
      })
      .sort((a, b) => a.depth - b.depth)
  }, [points, zoom, rotations])

  const edges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint; chroma: number }> = []
    for (let i = 0; i < projected.length - 1; i += 1) {
      links.push({
        from: projected[i],
        to: projected[i + 1],
        chroma: (projected[i].chroma + projected[i + 1].chroma) / 2,
      })
    }
    return links
  }, [projected])

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    setIsDragging(true)
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      rxy: rotXY,
      rxz: rotXZ,
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragStart.current) {
      return
    }
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y

    setRotXY(dragStart.current.rxy + dx * 0.006)
    setRotXZ(clamp(dragStart.current.rxz + dy * 0.006, -1.35, 1.35))
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
          min={0.45}
          max={2.6}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
        />
        <span>{zoom.toFixed(2)}x</span>
        <span className="metric4d-drag-hint">Drag canvas -&gt; XY / XZ planes</span>
      </div>

      <div className="metric4d-planes">
        <span className="metric4d-label">8D subspace rotations</span>

        <label className="metric4d-plane-row">
          <span>XW</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotXW} onChange={(e) => setRotXW(Number.parseFloat(e.target.value))} />
          <code>{rotXW.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>YW</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotYW} onChange={(e) => setRotYW(Number.parseFloat(e.target.value))} />
          <code>{rotYW.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>ZW</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotZW} onChange={(e) => setRotZW(Number.parseFloat(e.target.value))} />
          <code>{rotZW.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>UV</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotUV} onChange={(e) => setRotUV(Number.parseFloat(e.target.value))} />
          <code>{rotUV.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>ST</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotST} onChange={(e) => setRotST(Number.parseFloat(e.target.value))} />
          <code>{rotST.toFixed(3)} rad</code>
        </label>

        <label className="metric4d-plane-row">
          <span>XT</span>
          <input type="range" min={-PI} max={PI} step={0.01} value={rotXT} onChange={(e) => setRotXT(Number.parseFloat(e.target.value))} />
          <code>{rotXT.toFixed(3)} rad</code>
        </label>

        <div className="metric4d-legend">
          <span style={{ color: 'rgb(39,199,255)' }}>chroma low</span>
          <span style={{ color: 'rgb(100,145,255)' }}>chroma mid</span>
          <span style={{ color: 'rgb(160,92,255)' }}>chroma high</span>
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
          const edgeColor = chromaColor(edge.chroma)
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
          const pointColor = chromaColor(point.chroma)
          return (
            <g key={point.id} opacity={point.opacity}>
              <circle
                cx={point.x2d}
                cy={point.y2d}
                r={point.radius + 3.4}
                fill={pointColor}
                opacity={0.2}
              />
              <circle
                cx={point.x2d}
                cy={point.y2d}
                r={point.radius}
                fill="rgba(255,255,255,0.9)"
                stroke={pointColor}
                strokeWidth={1.35}
              />
              {point.depth > 0.05 && (
                <text
                  x={point.x2d + 8}
                  y={point.y2d - 8}
                  className="metric3d-label"
                  fill={pointColor}
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
