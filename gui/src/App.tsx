import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { parseSimulationOutput, type SimulationId } from './outputParser'
import MetricSpaceView, { type MetricPoint3D } from './MetricSpaceView'
import './App.css'

type UiTheme = 'runway-tech' | 'utility-street' | 'cyber-minimal' | 'solar-lab' | 'deep-space'
type TimelineState = 'pending' | 'active' | 'done' | 'error'

type TimelineStep = {
  id: number
  label: string
  state: TimelineState
}

type SimulationParameters = {
  qubits: number
  curvature: number
  complexityBudget: number
  energyRate: number
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

type ScenarioPreset = {
  id: string
  title: string
  description: string
  simulation: SimulationId
  preferLinux: boolean
  story: string[]
}

type SimulationResult = {
  simulation: SimulationId
  command: string
  exit_code: number
  success: boolean
  stdout: string
  stderr: string
}

const SIMULATIONS: Array<{ id: SimulationId; label: string; detail: string }> = [
  {
    id: 'all',
    label: 'Run Full Stack',
    detail: 'Execute all 4 demos end-to-end.',
  },
  {
    id: 'geometry',
    label: 'Geometry',
    detail: 'Entanglement-driven metric emergence.',
  },
  {
    id: 'holographic',
    label: 'Holographic',
    detail: 'HaPPY code and MERA reconstruction checks.',
  },
  {
    id: 'complexity_compiler',
    label: 'Complexity + Compiler',
    detail: 'Temporal complexity tracking and scheduler.',
  },
]

const THEMES: Array<{ id: UiTheme; label: string }> = [
  { id: 'runway-tech', label: 'Runway Tech' },
  { id: 'utility-street', label: 'Utility Street' },
  { id: 'cyber-minimal', label: 'Cyber Minimal' },
  { id: 'solar-lab', label: 'Solar Lab' },
  { id: 'deep-space', label: 'Deep Space' },
]

const CHART_COLORS: Record<UiTheme, { grid: string; tick: string; border: string; bg: string; line: string }> = {
  'runway-tech': {
    grid: '#c8d8ff',
    tick: '#5a6b95',
    border: '#bfd0ff',
    bg: '#f7fbff',
    line: '#1f56ff',
  },
  'utility-street': {
    grid: '#d9d4c9',
    tick: '#585248',
    border: '#c8c1b4',
    bg: '#f9f7f2',
    line: '#2f6f54',
  },
  'cyber-minimal': {
    grid: '#30384e',
    tick: '#a5b1d9',
    border: '#44527c',
    bg: '#161d2f',
    line: '#35d1ff',
  },
  'solar-lab': {
    grid: '#e8d0a0',
    tick: '#8b6030',
    border: '#dfc090',
    bg: '#fdf5e4',
    line: '#c47a00',
  },
  'deep-space': {
    grid: '#3d2e60',
    tick: '#c4a8f0',
    border: '#5a3e8a',
    bg: '#1a1030',
    line: '#b07aff',
  },
}

const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'spacetime-origin',
    title: 'Spacetime Origin Arc',
    description: 'Start from geometry emergence and expand to full stack.',
    simulation: 'all',
    preferLinux: true,
    story: [
      'Start with entanglement geometry foundations.',
      'Validate holographic reconstruction dynamics.',
      'Finish with complexity and compiler efficiency.',
    ],
  },
  {
    id: 'ads-lab',
    title: 'AdS Reconstruction Lab',
    description: 'Focus purely on boundary-to-bulk reconstruction quality.',
    simulation: 'holographic',
    preferLinux: true,
    story: [
      'Probe HaPPY code assumptions and wedge coverage.',
      'Compare RT consistency under the toy model.',
      'Use outputs to tune reconstruction confidence.',
    ],
  },
  {
    id: 'compiler-drip',
    title: 'Compiler Drip Test',
    description: 'Prioritize scheduler + hyperbolic embedding performance.',
    simulation: 'complexity_compiler',
    preferLinux: true,
    story: [
      'Track temporal complexity growth profile.',
      'Inspect hyperbolic vs Euclidean communication gap.',
      'Use trajectory metrics to optimize task shape.',
    ],
  },
  {
    id: 'geometry-pop',
    title: 'Geometry Pulse',
    description: 'Fast loop on metric emergence and page-curve behavior.',
    simulation: 'geometry',
    preferLinux: false,
    story: [
      'Map MI-driven distance structure quickly.',
      'Observe area-law and entropy signatures.',
      'Capture chart trends for visual storytelling.',
    ],
  },
]

const TIMELINE_LABELS: Record<SimulationId, string[]> = {
  all: [
    'Boot simulation context',
    'Geometry pass',
    'Holographic pass',
    'Complexity/compiler pass',
    'Aggregate outputs',
  ],
  geometry: [
    'Initialize QIG graph',
    'Compute entanglement metric',
    'Run area law + page curve',
    'Finalize geometry report',
  ],
  holographic: [
    'Initialize HaPPY code',
    'Run reconstruction checks',
    'Run MERA verification',
    'Finalize holographic report',
  ],
  complexity_compiler: [
    'Track complexity growth',
    'Embed hyperbolic task graph',
    'Run scheduler + compare costs',
    'Finalize compiler report',
  ],
}

function buildTimelineSteps(simulation: SimulationId): TimelineStep[] {
  return TIMELINE_LABELS[simulation].map((label, index) => ({
    id: index,
    label,
    state: 'pending',
  }))
}

function deriveTimelineFromResult(
  simulation: SimulationId,
  stdout: string,
  success: boolean,
  fallback: TimelineStep[],
): TimelineStep[] {
  if (!success) {
    const activeIndex = Math.max(
      0,
      fallback.findIndex((step) => step.state === 'active'),
    )
    return fallback.map((step, idx) => {
      if (idx < activeIndex) {
        return { ...step, state: 'done' }
      }
      if (idx === activeIndex) {
        return { ...step, state: 'error' }
      }
      return { ...step, state: 'pending' }
    })
  }

  const output = stdout.toLowerCase()
  const markersBySimulation: Record<SimulationId, string[]> = {
    all: ['demo 1', 'demo 2', 'demo 3', 'all demos complete'],
    geometry: ['phase 1', 'phase 2', 'phase 3', 'demo 1 complete'],
    holographic: ['part a', 'bulk reconstruction', 'part b', 'demo 2 complete'],
    complexity_compiler: ['demo 3', 'step 1', 'step 3', 'demo 4 complete'],
  }

  const hits = markersBySimulation[simulation].filter((marker) => output.includes(marker)).length
  const completionCount = hits === 0 ? TIMELINE_LABELS[simulation].length : Math.min(TIMELINE_LABELS[simulation].length, hits + 1)

  return buildTimelineSteps(simulation).map((step, idx) => ({
    ...step,
    state: idx < completionCount ? 'done' : 'pending',
  }))
}

function analyzeReliability(result: SimulationResult | null): {
  issues: Array<{ title: string; guidance: string[] }>
  envSummary: Array<{ label: string; value: string }>
} {
  const envSummary: Array<{ label: string; value: string }> = [
    { label: 'Simulation', value: result?.simulation ?? 'none' },
    { label: 'Exit Code', value: result ? String(result.exit_code) : '—' },
    { label: 'Status', value: result ? (result.success ? 'Passed' : 'Failed') : 'Not Run' },
  ]

  if (!result) {
    return { issues: [], envSummary }
  }

  const stderr = (result.stderr ?? '').toLowerCase()
  const stdout = (result.stdout ?? '').toLowerCase()
  const issues: Array<{ title: string; guidance: string[] }> = []

  if (stderr.includes('no such file') || stderr.includes('filenotfounderror')) {
    issues.push({
      title: 'Path or File Error',
      guidance: [
        'Verify the Python virtual environment is activated (.venv-linux or .venv).',
        'Check that simulation script paths are correct inside the project.',
        'If using WSL, confirm the project folder is accessible at /mnt/d/…',
      ],
    })
  }

  if (stderr.includes('modulenotfounderror') || stderr.includes('no module named')) {
    issues.push({
      title: 'Missing Python Module',
      guidance: [
        'Run: pip install -r requirements.txt inside your venv.',
        'Ensure the venv is activated before launching.',
        'On WSL: activate with source .venv-linux/bin/activate.',
      ],
    })
  }

  if (stderr.includes('wsl') && (stderr.includes('no such file') || stderr.includes('error'))) {
    issues.push({
      title: 'WSL Bridge Issue',
      guidance: [
        'Make sure WSL 2 is installed and a Linux distro is available.',
        'Try disabling Prefer Linux mode to use the native Python fallback.',
        'Verify the project path is accessible without Windows extended-path prefixes.',
      ],
    })
  }

  if (!result.success && issues.length === 0) {
    issues.push({
      title: 'Simulation Exit Failure',
      guidance: [
        `Process exited with code ${result.exit_code} — review stderr for details.`,
        'Ensure all QIG modules (core, demos, compiler) are present and importable.',
        'Try running the simulation script directly in a terminal to isolate the issue.',
      ],
    })
  }

  if (result.success && (stdout.includes('warning') || stdout.includes('warn'))) {
    issues.push({
      title: 'Non-Fatal Warnings Detected',
      guidance: [
        'Check stdout for warning messages that may indicate degraded accuracy.',
        'Consider adjusting simulation parameters if results look unexpected.',
      ],
    })
  }

  return { issues, envSummary }
}

function App() {
  const [selected, setSelected] = useState<SimulationId>('all')
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SCENARIO_PRESETS[0].id)
  const [theme, setTheme] = useState<UiTheme>('runway-tech')
  const [preferLinux, setPreferLinux] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [baselineResult, setBaselineResult] = useState<SimulationResult | null>(null)
  const [errorText, setErrorText] = useState('')
  const [parameters, setParameters] = useState<SimulationParameters>({
    qubits: 8,
    curvature: -1,
    complexityBudget: 200,
    energyRate: 100,
  })
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>(() => buildTimelineSteps('all'))
  const [presentationMode, setPresentationMode] = useState(false)

  const timelineTicker = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedItem = useMemo(
    () => SIMULATIONS.find((s) => s.id === selected),
    [selected],
  )

  const activePreset = useMemo(
    () => SCENARIO_PRESETS.find((preset) => preset.id === selectedPresetId) ?? SCENARIO_PRESETS[0],
    [selectedPresetId],
  )

  const parsed = useMemo(() => {
    if (!result) {
      return null
    }
    return parseSimulationOutput(result.simulation, result.stdout)
  }, [result])

  const baselineParsed = useMemo(() => {
    if (!baselineResult) {
      return null
    }
    return parseSimulationOutput(baselineResult.simulation, baselineResult.stdout)
  }, [baselineResult])

  const chartColors = CHART_COLORS[theme]

  const metricDeltas = useMemo(() => {
    if (!parsed || !baselineParsed) {
      return [] as Array<{ label: string; baseline: number; current: number; delta: number }>
    }

    const baselineMap = new Map<string, number>()
    baselineParsed.cards.forEach((card) => {
      const n = Number.parseFloat(card.value.replace(/[^0-9.-]/g, ''))
      if (Number.isFinite(n)) {
        baselineMap.set(card.label, n)
      }
    })

    return parsed.cards
      .map((card) => {
        const current = Number.parseFloat(card.value.replace(/[^0-9.-]/g, ''))
        const baseline = baselineMap.get(card.label)
        if (!Number.isFinite(current) || baseline === undefined) {
          return null
        }
        return {
          label: card.label,
          baseline,
          current,
          delta: current - baseline,
        }
      })
      .filter((v): v is { label: string; baseline: number; current: number; delta: number } => v !== null)
      .slice(0, 8)
  }, [parsed, baselineParsed])

  function exportReportJson() {
    if (!result || !parsed) {
      return
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      simulation: result.simulation,
      command: result.command,
      exitCode: result.exit_code,
      success: result.success,
      metrics: parsed.cards,
      charts: parsed.charts,
      baseline: baselineResult
        ? {
            simulation: baselineResult.simulation,
            exitCode: baselineResult.exit_code,
            success: baselineResult.success,
            metricDeltas,
            parameters,
          }
        : null,
      parameters,
    }

    downloadTextFile(
      `qig-report-${result.simulation}-${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  function exportChartCsv() {
    if (!parsed || parsed.charts.length === 0) {
      return
    }

    const rows: string[] = ['chart_key,chart_title,x,y']
    parsed.charts.forEach((chart) => {
      chart.points.forEach((point) => {
        rows.push(`${chart.key},"${chart.title.replace(/"/g, '""')}",${point.x},${point.y}`)
      })
    })

    downloadTextFile(
      `qig-chart-data-${Date.now()}.csv`,
      rows.join('\n'),
      'text/csv;charset=utf-8',
    )
  }

  const metricPoints = useMemo<MetricPoint3D[]>(() => {
    if (!parsed) {
      return []
    }

    const fromCharts: MetricPoint3D[] = []
    parsed.charts.slice(0, 2).forEach((chart, chartIndex) => {
      chart.points.slice(0, 42).forEach((point, pointIndex) => {
        const normalizedX = chart.points.length > 1 ? pointIndex / (chart.points.length - 1) : 0
        const normalizedY = Number.isFinite(point.y) ? point.y : 0
        const yScaled = Math.tanh(normalizedY / 6)
        const zWave = Math.sin(normalizedX * Math.PI * 2 + chartIndex * 0.8) * 0.65

        fromCharts.push({
          id: `chart-${chartIndex}-${pointIndex}`,
          x: normalizedX * 2 - 1,
          y: yScaled,
          z: zWave,
          label: `${chart.title} #${pointIndex}`,
        })
      })
    })

    const fromCards: MetricPoint3D[] = parsed.cards.slice(0, 18).map((card, index) => {
      const numeric = Number.parseFloat(card.value.replace(/[^0-9.-]/g, ''))
      const base = Number.isFinite(numeric) ? numeric : index + 1
      return {
        id: `card-${index}`,
        x: Math.sin(index * 0.68),
        y: Math.cos(index * 0.52) * 0.78,
        z: Math.tanh(base / 12) * (index % 2 === 0 ? 1 : -1),
        label: card.label,
      }
    })

    return [...fromCharts, ...fromCards].slice(0, 84)
  }, [parsed])

  const reliabilityData = useMemo(() => analyzeReliability(result), [result])

  function applyPreset(preset: ScenarioPreset) {
    setSelectedPresetId(preset.id)
    setSelected(preset.simulation)
    setPreferLinux(preset.preferLinux)
    setTimelineSteps(buildTimelineSteps(preset.simulation))
  }

  useEffect(() => {
    setTimelineSteps(buildTimelineSteps(selected))
  }, [selected])

  useEffect(() => {
    return () => {
      if (timelineTicker.current) {
        clearInterval(timelineTicker.current)
      }
    }
  }, [])

  async function runSelectedSimulation() {
    if (timelineTicker.current) {
      clearInterval(timelineTicker.current)
      timelineTicker.current = null
    }

    const baseSteps = buildTimelineSteps(selected)
    let activeIndex = 0
    setTimelineSteps(
      baseSteps.map((step, idx) => ({
        ...step,
        state: idx === 0 ? 'active' : 'pending',
      })),
    )

    timelineTicker.current = setInterval(() => {
      activeIndex = Math.min(activeIndex + 1, baseSteps.length - 1)
      setTimelineSteps(
        baseSteps.map((step, idx) => {
          if (idx < activeIndex) {
            return { ...step, state: 'done' }
          }
          if (idx === activeIndex) {
            return { ...step, state: 'active' }
          }
          return { ...step, state: 'pending' }
        }),
      )
    }, 1200)

    setIsRunning(true)
    setErrorText('')

    try {
      const data = await invoke<SimulationResult>('run_simulation', {
        simulation: selected,
        preferLinux,
        parameters,
      })
      setResult(data)
      setTimelineSteps((current) => deriveTimelineFromResult(selected, data.stdout, data.success, current))
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err))
      setTimelineSteps((current) => deriveTimelineFromResult(selected, '', false, current))
    } finally {
      if (timelineTicker.current) {
        clearInterval(timelineTicker.current)
        timelineTicker.current = null
      }
      setIsRunning(false)
    }
  }

  return (
    <main
      className={`layout${isRunning ? ' running' : ''}${result ? ' has-result' : ''}${presentationMode ? ' presentation' : ''}`}
      data-theme={theme}
    >
      <header className="hero">
        <p className="eyebrow">QIG Desktop Lab</p>
        <h1>Quantum Simulation Control Panel</h1>
        <p className="subtitle">
          Run geometry, holographic, and complexity simulations from a Tauri desktop frontend.
        </p>
        <div className="theme-switch" aria-label="Theme and view controls">
          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={theme === item.id ? 'theme-chip active' : 'theme-chip'}
              onClick={() => setTheme(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className={presentationMode ? 'theme-chip active' : 'theme-chip'}
            style={{ marginLeft: 'auto' }}
            onClick={() => setPresentationMode((v) => !v)}
          >
            Presentation
          </button>
        </div>
      </header>

      <section className="panel config-panel">
        <div className="label-row">
          <h2>Simulation</h2>
          <span className="hint">{selectedItem?.detail}</span>
        </div>

        <div className="sim-grid">
          {SIMULATIONS.map((sim) => (
            <button
              key={sim.id}
              className={selected === sim.id ? 'sim-button active' : 'sim-button'}
              onClick={() => setSelected(sim.id)}
              type="button"
            >
              <span>{sim.label}</span>
              <small>{sim.detail}</small>
            </button>
          ))}
        </div>

        <div className="preset-block">
          <div className="label-row compact">
            <h2>Scenario Presets</h2>
            <span className="hint">Curated run styles</span>
          </div>

          <div className="preset-grid">
            {SCENARIO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={preset.id === selectedPresetId ? 'preset-chip active' : 'preset-chip'}
                onClick={() => applyPreset(preset)}
              >
                <span>{preset.title}</span>
                <small>{preset.description}</small>
              </button>
            ))}
          </div>

          <article className="story-card">
            <h3>Story Mode</h3>
            <p>{activePreset.description}</p>
            <ul>
              {activePreset.story.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </article>
        </div>

        <label className="toggle-row" htmlFor="prefer-linux">
          <input
            id="prefer-linux"
            type="checkbox"
            checked={preferLinux}
            onChange={(e) => setPreferLinux(e.target.checked)}
          />
          Prefer Linux simulation path (WSL + .venv-linux)
        </label>

        <div className="parameter-studio">
          <div className="label-row compact">
            <h2>Parameter Studio</h2>
            <span className="hint">Run tuning controls</span>
          </div>

          <div className="param-grid">
            <label>
              <span>Qubits</span>
              <input
                type="number"
                min={2}
                max={32}
                value={parameters.qubits}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    qubits: Number.parseInt(e.target.value || '0', 10) || 8,
                  }))
                }
              />
            </label>

            <label>
              <span>Curvature</span>
              <input
                type="number"
                step={0.1}
                min={-10}
                max={-0.1}
                value={parameters.curvature}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    curvature: Number.parseFloat(e.target.value || '-1') || -1,
                  }))
                }
              />
            </label>

            <label>
              <span>Complexity Budget</span>
              <input
                type="number"
                min={10}
                step={10}
                value={parameters.complexityBudget}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    complexityBudget: Number.parseFloat(e.target.value || '200') || 200,
                  }))
                }
              />
            </label>

            <label>
              <span>Energy Rate</span>
              <input
                type="number"
                min={1}
                step={1}
                value={parameters.energyRate}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    energyRate: Number.parseFloat(e.target.value || '100') || 100,
                  }))
                }
              />
            </label>
          </div>
        </div>

        <button
          className="run-button"
          type="button"
          disabled={isRunning}
          onClick={runSelectedSimulation}
        >
          {isRunning ? 'Running Simulation...' : 'Run Simulation'}
        </button>

        {errorText && (
          <div className="alert error">
            <strong>Launch Error:</strong>
            <p>{errorText}</p>
          </div>
        )}
      </section>

      <section className="panel timeline-panel">
        <div className="label-row">
          <h2>Run Timeline</h2>
          <span className="hint">Live phase progression for {selected.replace('_', ' ')}</span>
        </div>

        <ol className="timeline">
          {timelineSteps.map((step) => (
            <li className={`timeline-step ${step.state}`} key={step.id}>
              <span className="timeline-dot" aria-hidden="true" />
              <span className="timeline-text">{step.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="panel output-panel">
        <div className="label-row">
          <h2>Execution Output</h2>
          <div className="output-actions">
            {result && (
              <span className={result.success ? 'status ok' : 'status fail'}>
                Exit {result.exit_code}
              </span>
            )}
            {result && (
              <button
                type="button"
                className="mini-button"
                onClick={() => setBaselineResult(result)}
              >
                Set As Baseline
              </button>
            )}
          </div>
        </div>

        <div className="meta-grid">
          <div>
            <h3>Target</h3>
            <p>{result?.simulation ?? 'none'}</p>
          </div>
          <div>
            <h3>Command</h3>
            <p className="command-text">{result?.command ?? 'not run yet'}</p>
          </div>
        </div>

        <div className="log-grid">
          <article>
            <h3>stdout</h3>
            <pre>{result?.stdout || 'No output yet.'}</pre>
          </article>
          <article>
            <h3>stderr</h3>
            <pre>{result?.stderr || 'No errors reported.'}</pre>
          </article>
        </div>
      </section>

      <section className="panel parsed-panel">
        <div className="label-row">
          <h2>Structured Metrics</h2>
          <span className="hint">Parsed from simulation stdout</span>
        </div>

        {!parsed && <p className="hint">Run a simulation to generate parsed metrics.</p>}

        {parsed && (
          <>
            <div className="metrics-grid">
              {parsed.cards.length > 0 ? (
                parsed.cards.map((card) => (
                  <article className="metric-card" key={card.label}>
                    <h3>{card.label}</h3>
                    <p>{card.value}</p>
                  </article>
                ))
              ) : (
                <p className="hint">No scalar metrics detected for this output.</p>
              )}
            </div>

            <div className="charts-grid">
              {parsed.charts.length > 0 ? (
                parsed.charts.map((chart) => (
                  <article className="chart-card" key={chart.key}>
                    <h3>{chart.title}</h3>
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chart.points} margin={{ top: 10, right: 16, left: 8, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke={chartColors.grid} />
                          <XAxis
                            dataKey="x"
                            tick={{ fill: chartColors.tick, fontSize: 12 }}
                            label={{ value: chart.xLabel, position: 'insideBottom', dy: 8 }}
                          />
                          <YAxis
                            tick={{ fill: chartColors.tick, fontSize: 12 }}
                            label={{ value: chart.yLabel, angle: -90, dx: -8 }}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10,
                              border: `1px solid ${chartColors.border}`,
                              background: chartColors.bg,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="y"
                            stroke={chartColors.line}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            isAnimationActive
                            animationDuration={1100}
                            animationEasing="ease-out"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                ))
              ) : (
                <p className="hint">No timeseries detected for charting.</p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="panel metric3d-panel">
        <div className="label-row">
          <h2>3D Metric Space</h2>
          <span className="hint">Drag to rotate, zoom to inspect geometric structure</span>
        </div>

        {metricPoints.length > 0 ? (
          <MetricSpaceView points={metricPoints} />
        ) : (
          <p className="hint">Run a simulation to populate 3D metric points.</p>
        )}
      </section>

      <section className="panel compare-panel">
        <div className="label-row">
          <h2>Comparative Run Mode</h2>
          <span className="hint">Compare current run against baseline snapshots</span>
        </div>

        {!baselineResult && (
          <p className="hint">Run a simulation, then click Set As Baseline to begin comparison.</p>
        )}

        {baselineResult && (
          <>
            <div className="compare-head">
              <article>
                <h3>Baseline</h3>
                <p>{baselineResult.simulation}</p>
                <span className={baselineResult.success ? 'status ok' : 'status fail'}>
                  Exit {baselineResult.exit_code}
                </span>
              </article>
              <article>
                <h3>Current</h3>
                <p>{result?.simulation ?? 'no current run'}</p>
                {result ? (
                  <span className={result.success ? 'status ok' : 'status fail'}>
                    Exit {result.exit_code}
                  </span>
                ) : (
                  <span className="status">Pending</span>
                )}
              </article>
            </div>

            <div className="delta-grid">
              {metricDeltas.length > 0 ? (
                metricDeltas.map((deltaItem) => (
                  <article className="delta-card" key={deltaItem.label}>
                    <h3>{deltaItem.label}</h3>
                    <p>
                      {deltaItem.baseline.toFixed(3)} → {deltaItem.current.toFixed(3)}
                    </p>
                    <span className={deltaItem.delta >= 0 ? 'delta up' : 'delta down'}>
                      {deltaItem.delta >= 0 ? '+' : ''}
                      {deltaItem.delta.toFixed(3)}
                    </span>
                  </article>
                ))
              ) : (
                <p className="hint">Run a second compatible simulation to compute metric deltas.</p>
              )}
            </div>
          </>
        )}
      </section>

      <section className="panel report-panel">
        <div className="label-row">
          <h2>Export Reports</h2>
          <span className="hint">Download shareable run artifacts</span>
        </div>

        <div className="report-actions">
          <button
            type="button"
            className="mini-button"
            onClick={exportReportJson}
            disabled={!result || !parsed}
          >
            Export JSON Report
          </button>
          <button
            type="button"
            className="mini-button"
            onClick={exportChartCsv}
            disabled={!parsed || parsed.charts.length === 0}
          >
            Export Charts CSV
          </button>
        </div>
      </section>

      <section className="panel reliability-panel">
        <div className="label-row">
          <h2>Reliability &amp; Diagnostics</h2>
          <span className="hint">Environment health and guided recovery</span>
        </div>

        <div className="env-grid">
          {reliabilityData.envSummary.map((item) => (
            <div className="env-item" key={item.label}>
              <h3>{item.label}</h3>
              <p>{item.value}</p>
            </div>
          ))}
          <div className="env-item">
            <h3>Mode</h3>
            <p>{preferLinux ? 'WSL / Linux' : 'Native'}</p>
          </div>
          <div className="env-item">
            <h3>Qubits</h3>
            <p>{parameters.qubits}</p>
          </div>
          <div className="env-item">
            <h3>Curvature</h3>
            <p>{parameters.curvature}</p>
          </div>
        </div>

        {reliabilityData.issues.length === 0 && result?.success && (
          <p className="hint">No issues detected. Last run completed successfully.</p>
        )}
        {reliabilityData.issues.length === 0 && !result && (
          <p className="hint">Run a simulation to surface diagnostics.</p>
        )}

        {reliabilityData.issues.map((issue) => (
          <article className="guidance-card" key={issue.title}>
            <h3>{issue.title}</h3>
            <ul>
              {issue.guidance.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </article>
        ))}

        <button
          type="button"
          className="mini-button"
          onClick={runSelectedSimulation}
          disabled={isRunning}
        >
          {isRunning ? 'Running…' : 'Retry Simulation'}
        </button>
      </section>
    </main>
  )
}

export default App
