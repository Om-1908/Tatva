import { useEffect, useRef } from 'react'
import { useCircuitStore } from '../store/useCircuitStore'
import { useSimulation } from './useSimulation'

const DEBOUNCE_MS = 350

/**
 * Keeps the simulation result in sync with the circuit automatically,
 * mirroring Tatva Quantum Composer's live-updating Q-sphere instead of
 * requiring an explicit "Run" click.
 *
 * Watches `gates` AND `qubits` — not just gate placement. Bumping the qubit
 * count changes the register size (and therefore the joint statevector)
 * even if no gate touches the new/removed wire, so it has to re-trigger a
 * simulation exactly like adding a gate does.
 *
 * `steps` is deliberately not watched: it only affects how many empty grid
 * columns are rendered, not the physics, so resizing it shouldn't fire a
 * network request.
 *
 * Debounced so a drag, a multi-click on the qubit +/- buttons, or a few
 * rapid edits in a row only fire one request once things settle — the same
 * "wait for a pause" behavior a live composer needs to avoid hammering the
 * backend on every intermediate state.
 */
export function useAutoSimulate() {
  const { gates, qubits, setSimulationResult } = useCircuitStore()
  const { runSimulation, isSimulating, error } = useSimulation()
  const timerRef = useRef(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (gates.length === 0) {
      // Nothing to simulate for an empty circuit — clear any stale result
      // (e.g. left over from before a Reset, or from before the qubit count
      // changed) so the rest of the app falls back to the |0...0⟩ ground
      // state for the *current* qubit count instead of showing an old run.
      setSimulationResult(null)
      return undefined
    }

    timerRef.current = setTimeout(() => {
      runSimulation()
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // gates/qubits are the only two things that change the physics; circuit
    // is derived from gates and doesn't need its own dependency entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gates, qubits])

  return { isSimulating, error }
}

export default useAutoSimulate