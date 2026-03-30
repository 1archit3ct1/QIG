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
  dcdt: number | null              // dC/dt_wall
  dcdtTau: number | null           // dC/dτ_QIG
  lloydFraction: number | null     // Execution Lloyd Efficiency
  intrinsicEfficiency: number | null  // Intrinsic Lloyd Efficiency (should be ~1.0)
  bulkVolume: number | null
  meanDcdt: number | null
  tauQig: number | null            // τ_QIG - QIG proper time
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
  // Parse SCALAR_METRIC tagged format (preferred)
  const totalComplexity = extractFloat(/SCALAR_METRIC:\s*total_complexity=([0-9]+\.?[0-9]*)/, stdout)
  const dcdt = extractFloat(/SCALAR_METRIC:\s*dcdt_wall=([0-9]+\.?[0-9]*)/, stdout)
  const dcdtTau = extractFloat(/SCALAR_METRIC:\s*dcdt_tau=([0-9]+\.?[0-9]*)/, stdout)
  const lloydFraction = extractFloat(/SCALAR_METRIC:\s*lloyd_fraction=([0-9]+\.?[0-9]*)/, stdout)
  const intrinsicEfficiency = extractFloat(/SCALAR_METRIC:\s*intrinsic_efficiency=([0-9]+\.?[0-9]*)/, stdout)
  const bulkVolume = extractFloat(/SCALAR_METRIC:\s*bulk_volume=([0-9]+\.?[0-9]*)/, stdout)
  const meanDcdt = extractFloat(/SCALAR_METRIC:\s*mean_dcdt=([0-9]+\.?[0-9]*)/, stdout)
  const tauQig = extractFloat(/SCALAR_METRIC:\s*tau_qig=([0-9]+\.?[0-9]*)/, stdout)

  // Fallback to old format if no SCALAR_METRIC tags found
  const fallbackTotalComplexity = extractLastFloat(/Total complexity C\(t\):\s*([0-9]+\.?[0-9]*)/g, stdout)
  const fallbackDcdt = extractLastFloat(/Complexity growth rate dC\/dt:\s*([0-9]+\.?[0-9]*)/g, stdout)
  const fallbackLloydFraction = extractLastPercent(/Efficiency \(Lloyd fraction\):\s*([0-9]+\.?[0-9]*)%/g, stdout)
  const fallbackBulkVolume = extractLastFloat(/Bulk volume V = C\*G_N\*l:\s*([0-9]+\.?[0-9]*)/g, stdout)

  const gateMatches = Array.from(
    stdout.matchAll(/C=([0-9]+\.?[0-9]*),\s*dC\/dt=([0-9]+\.?[0-9]*),\s*Lloyd=([0-9]+\.?[0-9]*)%(?:,\s*V=([0-9]+\.?[0-9]*))?/g),
  )
  const latestGate = gateMatches.length > 0 ? gateMatches[gateMatches.length - 1] : null

  const metrics: ComplexityMetrics = {
    totalComplexity: totalComplexity ?? fallbackTotalComplexity ?? (latestGate ? Number.parseFloat(latestGate[1]) : null),
    dcdt: dcdt ?? fallbackDcdt ?? (latestGate ? Number.parseFloat(latestGate[2]) : null),
    dcdtTau: dcdtTau,
    lloydFraction: lloydFraction ?? fallbackLloydFraction ?? (latestGate ? Number.parseFloat(latestGate[3]) / 100 : null),
    intrinsicEfficiency: intrinsicEfficiency,
    bulkVolume: bulkVolume ?? fallbackBulkVolume ?? (latestGate?.[4] ? Number.parseFloat(latestGate[4]) : null),
    meanDcdt: meanDcdt ?? null,
    tauQig: tauQig,
  }

  return Object.values(metrics).some((value) => value !== null)
    ? metrics
    : null
}

export function parseComplexityRateSeries(stdout: string): ComplexityRateSample[] {
  const points: ComplexityRateSample[] = []

  for (const line of stdout.split('\n')) {
    // Support multiple formats:
    // 1. New τ_QIG format: step=N, τ_QIG=X, dC/dτ_QIG=Y
    // 2. Old format: t=X, C=Y, dC/dt=Z
    const newFormat = line.match(/step=(\d+),.*?τ_QIG=([0-9]+\.?[0-9]*).*?dC\/dτ_QIG=([0-9]+\.?[0-9]*)/)
    const oldFormat = line.match(/t=([0-9]+\.?[0-9]*),\s*C=[0-9]+\.?[0-9]*,\s*dC\/dt=([0-9]+\.?[0-9]*)/)
    
    const match = newFormat || oldFormat
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
