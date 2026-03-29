import { useMemo, useRef, useState } from 'react'

type Vec16 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

export type MetricPoint16D = {
  id: string
  v: Vec16
  label: string
}

type MetricSpaceViewProps = {
  points: MetricPoint16D[]
}

type Vec4 = [number, number, number, number]

type PlaneDef = {
  key: string
  label: string
  i: number
  j: number
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

const WIDTH = 740
const HEIGHT = 560
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2
const PI = Math.PI

const FIT_MARGIN_X = 0.88
const FIT_MARGIN_Y = 0.84

const AXIS = ['X', 'Y', 'Z', 'W', 'U', 'V', 'S', 'T', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

const DIST_REDUCTION: Record<number, number> = {
  15: 9.8,
  14: 9.5,
  13: 9.2,
  12: 8.9,
  11: 8.6,
  10: 8.3,
  9: 8.0,
  8: 7.7,
  7: 7.4,
  6: 7.1,
  5: 6.8,
  4: 6.5,
  3: 6.2,
}

const DIST_4D = 5.9
const DIST_3D = 5.8

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function planeKey(i: number, j: number): string {
  const a = Math.min(i, j)
  const b = Math.max(i, j)
  return `${a}-${b}`
}

function buildPlaneDefs(): { anchorPlanes: PlaneDef[]; chainPlanes: PlaneDef[]; allPlanes: PlaneDef[] } {
  const extraIndices = Array.from({ length: 13 }, (_, idx) => idx + 3)

  const anchorPlanes: PlaneDef[] = extraIndices.flatMap((k) => [
    { key: planeKey(0, k), label: `${AXIS[0]}${AXIS[k]}`, i: 0, j: k },
    { key: planeKey(1, k), label: `${AXIS[1]}${AXIS[k]}`, i: 1, j: k },
    { key: planeKey(2, k), label: `${AXIS[2]}${AXIS[k]}`, i: 2, j: k },
  ])

  const chainPlanes: PlaneDef[] = Array.from({ length: 12 }, (_, idx) => {
    const i = idx + 3
    const j = idx + 4
    return { key: planeKey(i, j), label: `${AXIS[i]}${AXIS[j]}`, i, j }
  })

  return {
    anchorPlanes,
    chainPlanes,
    allPlanes: [...anchorPlanes, ...chainPlanes],
  }
}

const PLANE_LAYOUT = buildPlaneDefs()

function initialAngles(): Record<string, number> {
  const angles: Record<string, number> = {}
  PLANE_LAYOUT.allPlanes.forEach((plane) => {
    angles[plane.key] = 0
  })

  // Requested practical defaults on W-axis couplings.
  angles[planeKey(0, 3)] = 0.65
  angles[planeKey(1, 3)] = -0.35
  angles[planeKey(2, 3)] = 0.85
  return angles
}

function normalizeVec16(vec: number[]): number[] {
  let sumSq = 0
  for (let i = 0; i < 16; i += 1) {
    sumSq += vec[i] * vec[i]
  }
  const norm = Math.sqrt(sumSq)
  if (!Number.isFinite(norm) || norm <= 1e-8) {
    return vec
  }
  const scale = Math.min(1, 1.25 / norm)
  return vec.map((v) => v * scale)
}

function rotatePlane(vec: number[], i: number, j: number, angle: number): void {
  // Constrained Givens rotation: bounded angle and attenuation by plane index.
  const bounded = clamp(angle, -1.35, 1.35)
  const attenuation = 1 / Math.sqrt(1 + 0.18 * Math.max(i, j))
  const eff = bounded * attenuation

  const c = Math.cos(eff)
  const s = Math.sin(eff)
  const vi = vec[i]
  const vj = vec[j]
  vec[i] = vi * c - vj * s
  vec[j] = vi * s + vj * c
}

function rotatePlaneSimple(vec: number[], i: number, j: number, angle: number): void {
  const bounded = clamp(angle, -PI, PI)
  const c = Math.cos(bounded)
  const s = Math.sin(bounded)
  const vi = vec[i]
  const vj = vec[j]
  vec[i] = vi * c - vj * s
  vec[j] = vi * s + vj * c
}

function reduce16To4(vec16: Vec16): { xyzw: Vec4; chroma: number } {
  const v = vec16.slice() as number[]

  for (let last = 15; last >= 4; last -= 1) {
    const dist = DIST_REDUCTION[last]
    const denom = clamp(dist - v[last], 1.1, 99)
    const factor = clamp(dist / denom, 0.62, 1.72)
    for (let i = 0; i < last; i += 1) {
      v[i] *= factor
    }
    v.pop()
  }

  const chroma = (vec16[3] + vec16[4] + vec16[5] + vec16[6] + vec16[7]) / 5
  return {
    xyzw: [v[0], v[1], v[2], v[3]],
    chroma: clamp(chroma, -1.8, 1.8),
  }
}

function chromaColor(value: number): string {
  const t = clamp((value + 1.8) / 3.6, 0, 1)
  const r = Math.round(36 + t * (168 - 36))
  const g = Math.round(196 + t * (96 - 196))
  const b = 255
  return `rgb(${r},${g},${b})`
}

export default function MetricSpaceView({ points }: MetricSpaceViewProps) {
  const [zoom, setZoom] = useState(1.25)

  // View orientation controls remain direct and intuitive.
  const [rotXY, setRotXY] = useState(0.6)
  const [rotXZ, setRotXZ] = useState(0.42)
  const [rotYZ, setRotYZ] = useState(0)
  const [rotXWView, setRotXWView] = useState(0)
  const [rotYWView, setRotYWView] = useState(0)
  const [rotZWView, setRotZWView] = useState(0)
  const [showDeltaOverlay, setShowDeltaOverlay] = useState(true)
  const [show8DDelta, setShow8DDelta] = useState(true)
  const [show16DDelta, setShow16DDelta] = useState(true)

  // 16D constrained rotation controls.
  const [angles, setAngles] = useState<Record<string, number>>(() => initialAngles())

  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; rxy: number; rxz: number } | null>(null)

  const buildProjected = (include4DViewRotations: boolean, dimensionCap: 4 | 8 | 16): ProjectedPoint[] => {
    const raw = points.map((p) => {
      const vec = normalizeVec16(p.v.map((value) => finiteOrZero(value)))

      if (dimensionCap < 16) {
        for (let i = dimensionCap; i < 16; i += 1) {
          vec[i] = 0
        }
      }

      // Base view orientation planes in XYZ.
      rotatePlane(vec, 0, 1, rotXY)
      rotatePlane(vec, 0, 2, rotXZ)
      rotatePlane(vec, 1, 2, rotYZ)

      // Constrained higher-dimensional subspace rotations.
      PLANE_LAYOUT.allPlanes.forEach((plane) => {
        if (plane.i < dimensionCap && plane.j < dimensionCap) {
          rotatePlane(vec, plane.i, plane.j, angles[plane.key] ?? 0)
        }
      })

      const { xyzw, chroma } = reduce16To4(vec as Vec16)
      const view4 = [
        finiteOrZero(xyzw[0]),
        finiteOrZero(xyzw[1]),
        finiteOrZero(xyzw[2]),
        finiteOrZero(xyzw[3]),
      ]

      // 3D orientation controls.
      rotatePlaneSimple(view4, 0, 1, rotXY)
      rotatePlaneSimple(view4, 0, 2, rotXZ)
      rotatePlaneSimple(view4, 1, 2, rotYZ)

      // Optional 4D view rotations (for delta overlay comparison we disable these).
      if (include4DViewRotations) {
        rotatePlaneSimple(view4, 0, 3, rotXWView)
        rotatePlaneSimple(view4, 1, 3, rotYWView)
        rotatePlaneSimple(view4, 2, 3, rotZWView)
      }

      // 4D -> 3D perspective (compress along W axis).
      const denomW = clamp(DIST_4D - view4[3], 0.95, 99)
      const perspective4 = clamp(DIST_4D / denomW, 0.62, 1.78)
      const x3 = view4[0] * perspective4
      const y3 = view4[1] * perspective4
      const z3 = view4[2] * perspective4

      // 3D -> 2D perspective (compress along Z axis).
      const denomZ = clamp(DIST_3D - z3 * 0.44, 1.0, 99)
      const perspective3 = clamp(DIST_3D / denomZ, 0.62, 1.78)
      const x = x3
      const y = y3
      const z = z3

      return {
        id: p.id,
        xRaw: x * perspective3,
        yRaw: y * perspective3,
        depth: z,
        chroma: finiteOrZero(clamp(chroma * 0.7 + view4[3] * 0.3, -1.8, 1.8)),
        label: p.label,
      }
    })

    const finiteRaw = raw.filter(
      (p) => Number.isFinite(p.xRaw) && Number.isFinite(p.yRaw) && Number.isFinite(p.depth) && Number.isFinite(p.chroma),
    )

    const stableRaw = finiteRaw.length > 0
      ? finiteRaw
      : points.slice(0, 28).map((p, index) => {
          const angle = (index / Math.max(points.length, 1)) * Math.PI * 2
          return {
            id: `${p.id}-fallback`,
            xRaw: Math.cos(angle) * 0.62,
            yRaw: Math.sin(angle) * 0.42,
            depth: 0,
            chroma: 0,
            label: p.label,
          }
        })

    const minX = Math.min(...stableRaw.map((p) => p.xRaw), -1)
    const maxX = Math.max(...stableRaw.map((p) => p.xRaw), 1)
    const minY = Math.min(...stableRaw.map((p) => p.yRaw), -1)
    const maxY = Math.max(...stableRaw.map((p) => p.yRaw), 1)
    const spanX = Math.max(maxX - minX, 0.01)
    const spanY = Math.max(maxY - minY, 0.01)
    const fitScale = Math.min((WIDTH * FIT_MARGIN_X) / spanX, (HEIGHT * FIT_MARGIN_Y) / spanY)

    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2

    return stableRaw
      .map((p) => {
        const x2d = CENTER_X + (p.xRaw - midX) * fitScale * zoom
        const y2d = CENTER_Y + (p.yRaw - midY) * fitScale * zoom
        const radius = clamp(2.9 + p.depth * 0.72, 2.1, 6.6)
        const opacity = clamp(0.6 + p.depth * 0.14, 0.24, 1)
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
  }

  const projected = useMemo<ProjectedPoint[]>(() => {
    return buildProjected(true, 16)
  }, [angles, points, rotXY, rotXZ, rotYZ, rotXWView, rotYWView, rotZWView, zoom])

  const projectedBaseline = useMemo<ProjectedPoint[]>(() => {
    return buildProjected(false, 16)
  }, [angles, points, rotXY, rotXZ, rotYZ, zoom])

  const projected8Ref = useMemo<ProjectedPoint[]>(() => {
    return buildProjected(true, 8)
  }, [angles, points, rotXY, rotXZ, rotYZ, rotXWView, rotYWView, rotZWView, zoom])

  const projected4Ref = useMemo<ProjectedPoint[]>(() => {
    return buildProjected(true, 4)
  }, [angles, points, rotXY, rotXZ, rotYZ, rotXWView, rotYWView, rotZWView, zoom])

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

  const baselineEdges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint }> = []
    for (let i = 0; i < projectedBaseline.length - 1; i += 1) {
      links.push({
        from: projectedBaseline[i],
        to: projectedBaseline[i + 1],
      })
    }
    return links
  }, [projectedBaseline])

  const ref8Edges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint }> = []
    for (let i = 0; i < projected8Ref.length - 1; i += 1) {
      links.push({
        from: projected8Ref[i],
        to: projected8Ref[i + 1],
      })
    }
    return links
  }, [projected8Ref])

  const ref4Edges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint }> = []
    for (let i = 0; i < projected4Ref.length - 1; i += 1) {
      links.push({
        from: projected4Ref[i],
        to: projected4Ref[i + 1],
      })
    }
    return links
  }, [projected4Ref])

  const byId16 = useMemo(() => new Map(projected.map((p) => [p.id, p])), [projected])

  const delta8Connectors = useMemo(() => {
    return projected8Ref
      .map((p8) => {
        const p16 = byId16.get(p8.id)
        if (!p16) return null
        return { from: p8, to: p16 }
      })
      .filter((v): v is { from: ProjectedPoint; to: ProjectedPoint } => v !== null)
  }, [projected8Ref, byId16])

  const delta16Connectors = useMemo(() => {
    return projected4Ref
      .map((p4) => {
        const p16 = byId16.get(p4.id)
        if (!p16) return null
        return { from: p4, to: p16 }
      })
      .filter((v): v is { from: ProjectedPoint; to: ProjectedPoint } => v !== null)
  }, [projected4Ref, byId16])

  function setPlaneAngle(key: string, value: number) {
    setAngles((prev) => ({ ...prev, [key]: value }))
  }

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

        <label className="metric-view-tilt" htmlFor="metric-rot-yz">YZ</label>
        <input
          id="metric-rot-yz"
          type="range"
          min={-PI}
          max={PI}
          step={0.01}
          value={rotYZ}
          onChange={(e) => setRotYZ(Number.parseFloat(e.target.value))}
        />
        <code>{rotYZ.toFixed(3)} rad</code>

        <span className="metric4d-drag-hint">Drag canvas -&gt; XY / XZ</span>
        <label className="metric-delta-toggle" htmlFor="delta-overlay">
          <input
            id="delta-overlay"
            type="checkbox"
            checked={showDeltaOverlay}
            onChange={(e) => setShowDeltaOverlay(e.target.checked)}
          />
          Show 4D Delta
        </label>
        <label className="metric-delta-toggle" htmlFor="delta-overlay-8d">
          <input
            id="delta-overlay-8d"
            type="checkbox"
            checked={show8DDelta}
            onChange={(e) => setShow8DDelta(e.target.checked)}
          />
          Show 8D Delta
        </label>
        <label className="metric-delta-toggle" htmlFor="delta-overlay-16d">
          <input
            id="delta-overlay-16d"
            type="checkbox"
            checked={show16DDelta}
            onChange={(e) => setShow16DDelta(e.target.checked)}
          />
          Show 16D Delta
        </label>
      </div>

      <div className="metric4d-view-row">
        <span className="metric4d-label">4D view space</span>
        <label className="metric4d-plane-row">
          <span>XWv</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotXWView}
            onChange={(e) => setRotXWView(Number.parseFloat(e.target.value))}
          />
          <code>{rotXWView.toFixed(3)} rad</code>
        </label>
        <label className="metric4d-plane-row">
          <span>YWv</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotYWView}
            onChange={(e) => setRotYWView(Number.parseFloat(e.target.value))}
          />
          <code>{rotYWView.toFixed(3)} rad</code>
        </label>
        <label className="metric4d-plane-row">
          <span>ZWv</span>
          <input
            type="range"
            min={-PI}
            max={PI}
            step={0.01}
            value={rotZWView}
            onChange={(e) => setRotZWView(Number.parseFloat(e.target.value))}
          />
          <code>{rotZWView.toFixed(3)} rad</code>
        </label>
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

        {showDeltaOverlay && baselineEdges.map((edge, index) => (
          <line
            key={`base-${edge.from.id}-${edge.to.id}-${index}`}
            x1={edge.from.x2d}
            y1={edge.from.y2d}
            x2={edge.to.x2d}
            y2={edge.to.y2d}
            stroke="rgba(148, 156, 191, 0.55)"
            strokeWidth={0.8}
            strokeDasharray="2.5 2.4"
            opacity={0.45}
          />
        ))}

        {show8DDelta && ref4Edges.map((edge, index) => (
          <line
            key={`ref4-${edge.from.id}-${edge.to.id}-${index}`}
            x1={edge.from.x2d}
            y1={edge.from.y2d}
            x2={edge.to.x2d}
            y2={edge.to.y2d}
            stroke="rgba(75, 186, 255, 0.62)"
            strokeWidth={0.8}
            strokeDasharray="1.6 2.2"
            opacity={0.42}
          />
        ))}

        {show16DDelta && ref8Edges.map((edge, index) => (
          <line
            key={`ref8-${edge.from.id}-${edge.to.id}-${index}`}
            x1={edge.from.x2d}
            y1={edge.from.y2d}
            x2={edge.to.x2d}
            y2={edge.to.y2d}
            stroke="rgba(171, 106, 255, 0.6)"
            strokeWidth={0.8}
            strokeDasharray="3 2"
            opacity={0.44}
          />
        ))}

        {show8DDelta && delta8Connectors.map((seg, index) => (
          <line
            key={`delta8-${seg.from.id}-${index}`}
            x1={seg.from.x2d}
            y1={seg.from.y2d}
            x2={seg.to.x2d}
            y2={seg.to.y2d}
            stroke="rgba(75, 186, 255, 0.35)"
            strokeWidth={0.75}
            opacity={0.5}
          />
        ))}

        {show16DDelta && delta16Connectors.map((seg, index) => (
          <line
            key={`delta16-${seg.from.id}-${index}`}
            x1={seg.from.x2d}
            y1={seg.from.y2d}
            x2={seg.to.x2d}
            y2={seg.to.y2d}
            stroke="rgba(171, 106, 255, 0.36)"
            strokeWidth={0.75}
            opacity={0.52}
          />
        ))}

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
                r={point.radius + 3.2}
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

        {showDeltaOverlay && projectedBaseline.map((point) => (
          <circle
            key={`base-pt-${point.id}`}
            cx={point.x2d}
            cy={point.y2d}
            r={Math.max(1.9, point.radius - 1.15)}
            fill="rgba(145, 153, 187, 0.24)"
            stroke="rgba(135, 143, 181, 0.68)"
            strokeWidth={0.8}
          />
        ))}

        {show8DDelta && projected4Ref.map((point) => (
          <circle
            key={`ref4-pt-${point.id}`}
            cx={point.x2d}
            cy={point.y2d}
            r={Math.max(1.75, point.radius - 1.3)}
            fill="rgba(75, 186, 255, 0.2)"
            stroke="rgba(75, 186, 255, 0.58)"
            strokeWidth={0.8}
          />
        ))}

        {show16DDelta && projected8Ref.map((point) => (
          <circle
            key={`ref8-pt-${point.id}`}
            cx={point.x2d}
            cy={point.y2d}
            r={Math.max(1.8, point.radius - 1.2)}
            fill="rgba(171, 106, 255, 0.2)"
            stroke="rgba(171, 106, 255, 0.58)"
            strokeWidth={0.8}
          />
        ))}
      </svg>

      <div className="metric16d-panel">
        <div className="metric16d-head">
          <span className="metric4d-label">16D constrained rotations</span>
          <span className="metric16d-note">Logical complete set: X/Y/Z anchors to latent axes + latent chain couplings</span>
        </div>

        <div className="metric16d-groups">
          <section className="metric16d-group">
            <h4>Anchor Plane Sliders (39)</h4>
            <div className="metric16d-grid">
              {PLANE_LAYOUT.anchorPlanes.map((plane) => (
                <label key={plane.key} className="metric4d-plane-row metric16d-plane-row">
                  <span>{plane.label}</span>
                  <input
                    type="range"
                    min={-PI}
                    max={PI}
                    step={0.01}
                    value={angles[plane.key] ?? 0}
                    onChange={(e) => setPlaneAngle(plane.key, Number.parseFloat(e.target.value))}
                  />
                  <code>{(angles[plane.key] ?? 0).toFixed(3)} rad</code>
                </label>
              ))}
            </div>
          </section>

          <section className="metric16d-group">
            <h4>Latent Chain Sliders (12)</h4>
            <div className="metric16d-grid metric16d-grid-chain">
              {PLANE_LAYOUT.chainPlanes.map((plane) => (
                <label key={plane.key} className="metric4d-plane-row metric16d-plane-row">
                  <span>{plane.label}</span>
                  <input
                    type="range"
                    min={-PI}
                    max={PI}
                    step={0.01}
                    value={angles[plane.key] ?? 0}
                    onChange={(e) => setPlaneAngle(plane.key, Number.parseFloat(e.target.value))}
                  />
                  <code>{(angles[plane.key] ?? 0).toFixed(3)} rad</code>
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="metric4d-legend">
          <span style={{ color: 'rgb(39,199,255)' }}>chroma low</span>
          <span style={{ color: 'rgb(100,145,255)' }}>chroma mid</span>
          <span style={{ color: 'rgb(168,96,255)' }}>chroma high</span>
          <span style={{ color: 'rgba(145,153,187,1)' }}>4D delta</span>
          <span style={{ color: 'rgba(75,186,255,1)' }}>8D delta</span>
          <span style={{ color: 'rgba(171,106,255,1)' }}>16D delta</span>
        </div>
      </div>
    </div>
  )
}
