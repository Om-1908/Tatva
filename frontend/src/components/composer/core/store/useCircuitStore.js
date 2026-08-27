import { create } from 'zustand'
import { DEFAULT_SHOTS, isBlockType, blockExactTargets } from '../config/constants'
import { API_BASE_URL } from '../../../../config'

// Initialize empty circuit
const createEmptyCircuit = (qubits, steps) => {
  return Array(qubits).fill(null).map(() => Array(steps).fill(null))
}

// Minimal-gate RL / Quantum State Synthesizer for all 1, 2, 3, and 4-Qubit Presets
export function synthesizeOptimalCircuit(label, nQubits = 4) {
  const gates = []
  const cleanLabel = String(label || '').trim()
  const normLabel = cleanLabel.replace(/[\u2212]/g, '-')

  let currentStepMap = Array(nQubits).fill(0)
  const addGate = (type, q, props = {}) => {
    if (q >= nQubits) return
    const step = currentStepMap[q]
    gates.push({ id: `synth-${type}-${q}-${step}`, qubit: q, step, type, gate: type, ...props })
    currentStepMap[q] = step + 1
  }

  const addCNOT = (control, target) => {
    if (control >= nQubits || target >= nQubits) return
    const step = Math.max(currentStepMap[control], currentStepMap[target])
    gates.push({
      id: `synth-CNOT-${control}-${target}-${step}`,
      qubit: control,
      targetQubit: target,
      controlQubit: control,
      step,
      type: 'CNOT',
      gate: 'CNOT',
    })
    currentStepMap[control] = step + 1
    currentStepMap[target] = step + 1
  }

  // 1-Qubit Presets
  if (normLabel === '|0⟩') {
    // 0 gates
  } else if (normLabel === '|1⟩') {
    addGate('X', 0)
  } else if (normLabel === '|+⟩') {
    addGate('H', 0)
  } else if (normLabel === '|-⟩') {
    addGate('X', 0)
    addGate('H', 0)
  } else if (normLabel === '|i⟩') {
    addGate('H', 0)
    addGate('S', 0)
  } else if (normLabel === '|-i⟩') {
    addGate('X', 0)
    addGate('H', 0)
    addGate('S', 0)

    // 2-Qubit Presets
  } else if (normLabel === '|00⟩') {
    // 0 gates
  } else if (normLabel === '|01⟩') {
    addGate('X', 0)
  } else if (normLabel === '|10⟩') {
    addGate('X', 1)
  } else if (normLabel === '|11⟩') {
    addGate('X', 0)
    addGate('X', 1)
  } else if (normLabel === '|Φ+⟩') {
    // Bell state |00> + |11> (2 gates)
    addGate('H', 0)
    addCNOT(0, 1)
  } else if (normLabel === '|Φ-⟩') {
    // Bell state |00> - |11> (3 gates)
    addGate('X', 0)
    addGate('H', 0)
    addCNOT(0, 1)
  } else if (normLabel === '|Ψ+⟩') {
    // Bell state |01> + |10> (3 gates)
    addGate('H', 0)
    addCNOT(0, 1)
    addGate('X', 0)
  } else if (normLabel === '|Ψ-⟩') {
    // Bell state |01> - |10> (4 gates)
    addGate('X', 0)
    addGate('H', 0)
    addCNOT(0, 1)
    addGate('X', 0)
  } else if (normLabel === '|++⟩') {
    addGate('H', 0)
    addGate('H', 1)

    // 3-Qubit Presets
  } else if (normLabel === '|000⟩') {
    // 0 gates
  } else if (normLabel === '|001⟩') {
    addGate('X', 0)
  } else if (normLabel === '|010⟩') {
    addGate('X', 1)
  } else if (normLabel === '|011⟩') {
    addGate('X', 0)
    addGate('X', 1)
  } else if (normLabel === '|100⟩') {
    addGate('X', 2)
  } else if (normLabel === '|101⟩') {
    addGate('X', 0)
    addGate('X', 2)
  } else if (normLabel === '|110⟩') {
    addGate('X', 1)
    addGate('X', 2)
  } else if (normLabel === '|111⟩') {
    addGate('X', 0)
    addGate('X', 1)
    addGate('X', 2)
  } else if (normLabel === '|GHZ⟩') {
    // 3-qubit GHZ state (|000> + |111>)/sqrt(2) (3 gates)
    addGate('H', 0)
    addCNOT(0, 1)
    addCNOT(1, 2)
  } else if (normLabel === '|W⟩') {
    // 3-qubit W state (|001> + |010> + |100>)/sqrt(3)
    addGate('RY', 0, { theta: 1.9106 })
    addCNOT(0, 1)
    addCNOT(1, 2)
    addGate('X', 0)
  } else if (normLabel === '|+++⟩') {
    addGate('H', 0)
    addGate('H', 1)
    addGate('H', 2)

    // 4-Qubit Presets
  } else if (normLabel === '|0000⟩') {
    // 0 gates
  } else if (normLabel === '|0001⟩') {
    addGate('X', 0)
  } else if (normLabel === '|0010⟩') {
    addGate('X', 1)
  } else if (normLabel === '|0011⟩') {
    addGate('X', 0)
    addGate('X', 1)
  } else if (normLabel === '|0100⟩') {
    addGate('X', 2)
  } else if (normLabel === '|1111⟩') {
    addGate('X', 0)
    addGate('X', 1)
    addGate('X', 2)
    addGate('X', 3)
  } else if (normLabel === '|GHZ4⟩') {
    // 4-qubit GHZ state (|0000> + |1111>)/sqrt(2) (4 gates)
    addGate('H', 0)
    addCNOT(0, 1)
    addCNOT(1, 2)
    addCNOT(2, 3)
  } else if (normLabel === '|W4⟩') {
    // 4-qubit W state (5 gates)
    addGate('RY', 0, { theta: 1.5708 })
    addCNOT(0, 1)
    addCNOT(1, 2)
    addCNOT(2, 3)
    addGate('X', 0)
  } else if (normLabel === '|++++⟩') {
    addGate('H', 0)
    addGate('H', 1)
    addGate('H', 2)
    addGate('H', 3)
  } else if (normLabel === '|Φ+⊗Φ+⟩') {
    // Tensor product of two Bell pairs (4 gates)
    addGate('H', 0)
    addCNOT(0, 1)
    addGate('H', 2)
    addCNOT(2, 3)
  } else {
    // Generic binary string representation parsing (e.g. |0101>)
    const cleanBin = normLabel.replace(/[^01]/g, '')
    if (cleanBin.length > 0) {
      const len = cleanBin.length
      for (let k = 0; k < len; k++) {
        if (cleanBin[k] === '1') {
          const q = len - 1 - k
          if (q < nQubits) {
            addGate('X', q)
          }
        }
      }
    }
  }

  return gates
}

// -------- Theme helpers (dark default for TATVA platform) --------
const THEME_KEY = 'quantum-theme'

const readInitialTheme = () => {
  return 'dark'
}

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.add('dark')
}

// Apply immediately on module load so dark theme is preserved across TATVA.
const INITIAL_THEME = 'dark'
applyTheme(INITIAL_THEME)

const canonicalGateType = (rawType) => {
  const gateType = String(rawType || '').toUpperCase()
  const gateMap = {
    H: 'H',
    X: 'X',
    Y: 'Y',
    Z: 'Z',
    I: 'I',
    S: 'S',
    SDG: 'Sdg',
    T: 'T',
    TDG: 'Tdg',
    SX: 'SX',
    SXDG: 'SXdg',
    P: 'P',
    RX: 'RX',
    RY: 'RY',
    RZ: 'RZ',
    CNOT: 'CNOT',
    CCNOT: 'CCNOT',
    TOFFOLI: 'CCNOT',
    SWAP: 'SWAP',
    QFT: 'QFT',
    IQFT: 'IQFT',
    BELL_PHI_PLUS: 'BELL_PHI_PLUS',
    BELL_PHI_MINUS: 'BELL_PHI_MINUS',
    BELL_PSI_PLUS: 'BELL_PSI_PLUS',
    BELL_PSI_MINUS: 'BELL_PSI_MINUS',
    MEASURE: 'Measure',
    RESET: 'Reset',
    BARRIER: 'Barrier',
    '|': 'Barrier',
  }
  return gateMap[gateType] || gateType
}

const normalizeSingleCircuit = (payload) => {
  if (!payload) {
    throw new Error('No circuit data found')
  }

  // Supports wrapper: { data: { qubits, gates } }
  if (payload.data && typeof payload.data === 'object') {
    return normalizeSingleCircuit(payload.data)
  }

  const qubits = Number(payload.qubits)
  const gates = Array.isArray(payload.gates) ? payload.gates : []

  if (!Number.isInteger(qubits) || qubits < 1) {
    throw new Error('Invalid qubit count in circuit file')
  }

  return { qubits, gates }
}

const normalizeCircuitCollection = (payload) => {
  if (!payload) {
    throw new Error('No circuit data found')
  }

  if (Array.isArray(payload.circuits) && payload.circuits.length > 0) {
    return payload.circuits.map((entry, index) => {
      const normalized = normalizeSingleCircuit(entry?.data || entry)
      return {
        name: entry?.name || `Circuit ${index + 1}`,
        description: entry?.description || '',
        ...normalized,
      }
    })
  }

  const normalized = normalizeSingleCircuit(payload)
  return [
    {
      name: payload.name || 'Loaded Circuit',
      description: payload.description || '',
      ...normalized,
    },
  ]
}

const buildCircuitState = (parsedCircuit) => {
  const maxStep = parsedCircuit.gates.reduce((max, g) => Math.max(max, Number(g.step ?? 0)), 0)
  const steps = Math.max(14, maxStep + 1)

  const newCircuit = createEmptyCircuit(parsedCircuit.qubits, steps)
  const gates = []

  parsedCircuit.gates.forEach((g, idx) => {
    const qubit = Number.isInteger(g.qubit) ? g.qubit : Number(g.target)
    const step = Number(g.step ?? 0)

    if (!Number.isInteger(qubit) || qubit < 0 || qubit >= parsedCircuit.qubits) {
      return
    }

    if (!Number.isInteger(step) || step < 0 || step >= steps) {
      return
    }

    const gateType = canonicalGateType(g.type)
    if (!gateType) {
      return
    }

    const gate = {
      type: gateType,
      ...(g.controlQubit !== undefined && { controlQubit: Number(g.controlQubit) }),
      ...(g.control !== undefined && { controlQubit: Number(g.control) }),
      ...(g.controlQubit2 !== undefined && { controlQubit2: Number(g.controlQubit2) }),
      ...(g.control2 !== undefined && { controlQubit2: Number(g.control2) }),
      ...(g.swapQubit !== undefined && { swapQubit: Number(g.swapQubit) }),
      ...(g.swap_with !== undefined && { swapQubit: Number(g.swap_with) }),
      ...(Array.isArray(g.targets) && g.targets.length >= 2 && {
        targets: [...new Set(g.targets.map(Number))].sort((a, b) => a - b),
      }),
      ...(!Array.isArray(g.targets) && (g.partnerQubit !== undefined || g.qftQubit !== undefined) && {
        targets: [qubit, Number(g.partnerQubit ?? g.qftQubit)].sort((a, b) => a - b),
      }),
      ...(g.theta !== undefined && { theta: Number(g.theta) }),
      ...(g.angle !== undefined && { theta: Number(g.angle) }),
      ...(g.phase !== undefined && { theta: Number(g.phase) }),
    }

    if (gate.type === 'CNOT' && (!Number.isInteger(gate.controlQubit) || gate.controlQubit === qubit)) {
      return
    }

    if (
      gate.type === 'CCNOT' &&
      (!Number.isInteger(gate.controlQubit) ||
        !Number.isInteger(gate.controlQubit2) ||
        gate.controlQubit === qubit ||
        gate.controlQubit2 === qubit ||
        gate.controlQubit === gate.controlQubit2)
    ) {
      return
    }

    if (gate.type === 'SWAP' && (!Number.isInteger(gate.swapQubit) || gate.swapQubit === qubit)) {
      return
    }

    let anchorQubit = qubit
    if (isBlockType(gate.type)) {
      const targets = gate.targets
      const exact = blockExactTargets(gate.type)
      const contiguous = Array.isArray(targets) && targets.every((t, i) => i === 0 || t === targets[i - 1] + 1)
      const inRange =
        Array.isArray(targets) && targets.every((t) => Number.isInteger(t) && t >= 0 && t < parsedCircuit.qubits)
      const rightCount = Array.isArray(targets) && (exact ? targets.length === exact : targets.length >= 2)
      if (!Array.isArray(targets) || !rightCount || !contiguous || !inRange || !targets.includes(qubit)) {
        return
      }
      anchorQubit = targets[0]
    }

    newCircuit[anchorQubit][step] = gate
    gates.push({ id: g.id || `loaded-${idx}`, qubit: anchorQubit, step, ...gate })
  })

  return {
    qubits: parsedCircuit.qubits,
    steps,
    circuit: newCircuit,
    gates,
    simulationResult: null,
    history: [{ circuit: newCircuit, gates }],
    historyIndex: 0,
  }
}

export const useCircuitStore = create((set, get) => ({
  // State
  qubits: 4,
  steps: 14,
  shots: DEFAULT_SHOTS,
  circuit: createEmptyCircuit(4, 14),
  gates: [],
  // Target State Synthesis config
  targetStateLabel: '|0⟩',
  selectedState: '|0⟩',
  setSelectedState: (stateLabel) => set({ targetStateLabel: stateLabel, selectedState: stateLabel }),
  targetStatevector: [{ real: 1, imag: 0 }, { real: 0, imag: 0 }],
  setTargetState: (label, vector, numQubits) => {
    const nQ = Number(numQubits) || 4

    set((state) => ({
      qubits: nQ,
      targetStateLabel: label,
      targetStatevector: vector,
      selectedState: label,
    }))


    try {
      fetch(`${API_BASE_URL}/api/set-target`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qubits: nQ, target_state: label, statevector: vector }),
      }).catch(() => { })
    } catch (e) { }
  },
  setSynthesisResult: (gates, fidelity, gateCount) => {
    // Synthesis results are isolated in useSynthesisStore for the read-only section.
    // The editable validation composer is never auto-populated.
  },


  // Editor chrome
  circuitName: 'unnamed-Circuit',
  setCircuitName: (name) => set({ circuitName: name }),
  debugMode: false,
  toggleDebug: () => set((state) => ({ debugMode: !state.debugMode })),

  // Top-level view: 'editor' | 'templates' | 'about' | 'encode' (data encoding) | 'kernel' (quantum kernel) | 'shor' (period finding)
  view: 'editor',
  setView: (view) => set({ view }),

  // Real Tatva Quantum hardware-run modal (opened by the Run button).
  isHardwareModalOpen: false,
  openHardwareRun: () => set({ isHardwareModalOpen: true }),
  closeHardwareRun: () => set({ isHardwareModalOpen: false }),

  // Theme
  theme: INITIAL_THEME,
  toggleTheme: () =>
    set((state) => {
      const theme = state.theme === 'dark' ? 'light' : 'dark'
      applyTheme(theme)
      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme)
      return { theme }
    }),
  setTheme: (theme) =>
    set(() => {
      applyTheme(theme)
      if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme)
      return { theme }
    }),
  history: [],
  historyIndex: -1,
  circuitCollection: [],
  circuitCollectionIndex: 0,
  activeCircuitMeta: null,

  // AI Assistant state
  aiResponse: null,
  isAILoading: false,
  selectedGateForAI: null,
  explanationMode: null, // 'gate' | 'circuit' | 'step'
  isAIPanelOpen: false,
  aiError: null,
  beginnerMode: false,
  stepExplainMode: false,
  highlightedStep: null,

  // Actions
  setQubits: (qubits) =>
    set((state) => {
      const newCircuit = createEmptyCircuit(qubits, state.steps)
      // Copy existing gates where they fit
      for (let i = 0; i < Math.min(qubits, state.qubits); i++) {
        for (let j = 0; j < state.steps; j++) {
          if (state.circuit[i] && state.circuit[i][j]) {
            newCircuit[i][j] = state.circuit[i][j]
          }
        }
      }
      return { qubits, circuit: newCircuit }
    }),

  setSteps: (steps) =>
    set((state) => {
      const newCircuit = state.circuit.map((row) => [
        ...row,
        ...Array(Math.max(0, steps - row.length)).fill(null),
      ])
      return { steps, circuit: newCircuit.map((row) => row.slice(0, steps)) }
    }),

  addGate: (qubit, step, gate) => {
    set((state) => {
      const typeUpper = (gate.type || '').toUpperCase()

      if ((typeUpper === 'CNOT' || typeUpper === 'CX' || typeUpper === 'SWAP' || typeUpper === 'CZ') && state.qubits < 2) {
        return state
      }
      if ((typeUpper === 'CCNOT' || typeUpper === 'TOFFOLI') && state.qubits < 3) {
        return state
      }

      const newCircuit = state.circuit.map((row) => [...row])

      // Clear column step for any multi-qubit gate to prevent ghost/overlapping controls
      const clearColumn = (s) => {
        for (let q = 0; q < state.qubits; q++) {
          newCircuit[q][s] = null
        }
      }

      if (typeUpper === 'CNOT' || typeUpper === 'CX') {
        const ctrl = Number.isInteger(gate.controlQubit) ? gate.controlQubit : (qubit > 0 ? qubit - 1 : 1)
        const target = qubit
        if (ctrl === target || ctrl < 0 || ctrl >= state.qubits) return state

        clearColumn(step)

        newCircuit[ctrl][step] = { type: 'CNOT', controlQubit: ctrl, targetQubit: target, role: 'CONTROL' }
        newCircuit[target][step] = { type: 'CNOT', controlQubit: ctrl, targetQubit: target, role: 'TARGET' }

      } else if (typeUpper === 'CCNOT' || typeUpper === 'TOFFOLI') {
        const target = qubit
        let c1, c2
        if (target === 2) {
          c1 = 0
          c2 = 1
        } else if (target === 0) {
          c1 = 1
          c2 = 2
        } else if (target === 1) {
          c1 = 0
          c2 = 2
        } else {
          const candidates = Array.from({ length: state.qubits }, (_, i) => i).filter((i) => i !== target)
          c1 = candidates[0]
          c2 = candidates[1]
        }

        if (Number.isInteger(gate.controlQubit) && gate.controlQubit !== target) c1 = gate.controlQubit
        if (Number.isInteger(gate.controlQubit2) && gate.controlQubit2 !== target && gate.controlQubit2 !== c1) c2 = gate.controlQubit2

        if (c1 < 0 || c1 >= state.qubits || c2 < 0 || c2 >= state.qubits || c1 === target || c2 === target || c1 === c2) {
          return state
        }

        clearColumn(step)

        newCircuit[c1][step] = { type: 'CCNOT', controlQubit: c1, controlQubit2: c2, targetQubit: target, role: 'CONTROL' }
        newCircuit[c2][step] = { type: 'CCNOT', controlQubit: c1, controlQubit2: c2, targetQubit: target, role: 'CONTROL' }
        newCircuit[target][step] = { type: 'CCNOT', controlQubit: c1, controlQubit2: c2, targetQubit: target, role: 'TARGET' }

      } else if (typeUpper === 'SWAP') {
        const swapQ = Number.isInteger(gate.swapQubit) ? gate.swapQubit : (qubit > 0 ? qubit - 1 : 1)
        if (swapQ < 0 || swapQ >= state.qubits || swapQ === qubit) return state

        clearColumn(step)

        newCircuit[qubit][step] = { type: 'SWAP', qubit, swapQubit: swapQ, role: 'SWAP' }
        newCircuit[swapQ][step] = { type: 'SWAP', qubit: swapQ, swapQubit: qubit, role: 'SWAP' }

      } else if (typeUpper === 'CZ') {
        const ctrl = Number.isInteger(gate.controlQubit) ? gate.controlQubit : (qubit > 0 ? qubit - 1 : 1)
        const target = qubit
        if (ctrl === target || ctrl < 0 || ctrl >= state.qubits) return state

        clearColumn(step)

        newCircuit[ctrl][step] = { type: 'CZ', controlQubit: ctrl, targetQubit: target, role: 'CZ' }
        newCircuit[target][step] = { type: 'CZ', controlQubit: ctrl, targetQubit: target, role: 'CZ' }

      } else {
        newCircuit[qubit][step] = { ...gate }
      }

      // Rebuild flat gates list
      const flatGates = []
      for (let q = 0; q < state.qubits; q++) {
        for (let s = 0; s < state.steps; s++) {
          const g = newCircuit[q][s]
          if (g) {
            flatGates.push({ id: `${q}-${s}-${Date.now()}`, qubit: q, step: s, ...g })
          }
        }
      }

      return {
        circuit: newCircuit,
        gates: flatGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: flatGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  removeGate: (qubit, step) => {
    set((state) => {
      const g = state.circuit[qubit]?.[step]
      if (!g) return state

      const newCircuit = state.circuit.map((row) => [...row])
      const typeUpper = (g.type || '').toUpperCase()

      if (typeUpper === 'CNOT' || typeUpper === 'CX') {
        const c = g.controlQubit ?? (qubit > 0 ? qubit - 1 : 1)
        const t = g.targetQubit ?? qubit
        if (newCircuit[c]) newCircuit[c][step] = null
        if (newCircuit[t]) newCircuit[t][step] = null
      } else if (typeUpper === 'CCNOT' || typeUpper === 'TOFFOLI') {
        const c1 = g.controlQubit ?? 0
        const c2 = g.controlQubit2 ?? 1
        const t = g.targetQubit ?? qubit
        if (newCircuit[c1]) newCircuit[c1][step] = null
        if (newCircuit[c2]) newCircuit[c2][step] = null
        if (newCircuit[t]) newCircuit[t][step] = null
      } else if (typeUpper === 'SWAP') {
        const q1 = g.qubit ?? qubit
        const q2 = g.swapQubit ?? (q1 > 0 ? q1 - 1 : 1)
        if (newCircuit[q1]) newCircuit[q1][step] = null
        if (newCircuit[q2]) newCircuit[q2][step] = null
      } else if (typeUpper === 'CZ') {
        const c = g.controlQubit ?? (qubit > 0 ? qubit - 1 : 1)
        const t = g.targetQubit ?? qubit
        if (newCircuit[c]) newCircuit[c][step] = null
        if (newCircuit[t]) newCircuit[t][step] = null
      } else {
        newCircuit[qubit][step] = null
      }

      const flatGates = []
      for (let q = 0; q < state.qubits; q++) {
        for (let s = 0; s < state.steps; s++) {
          const cellG = newCircuit[q][s]
          if (cellG) {
            flatGates.push({ id: `${q}-${s}-${Date.now()}`, qubit: q, step: s, ...cellG })
          }
        }
      }

      return {
        circuit: newCircuit,
        gates: flatGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: flatGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  moveGate: (fromQubit, fromStep, toQubit, toStep) => {
    set((state) => {
      const g = state.circuit[fromQubit]?.[fromStep]
      if (!g) return state

      // 1. Remove old gate from fromQubit, fromStep
      const typeUpper = (g.type || '').toUpperCase()
      const newCircuit = state.circuit.map((row) => [...row])

      if (typeUpper === 'CNOT' || typeUpper === 'CX') {
        const c = g.controlQubit ?? (fromQubit > 0 ? fromQubit - 1 : 1)
        const t = g.targetQubit ?? fromQubit
        if (newCircuit[c]) newCircuit[c][fromStep] = null
        if (newCircuit[t]) newCircuit[t][fromStep] = null
      } else if (typeUpper === 'CCNOT' || typeUpper === 'TOFFOLI') {
        const c1 = g.controlQubit ?? 0
        const c2 = g.controlQubit2 ?? 1
        const t = g.targetQubit ?? fromQubit
        if (newCircuit[c1]) newCircuit[c1][fromStep] = null
        if (newCircuit[c2]) newCircuit[c2][fromStep] = null
        if (newCircuit[t]) newCircuit[t][fromStep] = null
      } else if (typeUpper === 'SWAP') {
        const q1 = g.qubit ?? fromQubit
        const q2 = g.swapQubit ?? (q1 > 0 ? q1 - 1 : 1)
        if (newCircuit[q1]) newCircuit[q1][fromStep] = null
        if (newCircuit[q2]) newCircuit[q2][fromStep] = null
      } else if (typeUpper === 'CZ') {
        const c = g.controlQubit ?? (fromQubit > 0 ? fromQubit - 1 : 1)
        const t = g.targetQubit ?? fromQubit
        if (newCircuit[c]) newCircuit[c][fromStep] = null
        if (newCircuit[t]) newCircuit[t][fromStep] = null
      } else {
        newCircuit[fromQubit][fromStep] = null
      }

      // Add gate to toQubit, toStep
      if (typeUpper === 'CNOT' || typeUpper === 'CX') {
        const ctrlOffset = (g.controlQubit ?? (fromQubit > 0 ? fromQubit - 1 : 1)) - fromQubit
        const newCtrl = Math.max(0, Math.min(state.qubits - 1, toQubit + ctrlOffset))
        if (newCtrl !== toQubit) {
          newCircuit[newCtrl][toStep] = { type: 'CNOT', controlQubit: newCtrl, targetQubit: toQubit, role: 'CONTROL' }
          newCircuit[toQubit][toStep] = { type: 'CNOT', controlQubit: newCtrl, targetQubit: toQubit, role: 'TARGET' }
        } else {
          newCircuit[toQubit][toStep] = { ...g }
        }
      } else if (typeUpper === 'SWAP') {
        const swapOffset = (g.swapQubit ?? (fromQubit > 0 ? fromQubit - 1 : 1)) - fromQubit
        const newSwap = Math.max(0, Math.min(state.qubits - 1, toQubit + swapOffset))
        if (newSwap !== toQubit) {
          newCircuit[toQubit][toStep] = { type: 'SWAP', qubit: toQubit, swapQubit: newSwap, role: 'SWAP' }
          newCircuit[newSwap][toStep] = { type: 'SWAP', qubit: newSwap, swapQubit: toQubit, role: 'SWAP' }
        } else {
          newCircuit[toQubit][toStep] = { ...g }
        }
      } else {
        newCircuit[toQubit][toStep] = { ...g }
      }

      const flatGates = []
      for (let q = 0; q < state.qubits; q++) {
        for (let s = 0; s < state.steps; s++) {
          const cellG = newCircuit[q][s]
          if (cellG) {
            flatGates.push({ id: `${q}-${s}-${Date.now()}`, qubit: q, step: s, ...cellG })
          }
        }
      }

      return {
        circuit: newCircuit,
        gates: flatGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: flatGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  // Reassign a multi-qubit gate's control/partner wire (drag-control-point UX).
  // role: 'control' -> controlQubit, 'control2' -> controlQubit2, 'swap' -> swapQubit
  setGateControl: (target, step, role, newWire) => {
    set((state) => {
      const gate = state.circuit[target]?.[step]
      if (!gate) return state
      if (!Number.isInteger(newWire) || newWire < 0 || newWire >= state.qubits || newWire === target) {
        return state
      }

      const fieldByRole = { control: 'controlQubit', control2: 'controlQubit2', swap: 'swapQubit' }
      const field = fieldByRole[role]
      if (!field) return state

      // Prevent the two controls of a Toffoli from colliding.
      if (role === 'control' && gate.controlQubit2 === newWire) return state
      if (role === 'control2' && gate.controlQubit === newWire) return state

      const updatedGate = { ...gate, [field]: newWire }
      const newCircuit = state.circuit.map((row) => [...row])
      newCircuit[target][step] = updatedGate

      const newGates = state.gates.map((g) =>
        g.qubit === target && g.step === step ? { ...g, [field]: newWire } : g
      )

      return {
        circuit: newCircuit,
        gates: newGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: newGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  // Replace a block gate's (QFT/IQFT/Bell) target qubits (Edit Gate modal).
  // `anchorQubit` is wherever the gate currently lives; newTargets must be
  // distinct, in-range, contiguous, and match the block's required count
  // (exactly 2 for Bell, 2+ for QFT) — the gate is re-anchored at the lowest.
  setGateTargets: (anchorQubit, step, newTargets) => {
    set((state) => {
      const gate = state.circuit[anchorQubit]?.[step]
      if (!gate || !isBlockType(gate.type)) return state

      const targets = [...new Set((newTargets || []).map(Number))].sort((a, b) => a - b)
      const exact = blockExactTargets(gate.type)
      const inRange = targets.every((t) => Number.isInteger(t) && t >= 0 && t < state.qubits)
      const contiguous = targets.every((t, i) => i === 0 || t === targets[i - 1] + 1)
      const rightCount = exact ? targets.length === exact : targets.length >= 2

      if (!rightCount || !inRange || !contiguous) {
        return state
      }

      const newAnchor = targets[0]
      const updatedGate = { type: gate.type, targets }
      const newCircuit = state.circuit.map((row) => [...row])
      newCircuit[anchorQubit][step] = null
      newCircuit[newAnchor][step] = updatedGate

      const newGates = [
        ...state.gates.filter((g) => !(g.qubit === anchorQubit && g.step === step)),
        { id: `${newAnchor}-${step}-${Date.now()}`, qubit: newAnchor, step, ...updatedGate },
      ]

      return {
        circuit: newCircuit,
        gates: newGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: newGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  // Replace a CNOT/CCNOT's target qubit and control qubit(s) (Edit Gate
  // modal). `anchorQubit` is wherever the gate currently lives (its target
  // row); the gate is re-anchored at the new target.
  setControlGateConfig: (anchorQubit, step, { target, controls }) => {
    set((state) => {
      const gate = state.circuit[anchorQubit]?.[step]
      if (!gate || (gate.type !== 'CNOT' && gate.type !== 'CCNOT')) return state

      const needed = gate.type === 'CCNOT' ? 2 : 1
      const ctrls = [...new Set((controls || []).map(Number))]
      const t = Number(target)

      const inRange = Number.isInteger(t) && t >= 0 && t < state.qubits
      const ctrlsValid =
        ctrls.length === needed && ctrls.every((c) => Number.isInteger(c) && c >= 0 && c < state.qubits && c !== t)

      if (!inRange || !ctrlsValid) return state

      const updatedGate =
        gate.type === 'CCNOT'
          ? { type: 'CCNOT', controlQubit: ctrls[0], controlQubit2: ctrls[1] }
          : { type: 'CNOT', controlQubit: ctrls[0] }

      const newCircuit = state.circuit.map((row) => [...row])
      newCircuit[anchorQubit][step] = null
      newCircuit[t][step] = updatedGate

      const newGates = [
        ...state.gates.filter((g) => !(g.qubit === anchorQubit && g.step === step)),
        { id: `${t}-${step}-${Date.now()}`, qubit: t, step, ...updatedGate },
      ]

      return {
        circuit: newCircuit,
        gates: newGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: newGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  // Duplicate a placed gate (toolbar copy action) into the next step where
  // every wire it touches is free — keeps the same role fields (controls,
  // swap partner, QFT targets, theta, ...) exactly as-is, just moved later
  // in time. No-ops if no free slot is found within the visible grid.
  duplicateGate: (qubit, step) => {
    set((state) => {
      const gate = state.circuit[qubit]?.[step]
      if (!gate) return state

      const rows =
        gate.type === 'CCNOT'
          ? [qubit, gate.controlQubit, gate.controlQubit2]
          : gate.type === 'CNOT'
            ? [qubit, gate.controlQubit]
            : gate.type === 'SWAP'
              ? [qubit, gate.swapQubit]
              : isBlockType(gate.type)
                ? gate.targets
                : [qubit]

      if (rows.some((r) => !Number.isInteger(r) || r < 0 || r >= state.qubits)) return state

      const maxStep = state.steps + rows.length + 5
      let targetStep = null
      for (let s = step + 1; s <= maxStep; s++) {
        if (rows.every((r) => !state.circuit[r][s])) {
          targetStep = s
          break
        }
      }
      if (targetStep === null) return state

      const newCircuit = state.circuit.map((row) => {
        const copy = [...row]
        while (copy.length <= targetStep) copy.push(null)
        return copy
      })
      const anchorRow = isBlockType(gate.type) ? Math.min(...rows) : qubit
      newCircuit[anchorRow][targetStep] = { ...gate }

      const newGates = [
        ...state.gates,
        { id: `${anchorRow}-${targetStep}-${Date.now()}`, qubit: anchorRow, step: targetStep, ...gate },
      ]

      return {
        circuit: newCircuit,
        steps: Math.max(state.steps, targetStep + 1),
        gates: newGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: newGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  // Update an angle-gate's theta in place (inline popover UX).
  setGateTheta: (target, step, theta) => {
    set((state) => {
      const gate = state.circuit[target]?.[step]
      if (!gate || !Number.isFinite(theta)) return state
      const updatedGate = { ...gate, theta }
      const newCircuit = state.circuit.map((row) => [...row])
      newCircuit[target][step] = updatedGate
      const newGates = state.gates.map((g) =>
        g.qubit === target && g.step === step ? { ...g, theta } : g
      )
      return {
        circuit: newCircuit,
        gates: newGates,
        history: [
          ...state.history.slice(0, state.historyIndex + 1),
          { circuit: newCircuit, gates: newGates },
        ],
        historyIndex: state.historyIndex + 1,
      }
    })
  },

  setShots: (shots) => set({ shots }),
  setSimulationResult: (result) => set({ simulationResult: result, isSimulating: false }),
  setIsSimulating: (isSimulating) => set({ isSimulating }),
  setSelectedQubit: (qubit) => set({ selectedQubit: qubit }),

  resetCircuit: () => {
    set((state) => {
      const newCircuit = createEmptyCircuit(state.qubits, state.steps)
      return {
        circuit: newCircuit,
        gates: [],
        simulationResult: null,
        history: [{ circuit: newCircuit, gates: [] }],
        historyIndex: 0,
      }
    })
  },

  undo: () => {
    set((state) => {
      if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1
        const { circuit, gates } = state.history[newIndex]
        return {
          circuit,
          gates,
          historyIndex: newIndex,
        }
      }
      return state
    })
  },

  redo: () => {
    set((state) => {
      if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1
        const { circuit, gates } = state.history[newIndex]
        return {
          circuit,
          gates,
          historyIndex: newIndex,
        }
      }
      return state
    })
  },

  saveCircuit: (customName) => {
    const state = get()
    const circuitName = customName || state.circuitName || `Quantum Circuit (${state.qubits}Q)`

    const gatesList = state.gates || []
    const gatesCount = gatesList.length
    const depth = gatesList.length > 0 ? Math.max(...gatesList.map((g) => (g.step ?? g.col ?? 0))) + 1 : 1

    const newCircuit = {
      id: `circ-${Date.now()}`,
      name: circuitName,
      qubits: state.qubits,
      type: 'Manual',
      fidelity: 99.5,
      gatesCount: gatesCount,
      depth: depth,
      date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' • ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      gates: gatesList,
    }

    // 1. Save to Local Storage (tatva_saved_circuits)
    try {
      const saved = localStorage.getItem('tatva_saved_circuits')
      let existingCircuits = saved ? JSON.parse(saved) : []

      const index = existingCircuits.findIndex((c) => c.name === newCircuit.name)
      if (index >= 0) {
        existingCircuits[index] = { ...existingCircuits[index], ...newCircuit, updatedAt: Date.now() }
      } else {
        existingCircuits = [newCircuit, ...existingCircuits]
      }
      localStorage.setItem('tatva_saved_circuits', JSON.stringify(existingCircuits))
    } catch (e) {
      console.error('LocalStorage save error:', e)
    }

    // 2. Save to MongoDB Atlas API
    fetch(`${API_BASE_URL}/api/db/circuits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCircuit),
    }).catch((e) => console.warn('MongoDB Atlas save error:', e))

    return newCircuit
  },

  loadCircuit: (data) => {
    set(() => {
      const collection = normalizeCircuitCollection(data)
      const first = collection[0]
      const firstState = buildCircuitState(first)

      return {
        ...firstState,
        circuitCollection: collection,
        circuitCollectionIndex: 0,
        activeCircuitMeta: {
          name: first.name,
          description: first.description,
        },
      }
    })
  },

  goToLoadedCircuitIndex: (index) => {
    set((state) => {
      if (!state.circuitCollection.length) {
        return state
      }

      const safeIndex = Math.max(0, Math.min(index, state.circuitCollection.length - 1))
      const selected = state.circuitCollection[safeIndex]
      const selectedState = buildCircuitState(selected)

      return {
        ...selectedState,
        circuitCollectionIndex: safeIndex,
        activeCircuitMeta: {
          name: selected.name,
          description: selected.description,
        },
      }
    })
  },

  goToNextLoadedCircuit: () => {
    const state = get()
    if (state.circuitCollectionIndex < state.circuitCollection.length - 1) {
      state.goToLoadedCircuitIndex(state.circuitCollectionIndex + 1)
    }
  },

  goToPreviousLoadedCircuit: () => {
    const state = get()
    if (state.circuitCollectionIndex > 0) {
      state.goToLoadedCircuitIndex(state.circuitCollectionIndex - 1)
    }
  },

  // -------------------------------------------------------------------------
  // AI Assistant actions
  // -------------------------------------------------------------------------

  setAIResponse: (response) => set({ aiResponse: response }),
  setAILoading: (loading) => set({ isAILoading: loading }),
  setAIError: (error) => set({ aiError: error }),

  setSelectedGateForAI: (gate) => set({ selectedGateForAI: gate }),
  setExplanationMode: (mode) => set({ explanationMode: mode }),

  setAIPanelOpen: (open) => set({ isAIPanelOpen: open }),
  toggleAIPanel: () => set((state) => ({ isAIPanelOpen: !state.isAIPanelOpen })),

  toggleBeginnerMode: () => set((state) => ({ beginnerMode: !state.beginnerMode })),
  setBeginnerMode: (on) => set({ beginnerMode: on }),

  setStepExplainMode: (on) => set({ stepExplainMode: on }),
  toggleStepExplainMode: () => set((state) => ({ stepExplainMode: !state.stepExplainMode })),

  setHighlightedStep: (step) => set({ highlightedStep: step }),

  clearAIResponse: () =>
    set({
      aiResponse: null,
      aiError: null,
      selectedGateForAI: null,
      explanationMode: null,
      highlightedStep: null,
    }),
}))