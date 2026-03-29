import { useMemo, useRef, useState } from 'react'

export type MetricPoint3D = {
  id: string
  x: number
  y: number
  z: number
  label: string
}

type MetricSpaceViewProps = {
  points: MetricPoint3D[]
}

type ProjectedPoint = {
  id: string
  x2d: number
  y2d: number
  depth: number
  radius: number
  label: string
}

const WIDTH = 740
const HEIGHT = 340
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export default function MetricSpaceView({ points }: MetricSpaceViewProps) {
  const [rotationX, setRotationX] = useState(0.42)
  const [rotationY, setRotationY] = useState(0.6)
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null)

  const projected = useMemo<ProjectedPoint[]>(() => {
    const perspective = 380
    const scale = 130 * zoom

    const sinX = Math.sin(rotationX)
    const cosX = Math.cos(rotationX)
    const sinY = Math.sin(rotationY)
    const cosY = Math.cos(rotationY)

    return points
      .map((p) => {
        // Rotate around Y axis.
        const x1 = p.x * cosY + p.z * sinY
        const z1 = -p.x * sinY + p.z * cosY

        // Rotate around X axis.
        const y2 = p.y * cosX - z1 * sinX
        const z2 = p.y * sinX + z1 * cosX

        const depthFactor = perspective / (perspective - z2 * 140)
        return {
          id: p.id,
          x2d: CENTER_X + x1 * scale * depthFactor,
          y2d: CENTER_Y + y2 * scale * depthFactor,
          depth: z2,
          radius: clamp(3.5 + (z2 + 1) * 1.6, 2.6, 7.5),
          label: p.label,
        }
      })
      .sort((a, b) => a.depth - b.depth)
  }, [points, rotationX, rotationY, zoom])

  const edges = useMemo(() => {
    const links: Array<{ from: ProjectedPoint; to: ProjectedPoint }> = []
    for (let i = 0; i < projected.length - 1; i += 1) {
      links.push({ from: projected[i], to: projected[i + 1] })
    }
    return links
  }, [projected])

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    setIsDragging(true)
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      rx: rotationX,
      ry: rotationY,
    }
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragStart.current) {
      return
    }
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y

    setRotationY(dragStart.current.ry + dx * 0.006)
    setRotationX(clamp(dragStart.current.rx + dy * 0.006, -1.25, 1.25))
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
          min={0.7}
          max={1.5}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number.parseFloat(e.target.value))}
        />
        <span>{zoom.toFixed(2)}x</span>
      </div>

      <svg
        className={isDragging ? 'metric3d-canvas dragging' : 'metric3d-canvas'}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <radialGradient id="metricGlow" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="rgba(39, 199, 255, 0.95)" />
            <stop offset="100%" stopColor="rgba(31, 86, 255, 0.22)" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="transparent" />

        {edges.map((edge, index) => (
          <line
            key={`${edge.from.id}-${edge.to.id}-${index}`}
            x1={edge.from.x2d}
            y1={edge.from.y2d}
            x2={edge.to.x2d}
            y2={edge.to.y2d}
            stroke="rgba(99, 131, 214, 0.45)"
            strokeWidth={1}
          />
        ))}

        {projected.map((point) => (
          <g key={point.id}>
            <circle
              cx={point.x2d}
              cy={point.y2d}
              r={point.radius + 2.2}
              fill="url(#metricGlow)"
              opacity={0.35}
            />
            <circle
              cx={point.x2d}
              cy={point.y2d}
              r={point.radius}
              fill="rgba(255,255,255,0.92)"
              stroke="rgba(39, 199, 255, 0.95)"
              strokeWidth={1.2}
            />
            {point.depth > 0.25 && (
              <text
                x={point.x2d + 8}
                y={point.y2d - 8}
                className="metric3d-label"
              >
                {point.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}
