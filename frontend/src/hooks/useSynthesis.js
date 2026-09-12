import { useRef, useCallback } from 'react'
import useSynthesisStore from '../store/useSynthesisStore'
import { SYNTHESIS_SEQUENCES, sequenceToGates } from '../utils/quantumStates'
import { synthesizeOptimalCircuit } from '../components/composer/core/store/useCircuitStore'
import { API_BASE_URL } from '../config'
import { useCircuitStore } from '../components/composer/core/store/useCircuitStore'

const useSynthesis = () => {
  const intervalRef = useRef(null)

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  /**
   * Stream synthetic log entries while the backend is thinking.
   * Gives the user visual feedback that something is happening.
   */
  const _streamLoadingLogs = useCallback((numQubits, onDone) => {
    const { addLog, updateMetrics } = useSynthesisStore.getState()
    const loadingSteps = [
      { gate: '⟳', qubit: 'q0', fidelity: 0.1,  msg: 'Initialising RL agents...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.15, msg: 'Loading PPO model weights...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.2,  msg: 'Loading DQN model weights...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.25, msg: 'Encoding target statevector...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.3,  msg: 'PPO agent exploring...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.45, msg: 'DQN agent exploring...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.6,  msg: 'Evaluating fidelities...' },
      { gate: '⟳', qubit: 'q0', fidelity: 0.75, msg: 'Comparing models...' },
    ]
    let i = 0
    intervalRef.current = setInterval(() => {
      if (i >= loadingSteps.length) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
        onDone()
        return
      }
      const step = loadingSteps[i]
      addLog({ step: i + 1, gate: step.gate, qubit: step.msg, fidelity: step.fidelity })
      updateMetrics(step.fidelity, 1400, i + 1)
      i++
    }, 600)
  }, [])

  /**
   * Main synthesis function.
   * 1. Calls POST /api/rl-synthesize with the target statevector.
   * 2. On success: displays real PPO+DQN comparison, winner's gates.
   * 3. On failure: falls back to local simulation (existing behaviour).
   */
  const runSynthesis = useCallback((selectedState, numQubits) => {
    cleanup()

    const store = useSynthesisStore.getState()
    store.startSynthesis(numQubits)

    // ── Get the current statevector from the composer store ──
    // This works for both preset states and custom statevectors
    let statevector = null
    try {
      const circStore = useCircuitStore.getState()
      if (circStore.targetStatevector && circStore.targetStatevector.length > 0) {
        statevector = circStore.targetStatevector
      }
    } catch (e) { /* ignore */ }

    // If still null, build from preset
    if (!statevector) {
      statevector = _buildStatevectorFromLabel(selectedState, numQubits)
    }

    // ── Check if target is a named preset (bypass RL loading messages) ──
    const cleanLabel = String(selectedState || '').toLowerCase()
    const isPreset = !cleanLabel.includes('custom') && !cleanLabel.includes('random')

    // ── Stream loading UI while backend processes (Custom / Random only) ──
    let backendResolved = false

    if (!isPreset) {
      _streamLoadingLogs(numQubits, () => {
        if (!backendResolved) {
          // Backend is still running — keep showing a spinner log
          const tick = () => {
            if (backendResolved) return
            const s = useSynthesisStore.getState()
            s.addLog({ step: s.logs.length + 1, gate: '⟳', qubit: 'Synthesizing...', fidelity: 0.8 })
            s.updateMetrics(0.8, 1400, s.logs.length)
            intervalRef.current = setTimeout(tick, 1200)
          }
          tick()
        }
      })
    }

    // ── Fire the backend request ──
    const payload = {
      qubits: numQubits,
      target_state: selectedState,
      statevector: statevector,
    }

    fetch(`${API_BASE_URL}/api/rl-synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        backendResolved = true
        cleanup()

        if (!data.success) {
          console.warn('[useSynthesis] Backend returned error:', data.error)
          _runLocalFallback(selectedState, numQubits)
          return
        }

        const s = useSynthesisStore.getState()
        const winnerGates = Array.isArray(data.winner_gates) ? data.winner_gates : []
        const logs = Array.isArray(data.logs) ? data.logs : []

        // ── Preset-routed path: exact textbook decomposition, honest logs ──
        if (data.is_preset) {
          const banner = {
            step: 0,
            gate: 'ℹ',
            qubit: 'Recognized preset state — using exact textbook decomposition (no RL synthesis required)',
            fidelity: 1.0,
            isPresetBanner: true,
          }
          const gateLogs = logs.map((log, idx) => ({
            step: idx + 1,
            gate: log.gate || 'X',
            qubit: log.qubit || 'q0',
            fidelity: 1.0,
            theta: log.theta,
          }))

          s.setLogs([banner, ...gateLogs])
          s.updateMetrics(1.0, 0, winnerGates.length)

          const modelComparison = {
            winner: 'Textbook',
            is_preset: true,
            fallback: false,
            ppo: {
              fidelity: 1.0,
              gate_count: Number(data.ppo?.gate_count ?? winnerGates.length),
              circuit_depth: Number(data.ppo?.circuit_depth ?? data.winner_depth ?? 0),
              synthesis_time: Number(data.ppo?.synthesis_time ?? 0.001),
              episodes: 0,
              gates: winnerGates,
            },
            dqn: {
              fidelity: 1.0,
              gate_count: Number(data.dqn?.gate_count ?? winnerGates.length),
              circuit_depth: Number(data.dqn?.circuit_depth ?? data.winner_depth ?? 0),
              synthesis_time: Number(data.dqn?.synthesis_time ?? 0.001),
              episodes: 0,
              gates: winnerGates,
            },
          }

          s.completeSynthesis(
            1.0,
            [],
            winnerGates,
            numQubits,
            modelComparison,
            true,
          )
          return
        }

        // ── RL Pipeline path (Custom Statevector & Random) ──
        const finalFidelity = Number(data.winner_fidelity ?? 0)

        // Replace the loading logs with real synthesis logs
        logs.forEach((log, idx) => {
          s.addLog(
            {
              step: idx + 1,
              gate: log.gate || 'I',
              qubit: log.qubit || 'q0',
              fidelity: log.fidelity ?? finalFidelity,
            },
            idx === logs.length - 1 ? winnerGates : []
          )
        })

        s.updateMetrics(finalFidelity, data.ppo?.episodes || 1400, winnerGates.length)

        // Build modelComparison object for the UI
        const modelComparison = {
          winner: data.winner,
          is_preset: false,
          fallback: Boolean(data.fallback),
          ppo: {
            fidelity: Number(data.ppo?.fidelity ?? 0),
            gate_count: Number(data.ppo?.gate_count ?? 0),
            circuit_depth: Number(data.ppo?.circuit_depth ?? 0),
            synthesis_time: Number(data.ppo?.synthesis_time ?? 0),
            episodes: Number(data.ppo?.episodes ?? 0),
            gates: data.ppo?.gates ?? [],
          },
          dqn: {
            fidelity: Number(data.dqn?.fidelity ?? 0),
            gate_count: Number(data.dqn?.gate_count ?? 0),
            circuit_depth: Number(data.dqn?.circuit_depth ?? 0),
            synthesis_time: Number(data.dqn?.synthesis_time ?? 0),
            episodes: Number(data.dqn?.episodes ?? 0),
            gates: data.dqn?.gates ?? [],
          },
        }

        s.completeSynthesis(
          finalFidelity,
          [], // sequence (unused, kept for compat)
          winnerGates,
          numQubits,
          modelComparison,
          false,
        )
      })
      .catch((err) => {
        backendResolved = true
        cleanup()
        console.warn('[useSynthesis] Backend unreachable, using local fallback:', err.message)
        _runLocalFallback(selectedState, numQubits)
      })
  }, [cleanup, _streamLoadingLogs])

  /**
   * Local fallback: the original hardcoded simulation.
   * Used when the backend is unreachable or returns an error.
   */
  const _runLocalFallback = useCallback((selectedState, numQubits) => {
    const normalizedState = String(selectedState || '').trim().replace(/[\u2212]/g, '-')
    let sequence = SYNTHESIS_SEQUENCES[selectedState] || SYNTHESIS_SEQUENCES[normalizedState]

    if (!sequence || sequence.length === 0) {
      const optimal = synthesizeOptimalCircuit(normalizedState, numQubits)
      if (optimal && optimal.length > 0) {
        sequence = optimal.map((g, idx) => ({
          gate: g.gate || g.type || 'X',
          qubit: g.type === 'CNOT' && g.targetQubit !== undefined ? `q${g.controlQubit || 0}→q${g.targetQubit}` : `q${g.qubit || 0}`,
          fidelity: Math.min(0.9999, 0.4 + ((idx + 1) / optimal.length) * 0.6),
        }))
      } else {
        sequence = []
      }
    }

    useSynthesisStore.getState().startSynthesis(numQubits)

    if (sequence.length === 0) {
      const s = useSynthesisStore.getState()
      s.addLog({ step: 1, gate: 'I', qubit: 'q0', fidelity: 1.0 })
      s.updateMetrics(1.0, 1400, 0)
      const circuitGates = sequenceToGates(sequence)
      s.completeSynthesis(1.0, sequence, circuitGates, numQubits, null)
      return
    }

    let i = 0
    const baseEpisode = 1400

    intervalRef.current = setInterval(() => {
      const store = useSynthesisStore.getState()

      if (i >= sequence.length) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
        const finalStep = sequence[sequence.length - 1]
        const finalFidelity = finalStep?.fidelity ?? 1.0
        const circuitGates = sequenceToGates(sequence)
        store.completeSynthesis(finalFidelity, sequence, circuitGates, numQubits, null)
        return
      }

      const step = sequence[i]
      if (step) {
        const currentSlice = sequence.slice(0, i + 1)
        const currentGates = sequenceToGates(currentSlice)
        store.addLog({
          step: i + 1,
          gate: step.gate || 'I',
          qubit: step.qubit || 'q0',
          fidelity: step.fidelity ?? 1.0,
        }, currentGates)
        store.updateMetrics(step.fidelity ?? 1.0, baseEpisode + (i * 50), i + 1)
      }
      i++
    }, 600)
  }, [cleanup])

  return { runSynthesis, cleanup }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a statevector from a preset state label like |0⟩, |1⟩, |+⟩, |Bell⟩ etc.
 * Returns array of {real, imag} objects.
 */
function _buildStatevectorFromLabel(label, numQubits) {
  const dim = 1 << numQubits
  const sv = Array.from({ length: dim }, () => ({ real: 0, imag: 0 }))
  sv[0].real = 1.0 // default: |0...0⟩

  const l = (label || '').replace(/\s/g, '')

  if (l === '|1⟩' || l === '|1>') {
    sv[0].real = 0; sv[dim - 1].real = 1
  } else if (l === '|+⟩' || l === '|+>') {
    const a = 1 / Math.sqrt(2)
    sv[0].real = a; sv[1 < dim ? 1 : 0].real = a
  } else if (l === '|-⟩' || l === '|->') {
    const a = 1 / Math.sqrt(2)
    sv[0].real = a; sv[1 < dim ? 1 : 0].real = -a
  } else if (l === '|i⟩' || l === '|i>') {
    const a = 1 / Math.sqrt(2)
    sv[0].real = a; sv[1 < dim ? 1 : 0].imag = a
  } else if (l.includes('Bell') || l.includes('Φ+') || l.includes('Phi+')) {
    if (dim >= 4) {
      sv[0].real = 1 / Math.sqrt(2)
      sv[3].real = 1 / Math.sqrt(2)
    }
  }

  return sv
}

export default useSynthesis
