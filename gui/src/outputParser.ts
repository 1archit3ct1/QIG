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

function extractFloat(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern)
  if (!match) {
    return null
  }
  const value = Number.parseFloat(match[1])
  return Number.isFinite(value) ? value : null
}

function parsePageCurve(stdout: string): MetricPoint[] {
  const points: MetricPoint[] = []
  const lines = stdout.split('\n')

  for (const line of lines) {
    const match = line.match(/^\s*t=\s*(\d+):.*?([0-9]+\.[0-9]+)/)
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

export function parseSimulationOutput(
  simulation: SimulationId,
  stdout: string,
): ParsedSimulationOutput {
  const cards: MetricCard[] = []
  const charts: MetricChart[] = []

  const totalEntanglement = extractFloat(/Total entanglement:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (totalEntanglement !== null) {
    cards.push({
      label: 'Total Entanglement',
      value: totalEntanglement.toFixed(4),
    })
  }

  const peakEntropy = extractFloat(/Peak entropy:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (peakEntropy !== null) {
    cards.push({
      label: 'Peak Radiation Entropy',
      value: peakEntropy.toFixed(4),
    })
  }

  const finalEntropy = extractFloat(/Final entropy:\s*([0-9]+\.?[0-9]*)/, stdout)
  if (finalEntropy !== null) {
    cards.push({
      label: 'Final Radiation Entropy',
      value: finalEntropy.toFixed(4),
    })
  }

  const totalComplexity = extractFloat(/Total complexity C\(t\):\s*([0-9]+\.?[0-9]*)/, stdout)
  if (totalComplexity !== null) {
    cards.push({
      label: 'Total Complexity C(t)',
      value: totalComplexity.toFixed(4),
    })
  }

  const commImprovement = extractFloat(/Improvement:\s*([0-9]+\.?[0-9]*)% reduction/, stdout)
  if (commImprovement !== null) {
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
