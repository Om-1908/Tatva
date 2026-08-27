import { useCallback, useRef, useState } from 'react'
import axios from 'axios'
import { useCircuitStore } from '../store/useCircuitStore'
import { API_ENDPOINTS } from '../config/api'
import { isBlockType } from '../config/constants'
import { simulateLocalCircuit } from '../utils/quantum'

/**
 * Shared simulation runner. Converts the visual circuit grid into the backend
 * gate format and posts to /simulate. Used by the circuit editor header and the
 * Tools menu so the logic lives in exactly one place.
 */
export function useSimulation() {
  const { qubits, circuit, gates, shots, setSimulationResult, setIsSimulating, isSimulating } =
    useCircuitStore()
  const [error, setError] = useState(null)
  const requestIdRef = useRef(0)

  // Convert the [qubit][step] grid into the flat gate list the API expects.
  const circuitToGates = useCallback(() => {
    const apiGates = []
    circuit.forEach((qubitRow, qubitIdx) => {
      qubitRow.forEach((gate, stepIdx) => {
        if (!gate || gate.type === 'CNOT_TARGET') return
        apiGates.push({
          type: gate.type,
          target: qubitIdx,
          step: stepIdx,
          ...(gate.type === 'CNOT' && {
            control: gate.controlQubit !== undefined ? gate.controlQubit : 0,
          }),
          ...(gate.type === 'CCNOT' && {
            control: gate.controlQubit,
            control2: gate.controlQubit2,
          }),
          ...(gate.type === 'SWAP' && { swap_with: gate.swapQubit }),
          ...(isBlockType(gate.type) &&
            Array.isArray(gate.targets) && { targets: gate.targets }),
          ...(gate.theta !== undefined && { theta: gate.theta }),
        })
      })
    })
    return apiGates
  }, [circuit])

  const runSimulation = useCallback(async () => {
    if (gates.length === 0) {
      setError('Add at least one gate to the circuit first')
      setTimeout(() => setError(null), 3000)
      return
    }

    const myRequestId = ++requestIdRef.current
    setIsSimulating(true)
    setError(null)

    try {
      const response = await axios.post(API_ENDPOINTS.SIMULATE, {
        qubits,
        gates: circuitToGates(),
        shots,
      })
      if (myRequestId !== requestIdRef.current) return // superseded by a newer edit
      setSimulationResult(response.data)
      setIsSimulating(false)
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return
      // Standalone Fallback: Compute exact quantum mechanics math locally
      const localResult = simulateLocalCircuit(qubits, circuitToGates(), shots)
      setSimulationResult(localResult)
      setIsSimulating(false)
    }
  }, [gates.length, qubits, shots, circuitToGates, setIsSimulating, setSimulationResult])

  return { runSimulation, circuitToGates, isSimulating, error, setError }
}

export default useSimulation