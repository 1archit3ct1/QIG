import { useMemo, useState } from 'react'
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

function App() {
  const [selected, setSelected] = useState<SimulationId>('all')
  const [preferLinux, setPreferLinux] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const [errorText, setErrorText] = useState('')

  const selectedItem = useMemo(
    () => SIMULATIONS.find((s) => s.id === selected),
    [selected],
  )

  const parsed = useMemo(() => {
    if (!result) {
      return null
    }
    return parseSimulationOutput(result.simulation, result.stdout)
  }, [result])

  async function runSelectedSimulation() {
    setIsRunning(true)
    setErrorText('')

    try {
      const data = await invoke<SimulationResult>('run_simulation', {
        simulation: selected,
        preferLinux,
      })
      setResult(data)
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <main className="layout">
      <header className="hero">
        <p className="eyebrow">QIG Desktop Lab</p>
        <h1>Quantum Simulation Control Panel</h1>
        <p className="subtitle">
          Run geometry, holographic, and complexity simulations from a Tauri desktop frontend.
        </p>
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
                          <CartesianGrid strokeDasharray="4 4" stroke="#e5c8a6" />
                          <XAxis
                            dataKey="x"
                            tick={{ fill: '#6f472f', fontSize: 12 }}
                            label={{ value: chart.xLabel, position: 'insideBottom', dy: 8 }}
                          />
                          <YAxis
                            tick={{ fill: '#6f472f', fontSize: 12 }}
                            label={{ value: chart.yLabel, angle: -90, dx: -8 }}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid #e2b180',
                              background: '#fff8ef',
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="y"
                            stroke="#b9531f"
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
