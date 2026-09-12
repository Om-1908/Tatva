import { create } from 'zustand'

export function buildCircuitGrid(qubits, gates, minSteps = 10) {
  const safeQubits = Math.max(1, Number(qubits) || 1)
  const numSteps = Math.max(minSteps, (gates || []).reduce((max, g) => Math.max(max, (g.step ?? 0) + 1), 0))
  const grid = Array.from({ length: safeQubits }, () => Array(numSteps).fill(null))

  if (Array.isArray(gates)) {
    gates.forEach((g) => {
      const step = g.step ?? 0
      const type = (g.gate || g.type || '').toUpperCase()
      const theta = g.theta

      if (type === 'CNOT' || type === 'CX') {
        const ctrl = g.control !== undefined ? g.control : (g.controlQubit ?? 0)
        const tgt = g.target !== undefined ? g.target : (g.targetQubit ?? (ctrl === 0 ? 1 : 0))
        if (ctrl < safeQubits && step < numSteps) {
          grid[ctrl][step] = {
            type: 'CNOT',
            controlQubit: ctrl,
            targetQubit: tgt,
          }
        }
        if (tgt < safeQubits && step < numSteps) {
          grid[tgt][step] = {
            type: 'CNOT_TARGET',
            controlQubit: ctrl,
            targetQubit: tgt,
          }
        }
      } else if (type === 'SWAP') {
        const q1 = g.control !== undefined ? g.control : (g.qubit ?? 0)
        const q2 = g.target !== undefined ? g.target : (g.swapQubit ?? (q1 === 0 ? 1 : 0))
        if (q1 < safeQubits && step < numSteps) {
          grid[q1][step] = {
            type: 'SWAP',
            qubit: q1,
            swapQubit: q2,
          }
        }
        if (q2 < safeQubits && step < numSteps) {
          grid[q2][step] = {
            type: 'SWAP',
            qubit: q1,
            swapQubit: q2,
          }
        }
      } else {
        const q = g.qubit ?? g.target ?? 0
        if (q < safeQubits && step < numSteps) {
          grid[q][step] = {
            type: g.gate || g.type,
            ...(theta !== undefined && { theta }),
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

  // Model comparison data (set when backend returns results)
  modelComparison: null,  // { winner: 'PPO'|'DQN', ppo: {...}, dqn: {...} }
  winnerModel: null,      // 'PPO' | 'DQN' | null
  isFallback: false,      // true when torch not available
  isPreset: false,        // true when resolved via exact canonical preset circuit

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
      modelComparison: null,
      winnerModel: null,
      isFallback: false,
      isPreset: false,
    }),

  setLogs: (newLogs) =>
    set({ logs: newLogs }),

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

  completeSynthesis: (finalFidelity, sequence = [], gates = [], numQubits = 1, modelComparison = null, isPreset = false) =>
    set((state) => {
      const qCount = Math.max(1, Number(numQubits) || state.synthesizedQubits || 1)
      const elapsed = state.startTime ? ((Date.now() - state.startTime) / 1000).toFixed(2) + 's' : '0.45s'
      const circuitGrid = buildCircuitGrid(qCount, gates)
      const presetActive = Boolean(isPreset || modelComparison?.is_preset)
      return {
        status: 'complete',
        currentFidelity: finalFidelity,
        bestFidelity: Math.max(state.bestFidelity, finalFidelity),
        gateCount: gates.length,
        timeTaken: elapsed,
        synthesizedGates: gates,
        synthesizedCircuit: circuitGrid,
        synthesizedQubits: qCount,
        modelComparison: modelComparison,
        winnerModel: modelComparison?.winner ?? null,
        isFallback: modelComparison?.fallback ?? false,
        isPreset: presetActive,
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
      modelComparison: null,
      winnerModel: null,
      isFallback: false,
      isPreset: false,
    }),

  toggleCollapsed: () =>
    set((state) => ({
      isCollapsed: !state.isCollapsed,
    })),
}))

export default useSynthesisStore
