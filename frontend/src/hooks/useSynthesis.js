import { useRef, useCallback } from 'react'
import useSynthesisStore from '../store/useSynthesisStore'
import useCircuitStore from '../store/useCircuitStore'
import { SYNTHESIS_SEQUENCES, sequenceToGates } from '../utils/quantumStates'

const useSynthesis = () => {
  const intervalRef = useRef(null)

  const {
    startSynthesis,
    addLog,
    updateMetrics,
    completeSynthesis,
  } = useSynthesisStore.getState()

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const runSynthesis = useCallback((selectedState, numQubits) => {
    cleanup()

    const sequence = SYNTHESIS_SEQUENCES[selectedState]
    if (!sequence) return

    startSynthesis()

    // If empty sequence (already ground state), complete instantly
    if (sequence.length === 0) {
      const { completeSynthesis: complete, addLog: log, updateMetrics: update } = useSynthesisStore.getState()
      log({ step: 1, gate: 'I', qubit: 'q0', fidelity: 1.0 })
      update(1.0, 1, 0)
      complete(1.0, [])

      const circuitGates = sequenceToGates(sequence)
      useCircuitStore.getState().setSynthesisResult(circuitGates, 1.0, 0)
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
        store.completeSynthesis(finalStep.fidelity, sequence)

        const circuitGates = sequenceToGates(sequence)
        useCircuitStore.getState().setSynthesisResult(circuitGates, finalStep.fidelity, sequence.length)
        return
      }

      const step = sequence[i]
      store.addLog({
        step: i + 1,
        gate: step.gate,
        qubit: step.qubit,
        fidelity: step.fidelity,
      })
      store.updateMetrics(step.fidelity, baseEpisode + (i * 50), i + 1)
      i++
    }, 700)
  }, [cleanup])

  return { runSynthesis, cleanup }
}

export default useSynthesis
