import { useRef, useCallback } from 'react'
import useSynthesisStore from '../store/useSynthesisStore'
import { SYNTHESIS_SEQUENCES, sequenceToGates } from '../utils/quantumStates'
import { synthesizeOptimalCircuit } from '../components/composer/core/store/useCircuitStore'

const useSynthesis = () => {
  const intervalRef = useRef(null)

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const runSynthesis = useCallback((selectedState, numQubits) => {
    cleanup()

    const normalizedState = String(selectedState || '').trim().replace(/[\u2212]/g, '-')
    let sequence = SYNTHESIS_SEQUENCES[selectedState] || SYNTHESIS_SEQUENCES[normalizedState]

    // Fallback if preset sequence is not directly defined in quantumStates
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

    // If empty sequence (ground state), complete instantly
    if (sequence.length === 0) {
      const store = useSynthesisStore.getState()
      store.addLog({ step: 1, gate: 'I', qubit: 'q0', fidelity: 1.0 })
      store.updateMetrics(1.0, 1400, 0)
      const circuitGates = sequenceToGates(sequence)
      store.completeSynthesis(1.0, sequence, circuitGates, numQubits)
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
        store.completeSynthesis(finalFidelity, sequence, circuitGates, numQubits)
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

export default useSynthesis
