import { create } from 'zustand'

export function buildCircuitGrid(qubits, gates, minSteps = 10) {
  const safeQubits = Math.max(1, Number(qubits) || 1)
  const numSteps = Math.max(minSteps, (gates || []).reduce((max, g) => Math.max(max, (g.step ?? 0) + 1), 0))
  const grid = Array.from({ length: safeQubits }, () => Array(numSteps).fill(null))

  if (Array.isArray(gates)) {
    gates.forEach((g) => {
      const q = g.qubit ?? g.target ?? 0
      const step = g.step ?? 0
      if (q < safeQubits && step < numSteps) {
        grid[q][step] = {
          type: g.gate || g.type,
          ...(g.theta !== undefined && { theta: g.theta }),
          ...(g.targetQubit !== undefined && g.targetQubit !== null && { targetQubit: g.targetQubit, controlQubit: q }),
          ...(g.controlQubit !== undefined && g.controlQubit !== null && { controlQubit: g.controlQubit, targetQubit: q }),
          ...(g.control !== undefined && { controlQubit: g.control, targetQubit: g.target ?? q }),
        }
        if ((g.gate === 'CNOT' || g.type === 'CNOT') && g.targetQubit !== undefined && g.targetQubit !== null && g.targetQubit < safeQubits) {
          grid[g.targetQubit][step] = {
            type: 'CNOT_TARGET',
            controlQubit: q,
            targetQubit: g.targetQubit,
          }
        }
      }
    })
  }
  return grid
}

const useSynthesisStore = create((set) => ({
  status: 'idle', // 'idle' | 'running' | 'complete'
  logs: [],
  currentFidelity: 0,
  bestFidelity: 0,
  episode: 0,
  gateCount: 0,
  panelVisible: false,
  startTime: null,
  timeTaken: null,
  synthesizedGates: [],
  synthesizedCircuit: [],
  synthesizedQubits: 1,
  isCollapsed: false,

  startSynthesis: (numQubits = 1) =>
    set({
      status: 'running',
      panelVisible: true,
      logs: [],
      currentFidelity: 0,
      bestFidelity: 0,
      episode: 0,
      gateCount: 0,
      startTime: Date.now(),
      timeTaken: null,
      synthesizedGates: [],
      synthesizedCircuit: [],
      synthesizedQubits: Math.max(1, Number(numQubits) || 1),
      isCollapsed: false,
    }),

  addLog: (entry, currentGates = []) =>
    set((state) => {
      const newLogs = [...state.logs, entry]
      const intermediateGates = currentGates && currentGates.length > 0 ? currentGates : state.synthesizedGates
      const circuitGrid = intermediateGates.length > 0 ? buildCircuitGrid(state.synthesizedQubits, intermediateGates) : state.synthesizedCircuit
      return {
        logs: newLogs,
        synthesizedGates: intermediateGates,
        synthesizedCircuit: circuitGrid,
        panelVisible: true,
      }
    }),

  updateMetrics: (fidelity, episode, gateCount) =>
    set((state) => ({
      currentFidelity: fidelity,
      bestFidelity: Math.max(state.bestFidelity, fidelity),
      episode,
      gateCount,
    })),

  completeSynthesis: (finalFidelity, sequence = [], gates = [], numQubits = 1) =>
    set((state) => {
      const qCount = Math.max(1, Number(numQubits) || state.synthesizedQubits || 1)
      const elapsed = state.startTime ? ((Date.now() - state.startTime) / 1000).toFixed(2) + 's' : '0.45s'
      const circuitGrid = buildCircuitGrid(qCount, gates)
      return {
        status: 'complete',
        currentFidelity: finalFidelity,
        bestFidelity: Math.max(state.bestFidelity, finalFidelity),
        gateCount: gates.length,
        timeTaken: elapsed,
        synthesizedGates: gates,
        synthesizedCircuit: circuitGrid,
        synthesizedQubits: qCount,
      }
    }),

  resetSynthesis: () =>
    set({
      status: 'idle',
      logs: [],
      currentFidelity: 0,
      bestFidelity: 0,
      episode: 0,
      gateCount: 0,
      panelVisible: false,
      startTime: null,
      timeTaken: null,
      synthesizedGates: [],
      synthesizedCircuit: [],
      isCollapsed: false,
    }),

  toggleCollapsed: () =>
    set((state) => ({
      isCollapsed: !state.isCollapsed,
    })),
}))

export default useSynthesisStore
