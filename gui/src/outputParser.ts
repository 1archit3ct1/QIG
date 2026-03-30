export type SimulationId = 'all' | 'geometry' | 'holographic' | 'complexity_compiler'

export type MetricCard = {
  label: string
  value: string
}

export type MetricPoint = {
  x: number
  y: number
}

export type MetricChart = {
  key: string
  title: string
  xLabel: string
  yLabel: string
  points: MetricPoint[]
}

export type ParsedSimulationOutput = {
  cards: MetricCard[]
  charts: MetricChart[]
}

export type ComplexityMetrics = {
  totalComplexity: number | null
  dcdt: number | null
  lloydFraction: number | null
  bulkVolume: number | null
  meanDcdt: number | null
}

export type ComplexityRateSample = {
  x: number
  y: number
}

function extractFloat(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern)
  if (!match) {
    return null
  }
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

function extractLastFloat(pattern: RegExp, text: string): number | null {
  let last: number | null = null
  for (const match of text.matchAll(pattern)) {
    const value = Number.parseFloat(match[1])
    if (Number.isFinite(value)) {
      last = value
    }
  }
  return last
}

function extractLastPercent(pattern: RegExp, text: string): number | null {
  let last: number | null = null
  for (const match of text.matchAll(pattern)) {
    const value = Number.parseFloat(match[1])
    if (Number.isFinite(value)) {
      last = value / 100
    }
  }
  return last
}

function parsePageCurve(stdout: string): MetricPoint[] {
  const points: MetricPoint[] = []
  const lines = stdout.split('\n')

  for (const line of lines) {
    // Support both old format and new QUANTUM_NODE tagged format
    const match = line.match(/(?:QUANTUM_NODE:\s*)?t=\s*(\d+).*?entropy=([0-9]+\.[0-9]+)/)
    if (!match) {
      continue
    }
    points.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
    })
  }

  return points
}

function parseComplexityTrajectory(stdout: string): MetricPoint[] {
  const points: MetricPoint[] = []
  const lines = stdout.split('\n')

  for (const line of lines) {
    const match = line.match(/^\s*t=([0-9]+\.?[0-9]*):.*?C=([0-9]+\.?[0-9]*)/)
    if (!match) {
      continue
    }
    points.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
    })
  }

  return points
}

export function parseComplexityMetrics(stdout: string): ComplexityMetrics | null {
  const totalComplexity = extractLastFloat(/Total complexity C\(t\):\s*([0-9]+\.?[0-9]*)/g, stdout)
  const dcdt = extractLastFloat(/Complexity growth rate dC\/dt:\s*([0-9]+\.?[0-9]*)/g, stdout)
  const lloydFraction = extractLastPercent(/Efficiency \(Lloyd fraction\):\s*([0-9]+\.?[0-9]*)%/g, stdout)
  const bulkVolume = extractLastFloat(/Bulk volume V = C\*G_N\*l:\s*([0-9]+\.?[0-9]*)/g, stdout)
  const meanDcdt = extractLastFloat(/Mean dC\/dt over simulation:\s*([0-9]+\.?[0-9]*)/g, stdout)

  const gateMatches = Array.from(
    stdout.matchAll(/C=([0-9]+\.?[0-9]*),\s*dC\/dt=([0-9]+\.?[0-9]*),\s*Lloyd=([0-9]+\.?[0-9]*)%(?:,\s*V=([0-9]+\.?[0-9]*))?/g),
  )
  const latestGate = gateMatches.length > 0 ? gateMatches[gateMatches.length - 1] : null

  const fallbackTotalComplexity = latestGate ? Number.parseFloat(latestGate[1]) : null
  const fallbackDcdt = latestGate ? Number.parseFloat(latestGate[2]) : null
  const fallbackLloydFraction = latestGate ? Number.parseFloat(latestGate[3]) / 100 : null
  const fallbackBulkVolume = latestGate?.[4] ? Number.parseFloat(latestGate[4]) : null

  const metrics: ComplexityMetrics = {
    totalComplexity: totalComplexity ?? fallbackTotalComplexity,
    dcdt: dcdt ?? fallbackDcdt,
    lloydFraction: lloydFraction ?? fallbackLloydFraction,
    bulkVolume: bulkVolume ?? fallbackBulkVolume,
    meanDcdt: meanDcdt ?? null,
  }

  return Object.values(metrics).some((value) => value !== null)
    ? metrics
    : null
}

export function parseComplexityRateSeries(stdout: string): ComplexityRateSample[] {
  const points: ComplexityRateSample[] = []

  for (const line of stdout.split('\n')) {
    const match = line.match(/t=([0-9]+\.?[0-9]*),\s*C=[0-9]+\.?[0-9]*,\s*dC\/dt=([0-9]+\.?[0-9]*)/)
    if (!match) {
      continue
    }

    points.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
    })
  }

  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  // Preserve original x values (now includes 100000 offset for better visualization)
  return valid
}

export function parseSimulationOutput(
  simulation: SimulationId,
  stdout: string,
): ParsedSimulationOutput {
  const cards: MetricCard[] = []
  const charts: MetricChart[] = []

  // Parse new SCALAR_METRIC tagged format
  for (const match of stdout.matchAll(/SCALAR_METRIC:\s*(\w+)=([0-9]+\.?[0-9]*)/g)) {
    const key = match[1]
    const value = Number.parseFloat(match[2])
    if (Number.isFinite(value)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      cards.push({
        label,
        value: value.toFixed(4),
      })
    }
  }

  // Fallback to old format if no SCALAR_METRIC tags found
  const totalEntanglement = extractFloat(/Total entanglement:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (totalEntanglement !== null && cards.length === 0) {
    cards.push({
      label: 'Total Entanglement',
      value: totalEntanglement.toFixed(4),
    })
  }

  const peakEntropy = extractFloat(/Peak entropy:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (peakEntropy !== null && !cards.some(c => c.label.includes('Peak'))) {
    cards.push({
      label: 'Peak Radiation Entropy',
      value: peakEntropy.toFixed(4),
    })
  }

  const finalEntropy = extractFloat(/Final entropy:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (finalEntropy !== null && !cards.some(c => c.label.includes('Final'))) {
    cards.push({
      label: 'Final Radiation Entropy',
      value: finalEntropy.toFixed(4),
    })
  }

  const totalComplexity = extractFloat(/Total complexity C\(t\):\s*([0-9]+\.?[0-9]*)/, stdout)
  if (totalComplexity !== null && !cards.some(c => c.label.includes('Complexity'))) {
    cards.push({
      label: 'Total Complexity C(t)',
      value: totalComplexity.toFixed(4),
    })
  }

  const commImprovement = extractFloat(/Improvement:\s*([0-9]+\.?[0-9]*)% reduction/, stdout)
  if (commImprovement !== null && !cards.some(c => c.label.includes('Gain'))) {
    cards.push({
      label: 'Compiler Communication Gain',
      value: `${commImprovement.toFixed(1)}%`,
    })
  }

  const pageCurve = parsePageCurve(stdout)
  if (pageCurve.length > 0) {
    charts.push({
      key: 'page-curve',
      title: 'Page Curve (Radiation Entropy)',
      xLabel: 'Time Step',
      yLabel: 'Entropy',
      points: pageCurve,
    })
  }

  const trajectory = parseComplexityTrajectory(stdout)
  if (trajectory.length > 0) {
    charts.push({
      key: 'complexity-trajectory',
      title: 'Complexity Trajectory',
      xLabel: 'Time',
      yLabel: 'Complexity',
      points: trajectory,
    })
  }

  if (simulation === 'holographic' && cards.length === 0 && charts.length === 0) {
    cards.push({
      label: 'Holographic Status',
      value: 'Run complete (inspect stdout for RT and wedge checks)',
    })
  }

  return { cards, charts }
}
