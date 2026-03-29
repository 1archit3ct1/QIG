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
import './App.css'

type UiTheme = 'runway-tech' | 'utility-street' | 'cyber-minimal'
type TimelineState = 'pending' | 'active' | 'done' | 'error'

type TimelineStep = {
  id: number
  label: string
  state: TimelineState
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

function App() {
  const [selected, setSelected] = useState<SimulationId>('all')
  const [selectedPresetId, setSelectedPresetId] = useState<string>(SCENARIO_PRESETS[0].id)
  const [theme, setTheme] = useState<UiTheme>('runway-tech')
  const [preferLinux, setPreferLinux] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [errorText, setErrorText] = useState('')
  const [timelineSteps, setTimelineSteps] = useState<TimelineStep[]>(() => buildTimelineSteps('all'))

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

  const chartColors = CHART_COLORS[theme]

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
    <main className="layout" data-theme={theme}>
      <header className="hero">
        <p className="eyebrow">QIG Desktop Lab</p>
        <h1>Quantum Simulation Control Panel</h1>
        <p className="subtitle">
          Run geometry, holographic, and complexity simulations from a Tauri desktop frontend.
        </p>
        <div className="theme-switch" aria-label="Theme selector">
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
          {result && (
            <span className={result.success ? 'status ok' : 'status fail'}>
              Exit {result.exit_code}
            </span>
          )}
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
    </main>
  )
}

export default App
